import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { RedditClientConfig } from "../../types"
import { RedditClient } from "../reddit-client"
import { atomEntryToRedditPost, parseAtomFeed, RssClient } from "../rss-client"

const fixtureXml = readFileSync(resolve(__dirname, "fixtures/programming-top.rss.xml"), "utf-8")

const originalFetch = global.fetch

describe("parseAtomFeed", () => {
  it("parses 25 entries from the r/programming fixture", () => {
    const entries = parseAtomFeed(fixtureXml)
    expect(entries).toHaveLength(25)
  })

  it("extracts entry fields correctly", () => {
    const entries = parseAtomFeed(fixtureXml)
    const first = entries[0]!
    expect(first.title).toBe("Shopify is moving from React Native back to Swift and Kotlin")
    expect(first.author?.name).toBe("/u/soap94")
    expect(first.category?.["@_term"]).toBe("programming")
    expect(first.id).toBe("t3_1wd7wmu")
    expect(first.link?.["@_href"]).toContain("/r/programming/comments/1wd7wmu/")
  })

  it("returns empty array for empty feed", () => {
    const xml = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>'
    expect(parseAtomFeed(xml)).toEqual([])
  })

  it("wraps a single entry in an array", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><id>t3_abc</id><title>Solo</title></entry>
    </feed>`
    const entries = parseAtomFeed(xml)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.title).toBe("Solo")
  })
})

describe("atomEntryToRedditPost", () => {
  it("maps a link post correctly", () => {
    const entries = parseAtomFeed(fixtureXml)
    const post = atomEntryToRedditPost(entries[0]!)

    expect(post.id).toBe("1wd7wmu")
    expect(post.title).toBe("Shopify is moving from React Native back to Swift and Kotlin")
    expect(post.author).toBe("soap94")
    expect(post.subreddit).toBe("programming")
    expect(post.isSelf).toBe(false)
    expect(post.url).toBe("https://shopify.engineering/back-to-native")
    expect(post.selftext).toBe("")
    expect(post.score).toBe(0)
    expect(post.numComments).toBe(0)
    expect(post.upvoteRatio).toBe(0)
    expect(post.over18).toBe(false)
    expect(post.permalink).toContain("/r/programming/comments/1wd7wmu/")
    expect(post.createdUtc).toBeGreaterThan(0)
  })

  it("extracts self-text from SC_OFF/SC_ON blocks for self-posts", () => {
    const selfPostXml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <author><name>/u/testuser</name></author>
        <category term="askreddit" label="r/askreddit"/>
        <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;What is your favorite pattern?&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt; submitted by /u/testuser &lt;a href="https://www.reddit.com/r/askreddit/comments/abc123/whats_your_fave/"&gt;[link]&lt;/a&gt;</content>
        <id>t3_abc123</id>
        <link href="https://www.reddit.com/r/askreddit/comments/abc123/whats_your_fave/"/>
        <published>2026-09-17T00:00:00+00:00</published>
        <title>What is your favorite pattern?</title>
      </entry>
    </feed>`
    const entries = parseAtomFeed(selfPostXml)
    const post = atomEntryToRedditPost(entries[0]!)

    expect(post.isSelf).toBe(true)
    expect(post.selftext).toContain("What is your favorite pattern?")
    expect(post.selftext).not.toContain("<div")
    expect(post.selftext).not.toContain("SC_OFF")
  })

  it("identifies link posts with SC_OFF content as link posts and preserves body text", () => {
    const entries = parseAtomFeed(fixtureXml)
    const entry = entries.find((e) => e.id === "t3_1wgvjin")!
    const post = atomEntryToRedditPost(entry)

    expect(post.isSelf).toBe(false)
    expect(post.url).toContain("substack.com")
    expect(post.selftext).toContain("codebase")
  })

  it("strips /u/ prefix from author", () => {
    const entries = parseAtomFeed(fixtureXml)
    const post = atomEntryToRedditPost(entries[0]!)
    expect(post.author).toBe("soap94")
    expect(post.author).not.toContain("/u/")
  })

  it("decodes HTML entities in external link URLs", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <author><name>/u/testuser</name></author>
        <category term="programming" label="r/programming"/>
        <content type="html">submitted by /u/testuser &lt;a href="https://example.com/watch?v=abc&amp;amp;t=10s"&gt;[link]&lt;/a&gt;</content>
        <id>t3_entity</id>
        <link href="https://www.reddit.com/r/programming/comments/entity/test/"/>
        <published>2026-09-17T00:00:00+00:00</published>
        <title>Entity test</title>
      </entry>
    </feed>`
    const entries = parseAtomFeed(xml)
    const post = atomEntryToRedditPost(entries[0]!)

    expect(post.isSelf).toBe(false)
    expect(post.url).toBe("https://example.com/watch?v=abc&t=10s")
    expect(post.url).not.toContain("&amp;")
  })
})

describe("RssClient", () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    global.fetch = mockFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("fetches and parses a subreddit feed", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => fixtureXml,
    })

    const client = new RssClient("TestAgent/1.0")
    const result = await client.fetchSubredditPosts("programming", "top", "week")

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.items).toHaveLength(25)
      expect(result.value.source).toBe("rss")
      expect(result.value.after).toBeUndefined()
      expect(result.value.items[0]!.title).toBe("Shopify is moving from React Native back to Swift and Kotlin")
    }

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain("https://www.reddit.com/r/programming/top/.rss")
    expect(calledUrl).toContain("t=week")
  })

  it("respects limit param and sets after cursor when more items exist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => fixtureXml,
    })

    const client = new RssClient("TestAgent/1.0")
    const result = await client.fetchSubredditPosts("programming", "top", "week", 10)

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.items).toHaveLength(10)
      expect(result.value.after).toBeDefined()
      expect(result.value.after).toMatch(/^t3_/)
    }

    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain("limit=10")
  })

  it("builds correct URL for hot sort (no sort path)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => fixtureXml,
    })

    const client = new RssClient("TestAgent/1.0")
    await client.fetchSubredditPosts("programming", "hot")

    expect(mockFetch).toHaveBeenCalledWith("https://www.reddit.com/r/programming/.rss", expect.any(Object))
  })

  it("builds correct URL for home feed (empty subreddit)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => fixtureXml,
    })

    const client = new RssClient("TestAgent/1.0")
    await client.fetchSubredditPosts("", "hot")

    expect(mockFetch).toHaveBeenCalledWith("https://www.reddit.com/.rss", expect.any(Object))
  })

  it("returns Left on 429", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    })

    const client = new RssClient("TestAgent/1.0")
    const result = await client.fetchSubredditPosts("programming", "hot")

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value.message).toContain("rate limit")
    }
  })

  it("returns Left on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    })

    const client = new RssClient("TestAgent/1.0")
    const result = await client.fetchSubredditPosts("programming", "hot")

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value.message).toContain("503")
    }
  })

  it("caches successful results and does not refetch within TTL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => fixtureXml,
    })

    const client = new RssClient("TestAgent/1.0")
    await client.fetchSubredditPosts("programming", "hot")
    await client.fetchSubredditPosts("programming", "hot")

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("does not cache error responses", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => fixtureXml })

    const client = new RssClient("TestAgent/1.0")
    const first = await client.fetchSubredditPosts("programming", "hot")
    const second = await client.fetchSubredditPosts("programming", "hot")

    expect(first.isLeft()).toBe(true)
    expect(second.isRight()).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("uses normalized URL as cache key so r/programming and programming share a cache entry", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => fixtureXml,
    })

    const client = new RssClient("TestAgent/1.0")
    await client.fetchSubredditPosts("programming", "hot")
    await client.fetchSubredditPosts("r/programming", "hot")

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe("RedditClient RSS mode", () => {
  const mockFetch = vi.fn()
  const rssConfig: RedditClientConfig = {
    clientId: "",
    clientSecret: "",
    userAgent: "TestApp/1.0.0",
    authMode: "anonymous",
    retry: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 60000 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    global.fetch = mockFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("sets usesRss = true when authMode is anonymous", () => {
    const client = new RedditClient(rssConfig)
    expect(client.usesRss).toBe(true)
  })

  it("sets usesRss = true when authMode is auto without credentials", () => {
    const client = new RedditClient({
      clientId: "",
      clientSecret: "",
      userAgent: "TestApp/1.0.0",
      authMode: "auto",
    })
    expect(client.usesRss).toBe(true)
  })

  it("sets usesRss = false when OAuth credentials are provided", () => {
    const client = new RedditClient({
      clientId: "id",
      clientSecret: "secret",
      userAgent: "TestApp/1.0.0",
      authMode: "auto",
    })
    expect(client.usesRss).toBe(false)
  })

  it("browseSubreddit delegates to RSS and respects default limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => fixtureXml,
    })

    const client = new RedditClient(rssConfig)
    const result = await client.browseSubreddit("programming", "hot")

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.source).toBe("rss")
      expect(result.value.items).toHaveLength(10)
      expect(result.value.after).toBeDefined()
    }

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const calledUrl = mockFetch.mock.calls[0]![0] as string
    expect(calledUrl).toContain(".rss")
    expect(calledUrl).toContain("limit=10")
  })

  it("getTopPosts delegates to RSS in anonymous mode", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => fixtureXml,
    })

    const client = new RedditClient(rssConfig)
    const result = await client.getTopPosts("programming", "week")

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.source).toBe("rss")
    }

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0]![0]).toContain(".rss")
  })

  it("searchReddit returns Left without making any request", async () => {
    const client = new RedditClient(rssConfig)
    const result = await client.searchReddit("test query", {})

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value._tag).toBe("NotAuthenticatedError")
      expect(result.value.message).toContain("search_reddit")
      expect(result.value.message).toContain("OAuth credentials")
    }

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("getUser returns Left without making any request", async () => {
    const client = new RedditClient(rssConfig)
    const result = await client.getUser("someone")

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value._tag).toBe("NotAuthenticatedError")
    }

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("getPostComments returns Left without making any request", async () => {
    const client = new RedditClient(rssConfig)
    const result = await client.getPostComments("abc123", "programming")

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value._tag).toBe("NotAuthenticatedError")
    }

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("createPost returns NotAuthenticatedError in RSS mode", async () => {
    const client = new RedditClient(rssConfig)
    const result = await client.createPost("test", "title", "body")

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value._tag).toBe("NotAuthenticatedError")
    }

    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("RssClient validation", () => {
  it("returns ValidationError for invalid subreddit", async () => {
    const client = new RssClient("TestAgent/1.0")
    const result = await client.fetchSubredditPosts("../../api/v1/me", "hot")

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value._tag).toBe("ValidationError")
    }
  })
})

describe("parseTagValue: false", () => {
  it("preserves numeric titles as strings", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><id>t3_num</id><title>12345</title></entry>
    </feed>`
    const entries = parseAtomFeed(xml)
    expect(entries[0]!.title).toBe("12345")
    expect(typeof entries[0]!.title).toBe("string")
  })

  it("preserves numeric IDs as strings", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><id>99999</id><title>Test</title></entry>
    </feed>`
    const entries = parseAtomFeed(xml)
    expect(entries[0]!.id).toBe("99999")
    expect(typeof entries[0]!.id).toBe("string")
  })
})
