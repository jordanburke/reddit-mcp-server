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
    // Disable 429 retry by default so existing single-response mocks stay deterministic;
    // the rate-limit suite below opts in with its own retry config.
    retry: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 60000 },
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

  // Characterization tests: these lock the OBSERVABLE behavior contract of getUser
  // (Left/Right shape + exact error-message text). They must pass identically before
  // and after the Try/typed-error migration — that is the behavior-preservation proof.
  describe("getUser — behavior contract (characterization)", () => {
    const mockAuth = () =>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

    it("uses total_karma when present instead of summing comment+link karma", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            name: "testuser",
            id: "123",
            comment_karma: 100,
            link_karma: 200,
            total_karma: 999,
            is_mod: false,
            is_gold: false,
            is_employee: false,
            created_utc: 1234567890,
          },
        }),
      })

      const result = await client.getUser("testuser")
      expect(result.isRight()).toBe(true)
      expect(result.orThrow().totalKarma).toBe(999)
    })

    it("returns Left with the exact HTTP-status message on a non-ok response", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const result = await client.getUser("ghost")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get user info for ghost: HTTP 404")
      }
    })

    it("returns Left (not a throw) when the network request fails", async () => {
      mockAuth()
      mockFetch.mockRejectedValueOnce(new Error("network down"))

      const result = await client.getUser("testuser")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Failed to get user info for testuser")
        expect(result.value.message).toContain("network down")
      }
    })

    it("returns Left when the response body is not valid JSON", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON")
        },
      })

      const result = await client.getUser("testuser")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Failed to get user info for testuser")
      }
    })

    it("returns Left when the response is missing the data field", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

      const result = await client.getUser("testuser")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toContain("Failed to get user info for testuser")
      }
    })
  })

  // The capability the migration ADDS: a typed, discriminated error channel that callers
  // can branch on (`_tag`, `HttpError.status`) instead of string-matching messages.
  describe("getUser — typed error contract", () => {
    const mockAuth = () =>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

    it("classifies a non-ok response as a HttpError carrying the status code", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429 })

      const result = await client.getUser("ratelimited")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value._tag).toBe("HttpError")
        if (result.value._tag === "HttpError") {
          expect(result.value.status).toBe(429)
        }
      }
    })

    it("classifies a network failure as an UnknownError", async () => {
      mockAuth()
      mockFetch.mockRejectedValueOnce(new Error("ECONNRESET"))

      const result = await client.getUser("testuser")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value._tag).toBe("UnknownError")
      }
    })

    it("classifies a malformed JSON body as an UnknownError", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new SyntaxError("bad json")
        },
      })

      const result = await client.getUser("testuser")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value._tag).toBe("UnknownError")
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
      const posts = result.orThrow().items
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

  describe("browseSubreddit", () => {
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

    const mockAuthThenPosts = () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPostsData,
      })
    }

    it("should fetch hot posts without a time filter param", async () => {
      mockAuthThenPosts()

      const result = await client.browseSubreddit("programming", "hot", "week", 10)

      const lastCallUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastCallUrl).toContain("/r/programming/hot.json?")
      expect(lastCallUrl).toContain("limit=10")
      expect(lastCallUrl).not.toMatch(/[?&]t=/)

      expect(result.isRight()).toBe(true)
      expect(result.orThrow().items[0].id).toBe("post1")
    })

    it("should include the time filter for top sort", async () => {
      mockAuthThenPosts()

      await client.browseSubreddit("programming", "top", "month", 5)

      const lastCallUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastCallUrl).toContain("/r/programming/top.json?")
      expect(lastCallUrl).toContain("t=month")
      expect(lastCallUrl).toContain("limit=5")
    })

    it("should include the time filter for controversial sort", async () => {
      mockAuthThenPosts()

      await client.browseSubreddit("programming", "controversial", "year", 5)

      const lastCallUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastCallUrl).toContain("/r/programming/controversial.json?")
      expect(lastCallUrl).toContain("t=year")
    })

    it("should browse the home feed when no subreddit is specified", async () => {
      mockAuthThenPosts()

      await client.browseSubreddit("", "new", "week", 5)

      const lastCallUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastCallUrl).toContain("/new.json?")
      expect(lastCallUrl).not.toMatch(/[?&]t=/)
    })

    it("should reject an invalid sort", async () => {
      const result = await client.browseSubreddit("programming", "bogus", "week", 5)

      expect(result.isLeft()).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("response caching", () => {
    const postsBody = JSON.stringify({
      data: {
        children: [{ kind: "t3", data: { id: "cached1", title: "Cached", subreddit: "x", score: 1, num_comments: 0 } }],
      },
    })

    it("serves a repeated identical GET from cache without re-fetching", async () => {
      const cachedClient = new RedditClient({ ...mockConfig, cache: { enabled: true, maxBytes: 1_000_000 } })

      // auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
      // first (and only) data fetch — must expose text() for caching
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => postsBody,
      })

      const first = await cachedClient.browseSubreddit("x", "hot", "week", 10)
      const second = await cachedClient.browseSubreddit("x", "hot", "week", 10)

      expect(first.orThrow().items[0].id).toBe("cached1")
      expect(second.orThrow().items[0].id).toBe("cached1")
      // auth (1) + single data fetch (1) = 2; the second browse is served from cache
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("does not cache when caching is disabled", async () => {
      // default mockConfig has no cache config
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => JSON.parse(postsBody),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => JSON.parse(postsBody),
      })

      await client.browseSubreddit("x", "hot", "week", 10)
      await client.browseSubreddit("x", "hot", "week", 10)

      // auth (1) + two data fetches = 3
      expect(mockFetch).toHaveBeenCalledTimes(3)
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

    it("includes flair_id and flair_text in the submit body when provided", async () => {
      const mockSubmitResponse = { json: { data: { id: "p1" }, errors: [] } }
      const mockPostData = [
        {
          data: {
            children: [
              {
                data: {
                  id: "p1",
                  title: "T",
                  author: "testuser",
                  subreddit: "test",
                  selftext: "C",
                  url: "https://reddit.com/r/test/p1",
                  score: 1,
                  upvote_ratio: 1,
                  num_comments: 0,
                  created_utc: 1,
                  over_18: false,
                  spoiler: false,
                  edited: false,
                  is_self: true,
                  link_flair_text: null,
                  permalink: "/r/test/comments/p1/",
                },
              },
            ],
          },
        },
      ]

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) })
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSubmitResponse })
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockPostData })

      const result = await client.createPost("test", "T", "C", true, "flair-abc", "custom flair")
      expect(result.isRight()).toBe(true)

      const submitBody = new URLSearchParams(mockFetch.mock.calls[1][1].body as string)
      expect(submitBody.get("flair_id")).toBe("flair-abc")
      expect(submitBody.get("flair_text")).toBe("custom flair")
    })

    it("omits flair params when none are provided", async () => {
      const mockSubmitResponse = { json: { data: { id: "p2" }, errors: [] } }
      const mockPostData = [
        {
          data: {
            children: [
              {
                data: {
                  id: "p2",
                  title: "T",
                  author: "testuser",
                  subreddit: "test",
                  selftext: "C",
                  url: "https://reddit.com/r/test/p2",
                  score: 1,
                  upvote_ratio: 1,
                  num_comments: 0,
                  created_utc: 1,
                  over_18: false,
                  spoiler: false,
                  edited: false,
                  is_self: true,
                  link_flair_text: null,
                  permalink: "/r/test/comments/p2/",
                },
              },
            ],
          },
        },
      ]

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) })
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSubmitResponse })
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockPostData })

      await client.createPost("test", "T", "C")

      const submitBody = new URLSearchParams(mockFetch.mock.calls[1][1].body as string)
      expect(submitBody.get("flair_id")).toBeNull()
      expect(submitBody.get("flair_text")).toBeNull()
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

  // Rollout coverage: locks the exact error-message text (behavior preservation) AND the new
  // typed `_tag` channel for every migrated method. Special attention to the ASYMMETRIC-message
  // methods — getTopPosts/browseSubreddit/searchReddit/getPostComments — where the non-ok HTTP
  // message intentionally differs from the catch-branch context and is hand-preserved.
  describe("typed error contract (rollout)", () => {
    const mockAuth = () =>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
    const okJson = (body: unknown) => mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body })
    const httpStatus = (status: number) => mockFetch.mockResolvedValueOnce({ ok: false, status })

    it("getSubredditInfo: 404 -> HttpError with exact message + status", async () => {
      mockAuth()
      httpStatus(404)
      const result = await client.getSubredditInfo("testsub")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get subreddit info for testsub: HTTP 404")
        expect(result.value._tag).toBe("HttpError")
        if (result.value._tag === "HttpError") expect(result.value.status).toBe(404)
      }
    })

    it("getTopPosts: 404 message omits the subreddit (asymmetric, preserved)", async () => {
      mockAuth()
      httpStatus(503)
      const result = await client.getTopPosts("programming", "week", 10)
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get top posts: HTTP 503")
        expect(result.value._tag).toBe("HttpError")
      }
    })

    it("getTopPosts: network failure uses the 'for <subreddit>' context (UnknownError)", async () => {
      mockAuth()
      mockFetch.mockRejectedValueOnce(new Error("boom"))
      const result = await client.getTopPosts("programming", "week", 10)
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get top posts for programming: boom")
        expect(result.value._tag).toBe("UnknownError")
      }
    })

    it("browseSubreddit: invalid sort -> ValidationError, no fetch", async () => {
      const result = await client.browseSubreddit("programming", "bogus", "week", 5)
      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value._tag).toBe("ValidationError")
        expect(result.value.message).toBe(
          'Invalid sort "bogus". Valid options are: hot, new, top, rising, controversial',
        )
      }
    })

    it("browseSubreddit: 404 message omits the sort (asymmetric, preserved)", async () => {
      mockAuth()
      httpStatus(500)
      const result = await client.browseSubreddit("programming", "hot", "week", 5)
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to browse r/programming: HTTP 500")
        expect(result.value._tag).toBe("HttpError")
      }
    })

    it("getPost: empty info listing -> NotFoundError", async () => {
      mockAuth()
      okJson({ data: { children: [] } })
      const result = await client.getPost("abc")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value._tag).toBe("NotFoundError")
        expect(result.value.message).toBe("Post with ID abc not found")
      }
    })

    it("getPost: 404 -> HttpError with context message", async () => {
      mockAuth()
      httpStatus(404)
      const result = await client.getPost("abc")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get post with ID abc: HTTP 404")
        expect(result.value._tag).toBe("HttpError")
      }
    })

    it("getTrendingSubreddits: 404 -> HttpError exact message", async () => {
      mockAuth()
      httpStatus(429)
      const result = await client.getTrendingSubreddits(5)
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get trending subreddits: HTTP 429")
        expect(result.value._tag).toBe("HttpError")
      }
    })

    it("searchReddit: 404 message omits the query (asymmetric, preserved)", async () => {
      mockAuth()
      httpStatus(400)
      const result = await client.searchReddit("cats", {})
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to search Reddit: HTTP 400")
        expect(result.value._tag).toBe("HttpError")
      }
    })

    it("searchReddit: network failure includes the query context (UnknownError)", async () => {
      mockAuth()
      mockFetch.mockRejectedValueOnce(new Error("dns"))
      const result = await client.searchReddit("cats", {})
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to search Reddit for: cats: dns")
        expect(result.value._tag).toBe("UnknownError")
      }
    })

    it("getPostComments: 404 message omits the postId (asymmetric, preserved)", async () => {
      mockAuth()
      httpStatus(404)
      const result = await client.getPostComments("p1", "programming", {})
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get comments: HTTP 404")
        expect(result.value._tag).toBe("HttpError")
      }
    })

    it("getUserPosts: 404 -> HttpError exact message", async () => {
      mockAuth()
      httpStatus(404)
      const result = await client.getUserPosts("bob", {})
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get posts for user bob: HTTP 404")
        expect(result.value._tag).toBe("HttpError")
      }
    })

    it("getUserComments: 404 -> HttpError exact message", async () => {
      mockAuth()
      httpStatus(404)
      const result = await client.getUserComments("bob", {})
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get comments for user bob: HTTP 404")
        expect(result.value._tag).toBe("HttpError")
      }
    })

    it("createPost: Reddit API errors -> ApiError (no context prefix, like the old write catch)", async () => {
      mockAuth()
      okJson({ json: { errors: [["BAD_TITLE", "title too long", "title"]] } })
      const result = await client.createPost("test", "Title", "Content")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Reddit API errors: title too long")
        expect(result.value._tag).toBe("ApiError")
      }
    })

    it("createPost: missing credentials -> NotAuthenticatedError (raw message, no prefix)", async () => {
      const readOnly = new RedditClient({
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        userAgent: "TestApp/1.0.0",
      })
      const result = await readOnly.createPost("test", "Title", "Content")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Write operations require REDDIT_USERNAME and REDDIT_PASSWORD")
        expect(result.value._tag).toBe("NotAuthenticatedError")
      }
    })
  })

  describe("getSubredditRules", () => {
    const mockAuth = () =>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

    it("fetches and maps subreddit rules", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rules: [
            {
              short_name: "No spam",
              description: "Do not spam.",
              kind: "all",
              violation_reason: "Spam",
              priority: 0,
              created_utc: 1,
            },
            { short_name: "Flair required", description: "", kind: "link" },
          ],
        }),
      })

      const result = await client.getSubredditRules("programming")
      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://oauth.reddit.com/r/programming/about/rules.json",
        expect.any(Object),
      )
      expect(result.isRight()).toBe(true)
      const rules = result.orThrow()
      expect(rules).toHaveLength(2)
      expect(rules[0].shortName).toBe("No spam")
      expect(rules[0].kind).toBe("all")
      expect(rules[0].violationReason).toBe("Spam")
      expect(rules[1].shortName).toBe("Flair required")
      expect(rules[1].kind).toBe("link")
    })

    it("returns an empty list when the subreddit has no rules", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ rules: [] }) })

      const result = await client.getSubredditRules("programming")
      expect(result.isRight()).toBe(true)
      expect(result.orThrow()).toHaveLength(0)
    })

    it("returns a typed HttpError on a non-ok response", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const result = await client.getSubredditRules("ghost")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get rules for r/ghost: HTTP 404")
        expect(result.value._tag).toBe("HttpError")
      }
    })
  })

  describe("getMoreComments", () => {
    const mockAuth = () =>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

    it("expands a 'more' stub into a flat list of comments and forwards ids", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            data: {
              things: [
                {
                  kind: "t1",
                  data: {
                    id: "c1",
                    author: "alice",
                    body: "hello",
                    score: 5,
                    controversiality: 0,
                    subreddit: "test",
                    created_utc: 1,
                    edited: false,
                    is_submitter: true,
                    permalink: "/r/test/comments/p1/c1",
                    parent_id: "t3_p1",
                  },
                },
                { kind: "more", data: { id: "x", children: ["c9"] } },
              ],
            },
          },
        }),
      })

      const result = await client.getMoreComments("p1", ["c1", "c2"])

      const lastUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastUrl).toContain("/api/morechildren?")
      expect(lastUrl).toContain("link_id=t3_p1")
      expect(lastUrl).toContain("children=c1%2Cc2")

      expect(result.isRight()).toBe(true)
      const comments = result.orThrow()
      expect(comments).toHaveLength(1) // the "more" stub is filtered out
      expect(comments[0].id).toBe("c1")
      expect(comments[0].author).toBe("alice")
      expect(comments[0].parentId).toBe("t3_p1")
      expect(comments[0].isSubmitter).toBe(true)
    })

    it("does not double-prefix an already-prefixed link id", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ json: { data: { things: [] } } }) })

      await client.getMoreComments("t3_p1", ["c1"])

      const lastUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastUrl).toContain("link_id=t3_p1")
      expect(lastUrl).not.toContain("t3_t3_")
    })

    it("returns a typed HttpError on a non-ok response", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 })

      const result = await client.getMoreComments("p1", ["c1"])
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to expand comments for t3_p1: HTTP 400")
        expect(result.value._tag).toBe("HttpError")
      }
    })
  })

  describe("getPostFlairs", () => {
    const mockAuth = () =>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })

    it("fetches and maps link flairs from the bare array response", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "abc", text: "Discussion", type: "text", text_editable: false },
          { id: "def", text: "Help", type: "richtext", text_editable: true },
        ],
      })

      const result = await client.getPostFlairs("programming")
      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://oauth.reddit.com/r/programming/api/link_flair_v2.json",
        expect.any(Object),
      )
      expect(result.isRight()).toBe(true)
      const flairs = result.orThrow()
      expect(flairs).toHaveLength(2)
      expect(flairs[0]).toEqual({ id: "abc", text: "Discussion", type: "text", textEditable: false })
      expect(flairs[1].textEditable).toBe(true)
    })

    it("returns a typed HttpError when flairs are not accessible (e.g. 403)", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

      const result = await client.getPostFlairs("programming")
      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value.message).toBe("Failed to get post flairs for r/programming: HTTP 403")
        expect(result.value._tag).toBe("HttpError")
      }
    })
  })

  describe("rate-limit retry (429)", () => {
    const mockAuth = () =>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
    // Use real Headers objects (case-insensitive get, native string|null) so the mocks match
    // production fetch and don't introduce nullable annotations of our own.
    const res429 = (retryAfter: string) =>
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ "retry-after": retryAfter }) })
    // 429 with no rate-limit headers (exercises the exponential-backoff fallback).
    const res429NoHeader = () => mockFetch.mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers() })
    const okSubreddit = () =>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            display_name: "programming",
            title: "Programming",
            description: "d",
            public_description: "pd",
            subscribers: 1,
            created_utc: 1,
            over18: false,
            subreddit_type: "public",
            url: "/r/programming/",
          },
        }),
      })
    const retrying = (overrides: Partial<{ maxRetries: number; baseDelayMs: number; maxDelayMs: number }> = {}) =>
      new RedditClient({
        ...mockConfig,
        retry: { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 60_000, ...overrides },
      })

    it("retries on 429 (honoring Retry-After) then succeeds", async () => {
      const client2 = retrying()
      mockAuth()
      res429("0")
      okSubreddit()

      const result = await client2.getSubredditInfo("programming")

      expect(result.isRight()).toBe(true)
      expect(result.orThrow().displayName).toBe("programming")
      // auth + first 429 + successful retry
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it("gives up after maxRetries and surfaces a typed HttpError(429)", async () => {
      const client2 = retrying({ maxRetries: 2 })
      mockAuth()
      res429("0") // initial
      res429("0") // retry 1
      res429("0") // retry 2

      const result = await client2.getSubredditInfo("programming")

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value._tag).toBe("HttpError")
        if (result.value._tag === "HttpError") expect(result.value.status).toBe(429)
      }
      // auth + initial + 2 retries
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })

    it("does not wait longer than maxDelayMs — gives up immediately", async () => {
      const client2 = retrying({ maxRetries: 5, maxDelayMs: 1000 })
      mockAuth()
      res429("9999") // 9999s required wait >> 1s cap

      const result = await client2.getSubredditInfo("programming")

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) expect(result.value._tag).toBe("HttpError")
      // auth + single 429, no retry attempted
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("falls back to exponential backoff when no Retry-After header is present", async () => {
      const client2 = retrying({ maxRetries: 1, baseDelayMs: 0 })
      mockAuth()
      res429NoHeader() // no Retry-After -> backoff (baseDelayMs 0)
      okSubreddit()

      const result = await client2.getSubredditInfo("programming")

      expect(result.isRight()).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it("does not retry non-429 errors (404)", async () => {
      const client2 = retrying({ maxRetries: 3 })
      mockAuth()
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const result = await client2.getSubredditInfo("programming")

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value._tag).toBe("HttpError")
        if (result.value._tag === "HttpError") expect(result.value.status).toBe(404)
      }
      // auth + single 404, no retry
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe("pagination (after cursors)", () => {
    const mockAuth = () =>
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "test-token", expires_in: 3600 }),
      })
    const postChild = (id: string) => ({
      kind: "t3",
      data: {
        id,
        title: `Post ${id}`,
        author: "a",
        subreddit: "s",
        selftext: "",
        url: "https://reddit.com",
        score: 1,
        upvote_ratio: 1,
        num_comments: 0,
        created_utc: 1,
        over_18: false,
        spoiler: false,
        edited: false,
        is_self: true,
        link_flair_text: null,
        permalink: "/r/s/comments/x/",
      },
    })

    it("returns a Page with items and the after cursor", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { children: [postChild("p1")], after: "t3_next", before: null } }),
      })

      const result = await client.searchReddit("cats", {})
      expect(result.isRight()).toBe(true)
      const page = result.orThrow()
      expect(page.items).toHaveLength(1)
      expect(page.items[0].id).toBe("p1")
      expect(page.after).toBe("t3_next")
      expect(page.before).toBeUndefined()
    })

    it("omits the after cursor when Reddit returns null (last page)", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { children: [postChild("p1")], after: null, before: null } }),
      })

      const page = (await client.searchReddit("cats", {})).orThrow()
      expect(page.after).toBeUndefined()
    })

    it("forwards the after cursor to the request URL", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { children: [], after: null } }),
      })

      await client.searchReddit("cats", { after: "t3_prev" })

      const lastUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastUrl).toContain("after=t3_prev")
    })

    it("getTopPosts returns a page and forwards the positional after cursor", async () => {
      mockAuth()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { children: [postChild("p1")], after: "t3_more", before: null } }),
      })

      const page = (await client.getTopPosts("programming", "week", 10, "t3_prev")).orThrow()
      expect(page.items[0].id).toBe("p1")
      expect(page.after).toBe("t3_more")

      const lastUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0]
      expect(lastUrl).toContain("after=t3_prev")
    })
  })
})
