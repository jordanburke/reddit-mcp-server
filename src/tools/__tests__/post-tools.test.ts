import { describe, it, expect, vi, beforeEach } from "vitest"
import { getRedditPost, getTopPosts } from "../post-tools"
import { getRedditClient } from "../../client/reddit-client"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

vi.mock("../../client/reddit-client")
vi.mock("../../utils/formatters")

// Mock the formatters
vi.mock("../../utils/formatters", () => ({
  formatPostInfo: vi.fn((post) => ({
    title: post.title,
    author: post.author,
    subreddit: post.subreddit,
    type: post.isVideo ? "Video Post" : post.selftext ? "Text Post" : "Link Post",
    content: post.selftext || post.url,
    stats: {
      score: post.score,
      upvoteRatio: post.upvoteRatio,
      comments: post.numComments,
    },
    metadata: {
      posted: new Date(post.createdUtc * 1000).toISOString(),
      flags: [
        ...(post.over18 ? ["NSFW"] : []),
        ...(post.spoiler ? ["Spoiler"] : []),
        ...(post.edited ? ["Edited"] : []),
      ],
      flair: post.linkFlairText || "None",
    },
    links: {
      fullPost: `https://reddit.com${post.permalink}`,
      shortLink: `https://redd.it/${post.id}`,
    },
    engagementAnalysis: "Good engagement",
    bestTimeToEngage: "Anytime",
  })),
}))

describe("post-tools", () => {
  const mockRedditClient = {
    getPost: vi.fn(),
    getTopPosts: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getRedditClient).mockReturnValue(mockRedditClient as any)
  })

  describe("getRedditPost", () => {
    it("should fetch and format a single post", async () => {
      const mockPost = {
        id: "test123",
        title: "Test Post Title",
        author: "testauthor",
        subreddit: "programming",
        selftext: "This is the post content",
        url: "https://example.com",
        score: 500,
        upvoteRatio: 0.9,
        numComments: 25,
        createdUtc: 1700000000,
        over18: false,
        spoiler: false,
        edited: false,
        isVideo: false,
        linkFlairText: "Discussion",
        permalink: "/r/programming/comments/test123/test_post_title/"
      }

      mockRedditClient.getPost.mockResolvedValue(mockPost)

      const result = await getRedditPost({
        subreddit: "programming",
        post_id: "test123"
      })

      expect(mockRedditClient.getPost).toHaveBeenCalledWith("test123", "programming")
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toContain("Post from r/programming")
      expect(result.content[0].text).toContain("Test Post Title")
      expect(result.content[0].text).toContain("u/testauthor")
    })

    it("should throw error if Reddit client is not initialized", async () => {
      vi.mocked(getRedditClient).mockReturnValue(null)

      await expect(getRedditPost({ subreddit: "test", post_id: "123" })).rejects.toThrow(
        new McpError(ErrorCode.InternalError, "Reddit client not initialized")
      )
    })

    it("should handle API errors", async () => {
      mockRedditClient.getPost.mockRejectedValue(new Error("Post not found"))

      await expect(getRedditPost({ subreddit: "test", post_id: "123" })).rejects.toThrow(
        new McpError(ErrorCode.InternalError, "Failed to fetch post data: Error: Post not found")
      )
    })
  })

  describe("getTopPosts", () => {
    it("should fetch top posts with default parameters", async () => {
      const mockPosts = [
        {
          id: "post1",
          title: "Top Post 1",
          author: "author1",
          subreddit: "programming",
          selftext: "Content 1",
          url: "https://reddit.com/r/programming/post1",
          score: 1000,
          upvoteRatio: 0.95,
          numComments: 50,
          createdUtc: 1700000000,
          over18: false,
          spoiler: false,
          edited: false,
          isVideo: false,
          linkFlairText: "Discussion",
          permalink: "/r/programming/comments/post1/"
        }
      ]

      mockRedditClient.getTopPosts.mockResolvedValue(mockPosts)

      const result = await getTopPosts({
        subreddit: "programming"
      })

      expect(mockRedditClient.getTopPosts).toHaveBeenCalledWith("programming", "week", 10)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toContain("Top Posts from r/programming")
      expect(result.content[0].text).toContain("Top Post 1")
    })

    it("should fetch posts with custom parameters", async () => {
      mockRedditClient.getTopPosts.mockResolvedValue([])

      await getTopPosts({
        subreddit: "test",
        time_filter: "day", 
        limit: 5
      })

      expect(mockRedditClient.getTopPosts).toHaveBeenCalledWith("test", "day", 5)
    })

    it("should throw error if Reddit client is not initialized", async () => {
      vi.mocked(getRedditClient).mockReturnValue(null)

      await expect(getTopPosts({ subreddit: "test" })).rejects.toThrow(
        new McpError(ErrorCode.InternalError, "Reddit client not initialized")
      )
    })

    it("should handle API errors", async () => {
      mockRedditClient.getTopPosts.mockRejectedValue(new Error("Subreddit not found"))

      await expect(getTopPosts({ subreddit: "test" })).rejects.toThrow(
        new McpError(ErrorCode.InternalError, "Failed to fetch top posts: Error: Subreddit not found")
      )
    })
  })
})