import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { RedditClientConfig } from "../../types"
import { RedditClient } from "../reddit-client"

// Store original fetch
const originalFetch = global.fetch

describe("RedditClient", () => {
  // eslint-disable-next-line functional/no-let
  let client: RedditClient
  const mockConfig: RedditClientConfig = {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    userAgent: "TestApp/1.0.0",
    username: "testuser",
    password: "testpass",
  }

  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    // eslint-disable-next-line functional/immutable-data
    global.fetch = mockFetch
    client = new RedditClient(mockConfig)
  })

  afterEach(() => {
    // eslint-disable-next-line functional/immutable-data
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe("authenticate", () => {
    it("should authenticate with user credentials", async () => {
      const mockTokenResponse = {
        access_token: "test-token",
        expires_in: 3600,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      })

      const result = await client.authenticate()
      expect(result.isRight()).toBe(true)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.reddit.com/api/v1/access_token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "User-Agent": mockConfig.userAgent,
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: expect.stringContaining("Basic "),
          }),
          body: expect.any(String),
        }),
      )

      const callArgs = mockFetch.mock.calls[0]
      const body = new URLSearchParams(callArgs[1].body as string)
      expect(body.get("grant_type")).toBe("password")
      expect(body.get("username")).toBe("testuser")
      expect(body.get("password")).toBe("testpass")
    })

    it("should authenticate with client credentials only when no username/password", async () => {
      const configWithoutUser: RedditClientConfig = {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        userAgent: "TestApp/1.0.0",
      }

      const clientReadOnly = new RedditClient(configWithoutUser)
      const mockTokenResponse = {
        access_token: "test-token-readonly",
        expires_in: 3600,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      })

      const result = await clientReadOnly.authenticate()
      expect(result.isRight()).toBe(true)

      const callArgs = mockFetch.mock.calls[0]
      const body = new URLSearchParams(callArgs[1].body as string)
      expect(body.get("grant_type")).toBe("client_credentials")
      expect(body.get("username")).toBeNull()
      expect(body.get("password")).toBeNull()
    })

    it("should not re-authenticate if token is still valid", async () => {
      const mockTokenResponse = {
        access_token: "test-token",
        expires_in: 3600,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      })

      // First authentication
      const result1 = await client.authenticate()
      expect(result1.isRight()).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second authentication should not make another request
      const result2 = await client.authenticate()
      expect(result2.isRight()).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("should return Left on authentication failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      })

      const result = await client.authenticate()
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Authentication failed: 401")
      }
    })
  })

  describe("getUser", () => {
    it("should fetch user information", async () => {
      const mockUserData = {
        data: {
          name: "testuser",
          id: "123",
          comment_karma: 100,
          link_karma: 200,
          is_mod: false,
          is_gold: true,
          is_employee: false,
          created_utc: 1234567890,
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock user request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserData,
      })

      const result = await client.getUser("testuser")

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://oauth.reddit.com/user/testuser/about.json",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      )

      expect(result.isRight()).toBe(true)
      const user = result.orThrow()
      expect(user).toEqual({
        name: "testuser",
        id: "123",
        commentKarma: 100,
        linkKarma: 200,
        totalKarma: 300,
        isMod: false,
        isGold: true,
        isEmployee: false,
        createdUtc: 1234567890,
        profileUrl: "https://reddit.com/user/testuser",
      })
    })

    it("should return Left when user fetch fails", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock failed user request
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await client.getUser("testuser")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Failed to get user info for testuser")
      }
    })
  })

  describe("getSubredditInfo", () => {
    it("should fetch subreddit information", async () => {
      const mockSubredditData = {
        data: {
          display_name: "programming",
          title: "Programming",
          description: "A subreddit for programming",
          public_description: "Public description",
          subscribers: 1000000,
          active_user_count: 5000,
          created_utc: 1234567890,
          over18: false,
          subreddit_type: "public",
          url: "/r/programming/",
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock subreddit request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubredditData,
      })

      const result = await client.getSubredditInfo("programming")

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://oauth.reddit.com/r/programming/about.json",
        expect.any(Object),
      )

      expect(result.isRight()).toBe(true)
      const subreddit = result.orThrow()
      expect(subreddit.displayName).toBe("programming")
      expect(subreddit.subscribers).toBe(1000000)
    })
  })

  describe("getTopPosts", () => {
    it("should fetch top posts from a subreddit", async () => {
      const mockPostsData = {
        data: {
          children: [
            {
              kind: "t3",
              data: {
                id: "post1",
                title: "Test Post 1",
                author: "author1",
                subreddit: "programming",
                selftext: "Post content",
                url: "https://reddit.com/r/programming/post1",
                score: 100,
                upvote_ratio: 0.95,
                num_comments: 50,
                created_utc: 1234567890,
                over_18: false,
                spoiler: false,
                edited: false,
                is_self: true,
                link_flair_text: null,
                permalink: "/r/programming/comments/post1/",
              },
            },
          ],
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock posts request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPostsData,
      })

      const result = await client.getTopPosts("programming", "week", 10)

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("/r/programming/top.json?"),
        expect.any(Object),
      )

      const lastCallUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastCallUrl).toContain("t=week")
      expect(lastCallUrl).toContain("limit=10")

      expect(result.isRight()).toBe(true)
      const posts = result.orThrow()
      expect(posts).toHaveLength(1)
      expect(posts[0].id).toBe("post1")
      expect(posts[0].title).toBe("Test Post 1")
    })

    it("should fetch top posts from home when no subreddit specified", async () => {
      const mockPostsData = {
        data: {
          children: [],
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock posts request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPostsData,
      })

      await client.getTopPosts("", "day", 5)

      const lastCallUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastCallUrl).toContain("/top.json?")
      expect(lastCallUrl).toContain("t=day")
      expect(lastCallUrl).toContain("limit=5")
    })
  })

  describe("createPost", () => {
    it("should create a new post", async () => {
      // With api_type=json, response is wrapped in json object
      const mockSubmitResponse = {
        json: {
          data: {
            id: "newpost123",
          },
          errors: [],
        },
      }

      // Mock post data in /r/subreddit/comments/{id}.json format
      const mockPostData = [
        {
          data: {
            children: [
              {
                data: {
                  id: "newpost123",
                  title: "My New Post",
                  author: "testuser",
                  subreddit: "test",
                  selftext: "Post content",
                  url: "https://reddit.com/r/test/newpost123",
                  score: 1,
                  upvote_ratio: 1,
                  num_comments: 0,
                  created_utc: Date.now() / 1000,
                  over_18: false,
                  spoiler: false,
                  edited: false,
                  is_self: true,
                  link_flair_text: null,
                  permalink: "/r/test/comments/newpost123/",
                },
              },
            ],
          },
        },
      ]

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock submit request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubmitResponse,
      })

      // Mock get post request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPostData,
      })

      const result = await client.createPost("test", "My New Post", "Post content")

      // Check submit call
      const submitCall = mockFetch.mock.calls[1]
      expect(submitCall[0]).toBe("https://oauth.reddit.com/api/submit")
      expect(submitCall[1].method).toBe("POST")

      const body = new URLSearchParams(submitCall[1].body as string)
      expect(body.get("sr")).toBe("test")
      expect(body.get("kind")).toBe("self")
      expect(body.get("title")).toBe("My New Post")
      expect(body.get("text")).toBe("Post content")
      expect(body.get("api_type")).toBe("json")

      expect(result.isRight()).toBe(true)
      const post = result.orThrow()
      expect(post.id).toBe("newpost123")
      expect(post.title).toBe("My New Post")
    })

    it("should return Left when user is not authenticated for write", async () => {
      const clientReadOnly = new RedditClient({
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        userAgent: "TestApp/1.0.0",
      })

      const result = await clientReadOnly.createPost("test", "Title", "Content")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Write operations require REDDIT_USERNAME and REDDIT_PASSWORD")
      }
    })
  })

  describe("replyToPost", () => {
    it("should reply to an existing post", async () => {
      const mockCheckResponse = {
        data: {
          children: [{ data: { id: "post123" } }],
        },
      }

      const mockCommentResponse = {
        json: {
          data: {
            things: [
              {
                data: {
                  id: "comment123",
                  subreddit: "test",
                  link_title: "Original Post Title",
                  permalink: "/r/test/comments/post123/comment123",
                },
              },
            ],
          },
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock check post exists
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCheckResponse,
      })

      // Mock comment submission
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentResponse,
      })

      const result = await client.replyToPost("post123", "Great post!")

      // Check the comment submission call
      const commentCall = mockFetch.mock.calls[2]
      expect(commentCall[0]).toBe("https://oauth.reddit.com/api/comment")
      expect(commentCall[1].method).toBe("POST")

      const body = new URLSearchParams(commentCall[1].body as string)
      expect(body.get("thing_id")).toBe("t3_post123")
      expect(body.get("text")).toBe("Great post!")
      expect(body.get("api_type")).toBe("json")

      expect(result.isRight()).toBe(true)
      const comment = result.orThrow()
      expect(comment.id).toBe("comment123")
      expect(comment.body).toBe("Great post!")
      expect(comment.author).toBe("testuser")
    })

    it("should return Left when post does not exist", async () => {
      const mockCheckResponse = {
        data: {
          children: [],
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock check post exists (empty response)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCheckResponse,
      })

      const result = await client.replyToPost("nonexistent", "Comment")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Post with ID nonexistent does not exist or is not accessible")
      }
    })

    it("should not double-prefix t3_ post IDs", async () => {
      const mockCheckResponse = {
        data: {
          children: [{ data: { id: "post123" } }],
        },
      }

      const mockCommentResponse = {
        json: {
          data: {
            things: [
              {
                data: {
                  id: "comment456",
                  subreddit: "test",
                  link_title: "Test Post",
                  permalink: "/r/test/comments/post123/comment456",
                },
              },
            ],
          },
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock check post exists
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCheckResponse,
      })

      // Mock comment submission
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentResponse,
      })

      await client.replyToPost("t3_post123", "Reply text")

      const commentCall = mockFetch.mock.calls[2]
      const body = new URLSearchParams(commentCall[1].body as string)
      expect(body.get("thing_id")).toBe("t3_post123")
    })

    it("should pass through t1_ comment IDs for comment replies", async () => {
      const mockCommentResponse = {
        json: {
          data: {
            things: [
              {
                data: {
                  id: "reply789",
                  subreddit: "test",
                  link_title: "Test Post",
                  permalink: "/r/test/comments/post123/reply789",
                },
              },
            ],
          },
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock comment submission (no checkPostExists for t1_)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentResponse,
      })

      const result = await client.replyToPost("t1_comment123", "Reply to comment")

      // Should only have 2 fetch calls: auth + comment (no checkPostExists)
      expect(mockFetch).toHaveBeenCalledTimes(2)

      const commentCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(commentCall[1].body as string)
      expect(body.get("thing_id")).toBe("t1_comment123")

      expect(result.isRight()).toBe(true)
    })

    it("should add t3_ prefix to bare post IDs", async () => {
      const mockCheckResponse = {
        data: {
          children: [{ data: { id: "post123" } }],
        },
      }

      const mockCommentResponse = {
        json: {
          data: {
            things: [
              {
                data: {
                  id: "comment456",
                  subreddit: "test",
                  link_title: "Test Post",
                  permalink: "/r/test/comments/post123/comment456",
                },
              },
            ],
          },
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock check post exists
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCheckResponse,
      })

      // Mock comment submission
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentResponse,
      })

      await client.replyToPost("post123", "Reply text")

      const commentCall = mockFetch.mock.calls[2]
      const body = new URLSearchParams(commentCall[1].body as string)
      expect(body.get("thing_id")).toBe("t3_post123")
    })

    it("should skip existence check for t1_ comment IDs", async () => {
      const mockCommentResponse = {
        json: {
          data: {
            things: [
              {
                data: {
                  id: "reply789",
                  subreddit: "test",
                  link_title: "Test Post",
                  permalink: "/r/test/comments/post123/reply789",
                },
              },
            ],
          },
        },
      }

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock comment submission only (no existence check)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommentResponse,
      })

      const result = await client.replyToPost("t1_abc123", "Nested reply")

      // Verify only 2 fetch calls: auth + comment API (no /api/info.json call)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.isRight()).toBe(true)
      const comment = result.orThrow()
      expect(comment.id).toBe("reply789")
    })
  })

  describe("deletePost", () => {
    it("should delete a post", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock delete request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      })

      const result = await client.deletePost("post123")

      // Check the delete call
      const deleteCall = mockFetch.mock.calls[1]
      expect(deleteCall[0]).toBe("https://oauth.reddit.com/api/del")
      expect(deleteCall[1].method).toBe("POST")

      const body = new URLSearchParams(deleteCall[1].body as string)
      expect(body.get("id")).toBe("t3_post123")

      expect(result.isRight()).toBe(true)
      expect(result.orThrow()).toBe(true)
    })

    it("should handle post ID with t3_ prefix", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock delete request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      })

      const result = await client.deletePost("t3_post123")
      expect(result.isRight()).toBe(true)

      const deleteCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(deleteCall[1].body as string)
      expect(body.get("id")).toBe("t3_post123")
    })

    it("should return Left when user is not authenticated for write", async () => {
      const clientReadOnly = new RedditClient({
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        userAgent: "TestApp/1.0.0",
      })

      const result = await clientReadOnly.deletePost("post123")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Write operations require REDDIT_USERNAME and REDDIT_PASSWORD")
      }
    })
  })

  describe("deleteComment", () => {
    it("should delete a comment", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock delete request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      })

      const result = await client.deleteComment("comment123")

      // Check the delete call
      const deleteCall = mockFetch.mock.calls[1]
      expect(deleteCall[0]).toBe("https://oauth.reddit.com/api/del")
      expect(deleteCall[1].method).toBe("POST")

      const body = new URLSearchParams(deleteCall[1].body as string)
      expect(body.get("id")).toBe("t1_comment123")

      expect(result.isRight()).toBe(true)
      expect(result.orThrow()).toBe(true)
    })

    it("should handle comment ID with t1_ prefix", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock delete request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "",
      })

      const result = await client.deleteComment("t1_comment123")
      expect(result.isRight()).toBe(true)

      const deleteCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(deleteCall[1].body as string)
      expect(body.get("id")).toBe("t1_comment123")
    })
  })

  describe("editPost", () => {
    it("should edit a post", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock edit request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ json: { errors: [] } }),
      })

      const result = await client.editPost("post123", "Updated content")

      // Check the edit call
      const editCall = mockFetch.mock.calls[1]
      expect(editCall[0]).toBe("https://oauth.reddit.com/api/editusertext")
      expect(editCall[1].method).toBe("POST")

      const body = new URLSearchParams(editCall[1].body as string)
      expect(body.get("thing_id")).toBe("t3_post123")
      expect(body.get("text")).toBe("Updated content")
      expect(body.get("api_type")).toBe("json")

      expect(result.isRight()).toBe(true)
      expect(result.orThrow()).toBe(true)
    })

    it("should handle post ID with t3_ prefix", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock edit request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ json: { errors: [] } }),
      })

      const result = await client.editPost("t3_post123", "Updated content")
      expect(result.isRight()).toBe(true)

      const editCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(editCall[1].body as string)
      expect(body.get("thing_id")).toBe("t3_post123")
    })

    it("should return Left when user is not authenticated for write", async () => {
      const clientReadOnly = new RedditClient({
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        userAgent: "TestApp/1.0.0",
      })

      const result = await clientReadOnly.editPost("post123", "New content")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Write operations require REDDIT_USERNAME and REDDIT_PASSWORD")
      }
    })

    it("should handle API errors", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock edit request with errors
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            errors: [["BAD_TEXT", "invalid text", "text"]],
          },
        }),
      })

      const result = await client.editPost("post123", "")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Reddit API errors: invalid text")
      }
    })
  })

  describe("bot disclosure", () => {
    it("should append bot footer to createPost content when enabled", async () => {
      const botFooter = "\n\n---\n^(I am a bot)"
      const clientWithDisclosure = new RedditClient({
        ...mockConfig,
        botDisclosure: { enabled: true, footer: botFooter },
      })

      const mockSubmitResponse = {
        json: { data: { id: "newpost123" }, errors: [] },
      }
      const mockPostData = [
        {
          data: {
            children: [
              {
                data: {
                  id: "newpost123",
                  title: "Test",
                  author: "testuser",
                  subreddit: "test",
                  selftext: "Content",
                  url: "https://reddit.com/r/test/newpost123",
                  score: 1,
                  upvote_ratio: 1,
                  num_comments: 0,
                  created_utc: Date.now() / 1000,
                  over_18: false,
                  spoiler: false,
                  edited: false,
                  is_self: true,
                  link_flair_text: null,
                  permalink: "/r/test/comments/newpost123/",
                },
              },
            ],
          },
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubmitResponse,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPostData,
      })

      const result = await clientWithDisclosure.createPost("test", "Test", "Content")
      expect(result.isRight()).toBe(true)

      const submitCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(submitCall[1].body as string)
      expect(body.get("text")).toBe(`Content${botFooter}`)
    })

    it("should append bot footer to replyToPost content when enabled", async () => {
      const botFooter = "\n\n---\n^(I am a bot)"
      const clientWithDisclosure = new RedditClient({
        ...mockConfig,
        botDisclosure: { enabled: true, footer: botFooter },
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { children: [{ data: { id: "post123" } }] } }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            data: {
              things: [
                {
                  data: {
                    id: "comment123",
                    subreddit: "test",
                    link_title: "Test",
                    permalink: "/r/test/comments/post123/comment123",
                  },
                },
              ],
            },
          },
        }),
      })

      const result = await clientWithDisclosure.replyToPost("post123", "Great post!")
      expect(result.isRight()).toBe(true)

      const commentCall = mockFetch.mock.calls[2]
      const body = new URLSearchParams(commentCall[1].body as string)
      expect(body.get("text")).toBe(`Great post!${botFooter}`)
    })

    it("should NOT append bot footer when disabled (default)", async () => {
      const mockSubmitResponse = {
        json: { data: { id: "newpost123" }, errors: [] },
      }
      const mockPostData = [
        {
          data: {
            children: [
              {
                data: {
                  id: "newpost123",
                  title: "Test",
                  author: "testuser",
                  subreddit: "test",
                  selftext: "Content",
                  url: "https://reddit.com/r/test/newpost123",
                  score: 1,
                  upvote_ratio: 1,
                  num_comments: 0,
                  created_utc: Date.now() / 1000,
                  over_18: false,
                  spoiler: false,
                  edited: false,
                  is_self: true,
                  link_flair_text: null,
                  permalink: "/r/test/comments/newpost123/",
                },
              },
            ],
          },
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubmitResponse,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPostData,
      })

      const result = await client.createPost("test", "Test", "Content")
      expect(result.isRight()).toBe(true)

      const submitCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(submitCall[1].body as string)
      expect(body.get("text")).toBe("Content")
    })
  })

  describe("cross-subreddit duplicate detection", () => {
    it("should block same content posted to different subreddits", async () => {
      const clientWithSafeMode = new RedditClient({
        ...mockConfig,
        safeMode: {
          enabled: true,
          mode: "standard",
          writeDelayMs: 0,
          duplicateCheck: true,
          maxRecentHashes: 10,
        },
      })

      const mockSubmitResponse = {
        json: { data: { id: "post1" }, errors: [] },
      }
      const mockPostData = [
        {
          data: {
            children: [
              {
                data: {
                  id: "post1",
                  title: "Test",
                  author: "testuser",
                  subreddit: "sub1",
                  selftext: "Same content",
                  url: "https://reddit.com/r/sub1/post1",
                  score: 1,
                  upvote_ratio: 1,
                  num_comments: 0,
                  created_utc: Date.now() / 1000,
                  over_18: false,
                  spoiler: false,
                  edited: false,
                  is_self: true,
                  link_flair_text: null,
                  permalink: "/r/sub1/comments/post1/",
                },
              },
            ],
          },
        },
      ]

      // First post succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubmitResponse,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPostData,
      })

      const result1 = await clientWithSafeMode.createPost("sub1", "Test", "Same content")
      expect(result1.isRight()).toBe(true)

      // Second post to different subreddit with same content should fail
      const result2 = await clientWithSafeMode.createPost("sub2", "Test", "Same content")
      expect(result2.isLeft()).toBe(true)
      if (result2.isLeft()) {
        expect(result2.value.message).toContain("Cross-subreddit duplicate detected")
      }
    })

    it("should block same content posted to same subreddit", async () => {
      const clientWithSafeMode = new RedditClient({
        ...mockConfig,
        safeMode: {
          enabled: true,
          mode: "standard",
          writeDelayMs: 0,
          duplicateCheck: true,
          maxRecentHashes: 10,
        },
      })

      const mockSubmitResponse = {
        json: { data: { id: "post1" }, errors: [] },
      }
      const mockPostData = [
        {
          data: {
            children: [
              {
                data: {
                  id: "post1",
                  title: "Test",
                  author: "testuser",
                  subreddit: "sub1",
                  selftext: "Same content",
                  url: "https://reddit.com/r/sub1/post1",
                  score: 1,
                  upvote_ratio: 1,
                  num_comments: 0,
                  created_utc: Date.now() / 1000,
                  over_18: false,
                  spoiler: false,
                  edited: false,
                  is_self: true,
                  link_flair_text: null,
                  permalink: "/r/sub1/comments/post1/",
                },
              },
            ],
          },
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubmitResponse,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPostData,
      })

      const result1 = await clientWithSafeMode.createPost("sub1", "Test", "Same content")
      expect(result1.isRight()).toBe(true)

      // Same content to same subreddit should still be blocked
      const result2 = await clientWithSafeMode.createPost("sub1", "Test", "Same content")
      expect(result2.isLeft()).toBe(true)
      if (result2.isLeft()) {
        expect(result2.value.message).toContain("Duplicate content detected")
      }
    })

    it("should allow different content to same subreddit", async () => {
      const clientWithSafeMode = new RedditClient({
        ...mockConfig,
        safeMode: {
          enabled: true,
          mode: "standard",
          writeDelayMs: 0,
          duplicateCheck: true,
          maxRecentHashes: 10,
        },
      })

      const createMockPostResponse = (id: string) => ({
        json: { data: { id }, errors: [] },
      })
      const createMockPostData = (id: string, subreddit: string) => [
        {
          data: {
            children: [
              {
                data: {
                  id,
                  title: "Test",
                  author: "testuser",
                  subreddit,
                  selftext: "Content",
                  url: `https://reddit.com/r/${subreddit}/${id}`,
                  score: 1,
                  upvote_ratio: 1,
                  num_comments: 0,
                  created_utc: Date.now() / 1000,
                  over_18: false,
                  spoiler: false,
                  edited: false,
                  is_self: true,
                  link_flair_text: null,
                  permalink: `/r/${subreddit}/comments/${id}/`,
                },
              },
            ],
          },
        },
      ]

      // First post
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockPostResponse("post1"),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockPostData("post1", "sub1"),
      })

      const result1 = await clientWithSafeMode.createPost("sub1", "Test", "First content")
      expect(result1.isRight()).toBe(true)

      // Second post with different content to same subreddit should work
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockPostResponse("post2"),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createMockPostData("post2", "sub1"),
      })

      const result2 = await clientWithSafeMode.createPost("sub1", "Test 2", "Different content")
      expect(result2.isRight()).toBe(true)
      const post = result2.orThrow()
      expect(post.id).toBe("post2")
    })
  })

  describe("editComment", () => {
    it("should edit a comment", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock edit request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ json: { errors: [] } }),
      })

      const result = await client.editComment("comment123", "Updated comment")

      // Check the edit call
      const editCall = mockFetch.mock.calls[1]
      expect(editCall[0]).toBe("https://oauth.reddit.com/api/editusertext")
      expect(editCall[1].method).toBe("POST")

      const body = new URLSearchParams(editCall[1].body as string)
      expect(body.get("thing_id")).toBe("t1_comment123")
      expect(body.get("text")).toBe("Updated comment")
      expect(body.get("api_type")).toBe("json")

      expect(result.isRight()).toBe(true)
      expect(result.orThrow()).toBe(true)
    })

    it("should handle comment ID with t1_ prefix", async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      // Mock edit request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ json: { errors: [] } }),
      })

      const result = await client.editComment("t1_comment123", "Updated comment")
      expect(result.isRight()).toBe(true)

      const editCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(editCall[1].body as string)
      expect(body.get("thing_id")).toBe("t1_comment123")
    })
  })
})
