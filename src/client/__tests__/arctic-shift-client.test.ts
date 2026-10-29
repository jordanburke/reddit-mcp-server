import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { Option } from "functype"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { RedditClientConfig } from "../../types"
import { ArcticShiftClient, throttleWaitMs } from "../arctic-shift-client"
import { RedditClient } from "../reddit-client"
import { ResponseCache } from "../response-cache"

// Live Arctic Shift responses captured 2026-10-27.
const fixture = (name: string): string => readFileSync(resolve(__dirname, `fixtures/arctic/${name}.json`), "utf-8")

const originalFetch = global.fetch

function jsonResponse(body: string, status: number = 200, headers: Record<string, string> = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), text: async () => body }
}

const NO_WAIT = { fallbackMs: 0, maxWaitMs: 0 }

function calledUrl(mockFetch: ReturnType<typeof vi.fn>, call: number = 0): URL {
  return new URL(mockFetch.mock.calls[call]![0] as string)
}

describe("ArcticShiftClient", () => {
  const mockFetch = vi.fn()
  const arctic = new ArcticShiftClient("test-agent/1.0", undefined, NO_WAIT)

  beforeEach(() => {
    mockFetch.mockReset()
    global.fetch = mockFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe("listSubredditPosts", () => {
    it("parses posts newest-first and sends the user agent", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      const result = await arctic.listSubredditPosts("r/programming", 3)

      expect(result.isRight()).toBe(true)
      const page = result.orThrow()
      expect(page.source).toBe("arctic")
      expect(page.items.map((post) => post.id)).toEqual(["1xh15vv", "1xh150m", "1xgy8d2"])
      expect(page.items[0]!.title).toBe("Billion-query-per-second lookup tables in C++")

      const url = calledUrl(mockFetch)
      expect(url.origin + url.pathname).toBe("https://arctic-shift.photon-reddit.com/api/posts/search")
      expect(url.searchParams.get("subreddit")).toBe("programming")
      expect(url.searchParams.get("sort")).toBe("desc")
      expect(url.searchParams.get("limit")).toBe("3")
      expect(mockFetch.mock.calls[0]![1]).toMatchObject({ headers: { "User-Agent": "test-agent/1.0" } })
    })

    it("returns the oldest item's timestamp as the cursor on a full page", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      const page = (await arctic.listSubredditPosts("programming", 3)).orThrow()

      expect(page.after).toBe("1793120632")
    })

    it("omits the cursor when the page is short", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      const page = (await arctic.listSubredditPosts("programming", 10)).orThrow()

      expect(page.after).toBeUndefined()
    })

    it("passes the cursor back as `before`", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      await arctic.listSubredditPosts("programming", 3, "1793120632")

      expect(calledUrl(mockFetch).searchParams.get("before")).toBe("1793120632")
    })

    it("clamps the limit to 100", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      await arctic.listSubredditPosts("programming", 500)

      expect(calledUrl(mockFetch).searchParams.get("limit")).toBe("100")
    })

    it.each([
      ["a fullname cursor", "t3_abc123"],
      ["a query-injection cursor", "1793120632&author=spez"],
    ])("rejects %s without a request", async (_label, cursor) => {
      const result = await arctic.listSubredditPosts("programming", 3, cursor)

      expect(result.isLeft()).toBe(true)
      expect(result.swap().orThrow()._tag).toBe("ValidationError")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it.each([
      ["the home feed", ""],
      ["a multireddit", "programming+python"],
      ["a path-injection name", "../../api/v1/me"],
    ])("rejects %s without a request", async (_label, subreddit) => {
      const result = await arctic.listSubredditPosts(subreddit)

      expect(result.isLeft()).toBe(true)
      expect(result.swap().orThrow()._tag).toBe("ValidationError")
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("errors", () => {
    it("surfaces the service's error message as an HttpError", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('{"data":null,"error":"\'sort\' must be one of asc, desc"}', 400))

      const error = (await arctic.listSubredditPosts("programming")).swap().orThrow()

      expect(error._tag).toBe("HttpError")
      expect(error.message).toContain("'sort' must be one of asc, desc")
    })

    it("retries a throttled query once", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse('{"data":null,"error":"Timeout. Maybe slow down a bit"}', 422))
        .mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      const result = await arctic.listSubredditPosts("programming", 3)

      expect(result.isRight()).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("gives up after one retry with advice to wait", async () => {
      mockFetch.mockResolvedValue(jsonResponse('{"data":null,"error":"Timeout. Maybe slow down a bit"}', 422))

      const error = (await arctic.listSubredditPosts("programming")).swap().orThrow()

      expect(error.message).toContain("Wait a few seconds")
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("does not tell a timed-out query to wait for the minute-aligned reset", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse('{"data":null,"error":"Timeout. Maybe slow down a bit"}', 422, { "x-ratelimit-reset": "52" }),
      )

      const error = (await arctic.listSubredditPosts("programming")).swap().orThrow()

      expect(error.message).toContain("Wait a few seconds")
      expect(error.message).not.toContain("52")
    })

    it("ignores a blank reset header", async () => {
      mockFetch.mockResolvedValue(jsonResponse("rate limited", 429, { "x-ratelimit-reset": " " }))

      const error = (await arctic.listSubredditPosts("programming")).swap().orThrow()

      expect(error.message).toContain("wait a minute")
      expect(error.message).not.toContain("0 seconds")
    })

    it("waits the header's reset time before retrying", async () => {
      vi.useFakeTimers()
      try {
        const timed = new ArcticShiftClient("test-agent/1.0", undefined, { fallbackMs: 3_000, maxWaitMs: 10_000 })
        mockFetch
          .mockResolvedValueOnce(
            jsonResponse('{"data":null,"error":"Timeout. Maybe slow down a bit"}', 422, { "x-ratelimit-reset": "5" }),
          )
          .mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

        const pending = timed.listSubredditPosts("programming", 3)
        await vi.advanceTimersByTimeAsync(4_999)
        expect(mockFetch).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1)
        expect(mockFetch).toHaveBeenCalledTimes(2)
        expect((await pending).isRight()).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it("retries a 429 once, then reports the reset time from the header", async () => {
      mockFetch.mockResolvedValue(jsonResponse("rate limited", 429, { "x-ratelimit-reset": "47" }))

      const error = (await arctic.listSubredditPosts("programming")).swap().orThrow()

      expect(error._tag).toBe("HttpError")
      expect(error.message).toContain("resets in 47 seconds")
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("recovers when a retried 429 succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse("rate limited", 429, { "x-ratelimit-reset": "5" }))
        .mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      const result = await arctic.listSubredditPosts("programming", 3)

      expect(result.isRight()).toBe(true)
    })

    it("handles a non-JSON body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse("<html>bad gateway</html>", 502))

      const error = (await arctic.listSubredditPosts("programming")).swap().orThrow()

      expect(error._tag).toBe("HttpError")
      expect(error.message).toContain("HTTP 502")
    })

    it("maps an empty lookup to NotFoundError", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse('{"data":[]}'))

      const error = (await arctic.getPost("zzzzzzz")).swap().orThrow()

      expect(error._tag).toBe("NotFoundError")
    })
  })

  describe("throttleWaitMs", () => {
    const delays = { fallbackMs: 3_000, maxWaitMs: 10_000 }

    it("waits for the header's reset time when it is under the cap", () => {
      expect(throttleWaitMs(Option(4), delays)).toBe(4_000)
    })

    it("caps a long reset time", () => {
      expect(throttleWaitMs(Option(47), delays)).toBe(10_000)
    })

    it("falls back when the header is absent", () => {
      expect(throttleWaitMs(Option.none<number>(), delays)).toBe(3_000)
    })
  })

  describe("caching", () => {
    it("serves a repeated request from the shared response cache", async () => {
      const cached = new ArcticShiftClient("test-agent/1.0", new ResponseCache({ maxBytes: 1_000_000 }), NO_WAIT)
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      await cached.listSubredditPosts("programming", 3)
      const second = await cached.listSubredditPosts("programming", 3)

      expect(second.orThrow().items).toHaveLength(3)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("does not cache errors", async () => {
      const cached = new ArcticShiftClient("test-agent/1.0", new ResponseCache({ maxBytes: 1_000_000 }), NO_WAIT)
      mockFetch
        .mockResolvedValueOnce(jsonResponse('{"data":null,"error":"Invalid subreddit"}', 400))
        .mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      await cached.listSubredditPosts("programming", 3)
      const second = await cached.listSubredditPosts("programming", 3)

      expect(second.isRight()).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe("getPostComments", () => {
    it("fetches the post, then its comment tree, and flattens it with depths", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(fixture("posts-ids")))
        .mockResolvedValueOnce(jsonResponse(fixture("comments-tree")))

      const { post, comments } = (await arctic.getPostComments("t3_1xgnigv")).orThrow()

      expect(post.id).toBe("1xgnigv")
      expect(comments.map((comment) => [comment.id, comment.depth])).toEqual([
        ["19rqcf34gx12c", 0],
        ["19rqcn641cazp", 1],
        ["19rqcxpyxyqht", 2],
      ])
      expect(comments[0]!.submissionTitle).toBe(post.title)
      expect(calledUrl(mockFetch, 0).searchParams.get("ids")).toBe("1xgnigv")
      expect(calledUrl(mockFetch, 1).searchParams.get("link_id")).toBe("t3_1xgnigv")
    })
  })

  describe("collapsed comments", () => {
    it("returns the ids of 'more' stubs so get_more_comments can expand them", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(fixture("posts-ids")))
        .mockResolvedValueOnce(jsonResponse(fixture("comments-tree-more")))

      const { comments, moreIds } = (await arctic.getPostComments("1xbl8y1", 6)).orThrow()

      expect(comments).toHaveLength(6)
      expect(moreIds).toHaveLength(23)
      expect(moreIds).toContain("19rith93cnjwl")
      expect(moreIds).not.toContain("_")
    })
  })

  describe("getComments", () => {
    it("looks up collapsed comments by id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("comments-ids")))

      const comments = (await arctic.getComments(["t1_19rqcf34gx12c"])).orThrow()

      expect(comments[0]!.id).toBe("19rqcf34gx12c")
      expect(comments[0]!.submissionTitle).toContain("DuckDB.NET")
      expect(calledUrl(mockFetch).searchParams.get("ids")).toBe("19rqcf34gx12c")
    })
  })

  describe("getUser", () => {
    it("builds a user from archive aggregates, dating the account by first activity", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("users-search")))

      const user = (await arctic.getUser("u/spez")).orThrow()

      expect(user.name).toBe("spez")
      expect(user.linkKarma).toBe(832984)
      expect(user.commentKarma).toBe(666948)
      expect(user.totalKarma).toBe(1499932)
      expect(user.createdUtc).toBe(1119552314)
      expect(calledUrl(mockFetch).searchParams.get("author")).toBe("spez")
    })
  })

  describe("getUserComments", () => {
    it("parses comments with their post titles", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("comments-search")))

      const page = (await arctic.getUserComments("spez", 2)).orThrow()

      expect(page.items.map((comment) => comment.id)).toEqual(["19rkhpceoips4", "19rkf2hm7ei9u"])
      expect(page.items[0]!.submissionTitle).toContain("The ceo of reddit")
      expect(page.after).toBe("1792817321")
    })
  })

  describe("searchPosts", () => {
    it("requires a subreddit", async () => {
      const result = await arctic.searchPosts("typescript")

      expect(result.swap().orThrow()._tag).toBe("ValidationError")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("maps a time filter to an offset from now", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      await arctic.searchPosts("duckdb", { subreddit: "programming", timeFilter: "week" })

      expect(calledUrl(mockFetch).searchParams.get("after")).toBe("7d")
    })

    it("sends no time bound for time_filter=all", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      await arctic.searchPosts("duckdb", { subreddit: "programming", timeFilter: "all" })

      expect(calledUrl(mockFetch).searchParams.has("after")).toBe(false)
    })

    it("searches within a subreddit", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

      await arctic.searchPosts("duckdb", { subreddit: "programming", limit: 3 })

      const url = calledUrl(mockFetch)
      expect(url.searchParams.get("query")).toBe("duckdb")
      expect(url.searchParams.get("subreddit")).toBe("programming")
    })
  })

  describe("searchSubreddits", () => {
    it("searches by name prefix", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("subreddits-prefix")))

      const page = (await arctic.searchSubreddits("r/pyth", 3)).orThrow()

      expect(page.items.map((item) => item.subreddit)).toEqual(["Python", "pythontips", "PythonProjects2"])
      expect(calledUrl(mockFetch).searchParams.get("subreddit_prefix")).toBe("pyth")
    })

    it("rejects multi-word queries without a request", async () => {
      const result = await arctic.searchSubreddits("machine learning")

      expect(result.swap().orThrow()._tag).toBe("ValidationError")
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("subreddits", () => {
    it("gets subreddit info", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("subreddits-search")))

      const sub = (await arctic.getSubredditInfo("programming")).orThrow()

      expect(sub.displayName).toBe("programming")
      expect(sub.subscribers).toBe(6744722)
    })

    it("gets subreddit rules", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fixture("subreddits-rules")))

      const rules = (await arctic.getSubredditRules("programming")).orThrow()

      expect(rules).toHaveLength(5)
      expect(rules[0]!.shortName).toBe("/r/programming is not a support forum")
      expect(calledUrl(mockFetch).searchParams.get("subreddits")).toBe("programming")
    })
  })
})

describe("RedditClient keyless routing", () => {
  const mockFetch = vi.fn()
  const keylessConfig: RedditClientConfig = {
    clientId: "",
    clientSecret: "",
    userAgent: "test-agent/1.0",
    authMode: "auto",
  }

  beforeEach(() => {
    mockFetch.mockReset()
    global.fetch = mockFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("serves sort=new from the archive", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

    const page = (await new RedditClient(keylessConfig).browseSubreddit("programming", "new", "week", 3)).orThrow()

    expect(page.source).toBe("arctic")
    expect(calledUrl(mockFetch).hostname).toBe("arctic-shift.photon-reddit.com")
  })

  it("falls back to the archive with a notice when the RSS feed fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 410, statusText: "Gone", text: async () => "" })
      .mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

    const page = (await new RedditClient(keylessConfig).browseSubreddit("programming", "hot", "week", 3)).orThrow()

    expect(calledUrl(mockFetch, 0).pathname).toContain(".rss")
    expect(page.source).toBe("arctic")
    expect(page.notice).toContain('not "hot" ranking')
  })

  it("falls back when a retired feed answers 200 with an HTML page", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "<html><body>RSS is gone</body></html>" })
      .mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

    const page = (await new RedditClient(keylessConfig).getTopPosts("programming", "week", 3)).orThrow()

    expect(page.source).toBe("arctic")
    expect(page.notice).toContain("returned no posts")
  })

  it("notes that the archive ignored a non-new sort for user posts", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

    const page = (await new RedditClient(keylessConfig).getUserPosts("spez", { sort: "top", limit: 3 })).orThrow()

    expect(page.notice).toContain('sort="top" was ignored')
  })

  it("adds no sort notice for a search with the default relevance sort", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

    const page = (await new RedditClient(keylessConfig).searchReddit("duckdb", { subreddit: "programming" })).orThrow()

    expect(page.notice).toBeUndefined()
  })

  it("notes that the archive ignored an explicit search sort", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(fixture("posts-search")))

    const page = (
      await new RedditClient(keylessConfig).searchReddit("duckdb", { subreddit: "programming", sort: "top" })
    ).orThrow()

    expect(page.notice).toContain('sort="top" was ignored')
  })

  it("adds no sort notice when the caller asked for new", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(fixture("comments-search")))

    const page = (await new RedditClient(keylessConfig).getUserComments("spez", { sort: "new", limit: 2 })).orThrow()

    expect(page.notice).toBeUndefined()
  })

  it("returns the RSS error when paging with an RSS cursor, without asking the archive", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, statusText: "Too Many Requests", text: async () => "" })

    const result = await new RedditClient(keylessConfig).browseSubreddit("programming", "hot", "week", 3, "t3_abc123")

    const error = result.swap().orThrow()
    expect(error._tag).toBe("HttpError")
    expect(error.message).toContain("RSS")
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("returns the RSS error for the home feed, which the archive cannot serve", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 410, statusText: "Gone", text: async () => "" })

    const result = await new RedditClient(keylessConfig).browseSubreddit("", "hot")

    expect(result.swap().orThrow()._tag).toBe("HttpError")
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("routes get_post_comments to the archive", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(fixture("posts-ids")))
      .mockResolvedValueOnce(jsonResponse(fixture("comments-tree")))

    const result = await new RedditClient(keylessConfig).getPostComments("1xgnigv", "programming")

    expect(result.orThrow().comments).toHaveLength(3)
  })

  it("routes search type=sr to subreddit prefix search", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(fixture("subreddits-prefix")))

    await new RedditClient(keylessConfig).searchReddit("pyth", { type: "sr" })

    expect(calledUrl(mockFetch).pathname).toBe("/api/subreddits/search")
  })

  it.each([
    ["search_reddit type=user", (client: RedditClient) => client.searchReddit("spez", { type: "user" })],
    ["get_trending_subreddits", (client: RedditClient) => client.getTrendingSubreddits()],
    ["get_post_flairs", (client: RedditClient) => client.getPostFlairs("programming")],
    ["get_me", (client: RedditClient) => client.getMe()],
  ])("keeps %s OAuth-only, without a request", async (_label, call) => {
    const result = await call(new RedditClient(keylessConfig))

    expect(result.swap().orThrow()._tag).toBe("NotAuthenticatedError")
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
