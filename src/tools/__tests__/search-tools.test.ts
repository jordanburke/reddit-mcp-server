import { describe, it, expect, vi, beforeEach } from "vitest"
import { searchReddit } from "../search-tools"
import { getRedditClient } from "../../client/reddit-client"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

vi.mock("../../client/reddit-client")

describe("searchReddit", () => {
  const mockRedditClient = {
    searchReddit: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getRedditClient).mockReturnValue(mockRedditClient as any)
  })

  it("should search Reddit with default parameters", async () => {
    const mockPosts = [
      {
        id: "test1",
        title: "Test Post 1",
        author: "testuser1",
        subreddit: "testsubreddit",
        score: 100,
        upvoteRatio: 0.95,
        numComments: 10,
        createdUtc: 1700000000,
        selftext: "This is a test post",
        permalink: "/r/testsubreddit/comments/test1",
        over18: false,
        spoiler: false,
      },
    ]

    mockRedditClient.searchReddit.mockResolvedValue(mockPosts)

    const result = await searchReddit({ query: "test query" })

    expect(mockRedditClient.searchReddit).toHaveBeenCalledWith("test query", {
      subreddit: undefined,
      sort: "relevance",
      timeFilter: "all",
      limit: 10,
      type: "link",
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe("text")
    expect(result.content[0].text).toContain('Reddit Search Results for: "test query"')
    expect(result.content[0].text).toContain("Test Post 1")
  })

  it("should search within a specific subreddit", async () => {
    mockRedditClient.searchReddit.mockResolvedValue([])

    await searchReddit({
      query: "test",
      subreddit: "programming",
      sort: "top",
      time_filter: "week",
      limit: 5,
      type: "link",
    })

    expect(mockRedditClient.searchReddit).toHaveBeenCalledWith("test", {
      subreddit: "programming",
      sort: "top",
      timeFilter: "week",
      limit: 5,
      type: "link",
    })
  })

  it("should throw error if Reddit client is not initialized", async () => {
    vi.mocked(getRedditClient).mockReturnValue(null)

    await expect(searchReddit({ query: "test" })).rejects.toThrow(
      new McpError(ErrorCode.InternalError, "Reddit client not initialized"),
    )
  })

  it("should throw error if query is empty", async () => {
    await expect(searchReddit({ query: "" })).rejects.toThrow(
      new McpError(ErrorCode.InvalidParams, "Search query cannot be empty"),
    )

    await expect(searchReddit({ query: "   " })).rejects.toThrow(
      new McpError(ErrorCode.InvalidParams, "Search query cannot be empty"),
    )
  })

  it("should handle search errors", async () => {
    mockRedditClient.searchReddit.mockRejectedValue(new Error("API Error"))

    await expect(searchReddit({ query: "test" })).rejects.toThrow(
      new McpError(ErrorCode.InternalError, "Failed to search Reddit: Error: API Error"),
    )
  })
})
