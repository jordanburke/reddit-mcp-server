import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { RedditClientConfig } from "../../types"
import { RedditClient } from "../reddit-client"

// Store original fetch
const originalFetch = global.fetch

describe("RedditClient", () => {
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
    global.fetch = mockFetch
    client = new RedditClient(mockConfig)
  })

  afterEach(() => {
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

      await client.authenticate()

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

      await clientReadOnly.authenticate()

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
      await client.authenticate()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second authentication should not make another request
      await client.authenticate()
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("should throw error on authentication failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      })

      await expect(client.authenticate()).rejects.toThrow("Authentication failed: 401")
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

      const user = await client.getUser("testuser")

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://oauth.reddit.com/user/testuser/about.json",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      )

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

    it("should throw error when user fetch fails", async () => {
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

      await expect(client.getUser("testuser")).rejects.toThrow("Failed to get user info for testuser")
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

      const subreddit = await client.getSubredditInfo("programming")

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://oauth.reddit.com/r/programming/about.json",
        expect.any(Object),
      )
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

      const posts = await client.getTopPosts("programming", "week", 10)

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("/r/programming/top.json?"),
        expect.any(Object),
      )

      const lastCallUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastCallUrl).toContain("t=week")
      expect(lastCallUrl).toContain("limit=10")

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

      const post = await client.createPost("test", "My New Post", "Post content")

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

      expect(post.id).toBe("newpost123")
      expect(post.title).toBe("My New Post")
    })

    it("should throw error when user is not authenticated", async () => {
      const clientReadOnly = new RedditClient({
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        userAgent: "TestApp/1.0.0",
      })

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      await expect(clientReadOnly.createPost("test", "Title", "Content")).rejects.toThrow(
        "Write operations require REDDIT_USERNAME and REDDIT_PASSWORD",
      )
    })
  })

  describe("replyToPost", () => {
    it.skip("should reply to an existing post", async () => {
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

      const comment = await client.replyToPost("post123", "Great post!")

      // Check the comment submission call
      const commentCall = mockFetch.mock.calls[2]
      expect(commentCall[0]).toBe("https://oauth.reddit.com/api/comment")
      expect(commentCall[1].method).toBe("POST")

      const body = new URLSearchParams(commentCall[1].body as string)
      expect(body.get("thing_id")).toBe("t3_post123")
      expect(body.get("text")).toBe("Great post!")
      expect(body.get("api_type")).toBe("json")

      expect(comment.id).toBe("comment123")
      expect(comment.body).toBe("Great post!")
      expect(comment.author).toBe("testuser")
    })

    it("should throw error when post does not exist", async () => {
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

      await expect(client.replyToPost("nonexistent", "Comment")).rejects.toThrow("Failed to reply to post nonexistent")
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

      expect(result).toBe(true)
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

      await client.deletePost("t3_post123")

      const deleteCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(deleteCall[1].body as string)
      expect(body.get("id")).toBe("t3_post123")
    })

    it("should throw error when user is not authenticated", async () => {
      const clientReadOnly = new RedditClient({
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        userAgent: "TestApp/1.0.0",
      })

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      await expect(clientReadOnly.deletePost("post123")).rejects.toThrow(
        "Write operations require REDDIT_USERNAME and REDDIT_PASSWORD",
      )
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

      expect(result).toBe(true)
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

      await client.deleteComment("t1_comment123")

      const deleteCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(deleteCall[1].body as string)
      expect(body.get("id")).toBe("t1_comment123")
    })
  })

  describe("editPost", () => {
    it.skip("should edit a post", async () => {
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

      expect(result).toBe(true)
    })

    it.skip("should handle post ID with t3_ prefix", async () => {
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

      await client.editPost("t3_post123", "Updated content")

      const editCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(editCall[1].body as string)
      expect(body.get("thing_id")).toBe("t3_post123")
    })

    it("should throw error when user is not authenticated", async () => {
      const clientReadOnly = new RedditClient({
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        userAgent: "TestApp/1.0.0",
      })

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

      await expect(clientReadOnly.editPost("post123", "New content")).rejects.toThrow(
        "Write operations require REDDIT_USERNAME and REDDIT_PASSWORD",
      )
    })

    it.skip("should handle API errors", async () => {
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

      await expect(client.editPost("post123", "")).rejects.toThrow("Reddit API errors: BAD_TEXT: invalid text")
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

      expect(result).toBe(true)
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

      await client.editComment("t1_comment123", "Updated comment")

      const editCall = mockFetch.mock.calls[1]
      const body = new URLSearchParams(editCall[1].body as string)
      expect(body.get("thing_id")).toBe("t1_comment123")
    })
  })
})
