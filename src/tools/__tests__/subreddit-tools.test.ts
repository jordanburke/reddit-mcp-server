import { describe, it, expect, vi, beforeEach } from "vitest"
import { getSubredditInfo, getTrendingSubreddits } from "../subreddit-tools"
import { getRedditClient } from "../../client/reddit-client"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

vi.mock("../../client/reddit-client")
vi.mock("../../utils/formatters")

// Mock the formatters
vi.mock("../../utils/formatters", () => ({
  formatSubredditInfo: vi.fn((subreddit) => ({
    name: subreddit.displayName,
    title: subreddit.title,
    stats: {
      subscribers: subreddit.subscribers,
      activeUsers: subreddit.activeUserCount || "N/A",
    },
    description: {
      short: subreddit.publicDescription,
      full: subreddit.description,
    },
    metadata: {
      created: new Date(subreddit.createdUtc * 1000).toISOString(),
      flags: [
        ...(subreddit.over18 ? ["NSFW"] : []),
        ...(subreddit.subredditType === "private" ? ["Private"] : []),
      ],
    },
    links: {
      subreddit: `https://reddit.com/r/${subreddit.displayName}`,
      wiki: `https://reddit.com/r/${subreddit.displayName}/wiki`,
    },
    communityAnalysis: "Active community",
    engagementTips: "Be respectful and follow rules",
  })),
}))

describe("subreddit-tools", () => {
  const mockRedditClient = {
    getSubredditInfo: vi.fn(),
    getTrendingSubreddits: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getRedditClient).mockReturnValue(mockRedditClient as any)
  })

  describe("getSubredditInfo", () => {
    it("should fetch and format subreddit information", async () => {
      const mockSubreddit = {
        displayName: "programming",
        title: "Programming",
        description: "A subreddit for programming discussions",
        publicDescription: "Public description",
        subscribers: 1000000,
        activeUserCount: 5000,
        createdUtc: 1234567890,
        over18: false,
        subredditType: "public",
        url: "/r/programming/"
      }

      mockRedditClient.getSubredditInfo.mockResolvedValue(mockSubreddit)

      const result = await getSubredditInfo({
        subreddit_name: "programming"
      })

      expect(mockRedditClient.getSubredditInfo).toHaveBeenCalledWith("programming")
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toContain("Subreddit Information: r/programming")
      expect(result.content[0].text).toContain("Programming")
    })

    it("should throw error if Reddit client is not initialized", async () => {
      vi.mocked(getRedditClient).mockReturnValue(null)

      await expect(getSubredditInfo({ subreddit_name: "test" })).rejects.toThrow(
        new McpError(ErrorCode.InternalError, "Reddit client not initialized")
      )
    })

    it("should handle API errors", async () => {
      mockRedditClient.getSubredditInfo.mockRejectedValue(new Error("Subreddit not found"))

      await expect(getSubredditInfo({ subreddit_name: "nonexistent" })).rejects.toThrow(
        new McpError(ErrorCode.InternalError, "Failed to fetch subreddit data: Error: Subreddit not found")
      )
    })

    it("should handle subreddits with null active user count", async () => {
      const mockSubreddit = {
        displayName: "programming",
        title: "Programming",
        description: "A subreddit for programming discussions",
        publicDescription: "Public description",  
        subscribers: 1000000,
        activeUserCount: null,
        createdUtc: 1234567890,
        over18: false,
        subredditType: "public",
        url: "/r/programming/"
      }

      mockRedditClient.getSubredditInfo.mockResolvedValue(mockSubreddit)

      const result = await getSubredditInfo({
        subreddit_name: "programming"
      })

      expect(result.content[0].text).toContain("Active Users: N/A")
    })

    it("should handle NSFW subreddits", async () => {
      const mockSubreddit = {
        displayName: "nsfw_subreddit",
        title: "NSFW Content",
        description: "Adult content",
        publicDescription: "Adult content",
        subscribers: 100000,
        activeUserCount: 1000,
        createdUtc: 1234567890,
        over18: true,
        subredditType: "public",
        url: "/r/nsfw_subreddit/"
      }

      mockRedditClient.getSubredditInfo.mockResolvedValue(mockSubreddit)

      const result = await getSubredditInfo({
        subreddit_name: "nsfw_subreddit"
      })

      expect(result.content[0].text).toContain("NSFW")
    })
  })

  describe("getTrendingSubreddits", () => {
    it("should fetch trending subreddits", async () => {
      const mockTrending = ["programming", "javascript", "python", "webdev", "technology"]

      mockRedditClient.getTrendingSubreddits.mockResolvedValue(mockTrending)

      const result = await getTrendingSubreddits()

      expect(mockRedditClient.getTrendingSubreddits).toHaveBeenCalled()
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toContain("Trending Subreddits")
      expect(result.content[0].text).toContain("r/programming")
      expect(result.content[0].text).toContain("r/javascript")
    })

    it("should throw error if Reddit client is not initialized", async () => {
      vi.mocked(getRedditClient).mockReturnValue(null)

      await expect(getTrendingSubreddits()).rejects.toThrow(
        new McpError(ErrorCode.InternalError, "Reddit client not initialized")
      )
    })

    it("should handle API errors", async () => {
      mockRedditClient.getTrendingSubreddits.mockRejectedValue(new Error("API Error"))

      await expect(getTrendingSubreddits()).rejects.toThrow(
        new McpError(ErrorCode.InternalError, "Failed to fetch trending subreddits: Error: API Error")
      )
    })

    it("should handle empty trending subreddits list", async () => {
      mockRedditClient.getTrendingSubreddits.mockResolvedValue([])

      const result = await getTrendingSubreddits()

      expect(result.content[0].text).toContain("Trending Subreddits")
    })
  })
})