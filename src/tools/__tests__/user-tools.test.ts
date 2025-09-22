import { describe, it, expect, vi, beforeEach } from "vitest"
import { getUserInfo, getUserPosts, getUserComments } from "../user-tools"
import { getRedditClient } from "../../client/reddit-client"
import { UserError } from "fastmcp"

vi.mock("../../client/reddit-client")

describe("user-tools", () => {
  const mockRedditClient = {
    getUser: vi.fn(),
    getUserPosts: vi.fn(),
    getUserComments: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getRedditClient).mockReturnValue(mockRedditClient as any)
  })

  describe("getUserInfo", () => {
    it("should fetch and format user information", async () => {
      const mockUser = {
        name: "testuser",
        id: "user123",
        commentKarma: 5000,
        linkKarma: 1000,
        totalKarma: 6000,
        isMod: true,
        isGold: false,
        isEmployee: false,
        createdUtc: 1600000000,
        profileUrl: "https://reddit.com/user/testuser",
      }

      mockRedditClient.getUser.mockResolvedValue(mockUser)

      const result = await getUserInfo({ username: "testuser" })

      expect(mockRedditClient.getUser).toHaveBeenCalledWith("testuser")
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toContain("User Information: u/testuser")
      expect(result.content[0].text).toContain("Comment Karma: 5,000")
      expect(result.content[0].text).toContain("Moderator")
    })

    it("should throw error if Reddit client is not initialized", async () => {
      vi.mocked(getRedditClient).mockReturnValue(null)

      await expect(getUserInfo({ username: "test" })).rejects.toThrow(new UserError("Reddit client not initialized"))
    })

    it("should handle API errors", async () => {
      mockRedditClient.getUser.mockRejectedValue(new Error("User not found"))

      await expect(getUserInfo({ username: "nonexistent" })).rejects.toThrow(
        new UserError("Failed to fetch user data: Error: User not found"),
      )
    })
  })

  describe("getUserPosts", () => {
    it("should fetch user posts with default parameters", async () => {
      const mockPosts = [
        {
          id: "post1",
          title: "My First Post",
          author: "testuser",
          subreddit: "programming",
          score: 100,
          upvoteRatio: 0.95,
          numComments: 20,
          createdUtc: 1700000000,
          selftext: "This is my post content",
          permalink: "/r/programming/comments/post1",
          over18: false,
          spoiler: false,
        },
      ]

      mockRedditClient.getUserPosts.mockResolvedValue(mockPosts)

      const result = await getUserPosts({ username: "testuser" })

      expect(mockRedditClient.getUserPosts).toHaveBeenCalledWith("testuser", {
        sort: "new",
        timeFilter: "all",
        limit: 10,
      })

      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toContain("Posts by u/testuser")
      expect(result.content[0].text).toContain("My First Post")
      expect(result.content[0].text).toContain("Subreddit: r/programming")
    })

    it("should fetch posts with custom parameters", async () => {
      mockRedditClient.getUserPosts.mockResolvedValue([])

      await getUserPosts({
        username: "testuser",
        sort: "top",
        time_filter: "week",
        limit: 25,
      })

      expect(mockRedditClient.getUserPosts).toHaveBeenCalledWith("testuser", {
        sort: "top",
        timeFilter: "week",
        limit: 25,
      })
    })

    it("should handle NSFW and spoiler posts", async () => {
      const mockPosts = [
        {
          id: "post2",
          title: "NSFW Post",
          author: "testuser",
          subreddit: "test",
          score: 50,
          upvoteRatio: 0.8,
          numComments: 5,
          createdUtc: 1700000000,
          selftext: "",
          permalink: "/r/test/comments/post2",
          over18: true,
          spoiler: true,
        },
      ]

      mockRedditClient.getUserPosts.mockResolvedValue(mockPosts)

      const result = await getUserPosts({ username: "testuser" })

      expect(result.content[0].text).toContain("**NSFW**")
      expect(result.content[0].text).toContain("**Spoiler**")
    })

    it("should throw error if Reddit client is not initialized", async () => {
      vi.mocked(getRedditClient).mockReturnValue(null)

      await expect(getUserPosts({ username: "test" })).rejects.toThrow(new UserError("Reddit client not initialized"))
    })

    it("should handle API errors", async () => {
      mockRedditClient.getUserPosts.mockRejectedValue(new Error("API Error"))

      await expect(getUserPosts({ username: "test" })).rejects.toThrow(
        new UserError("Failed to fetch user posts: Error: API Error"),
      )
    })
  })

  describe("getUserComments", () => {
    it("should fetch user comments with default parameters", async () => {
      const mockComments = [
        {
          id: "comment1",
          author: "testuser",
          body: "This is my insightful comment",
          score: 42,
          subreddit: "programming",
          submissionTitle: "Cool Programming Topic",
          createdUtc: 1700000000,
          edited: false,
          isSubmitter: false,
          permalink: "/r/programming/comments/xyz/cool_programming_topic/comment1",
        },
      ]

      mockRedditClient.getUserComments.mockResolvedValue(mockComments)

      const result = await getUserComments({ username: "testuser" })

      expect(mockRedditClient.getUserComments).toHaveBeenCalledWith("testuser", {
        sort: "new",
        timeFilter: "all",
        limit: 10,
      })

      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe("text")
      expect(result.content[0].text).toContain("Comments by u/testuser")
      expect(result.content[0].text).toContain('In r/programming on "Cool Programming Topic"')
      expect(result.content[0].text).toContain("This is my insightful comment")
    })

    it("should handle edited comments", async () => {
      const mockComments = [
        {
          id: "comment2",
          author: "testuser",
          body: "Edited comment text",
          score: 10,
          subreddit: "test",
          submissionTitle: "Test Post",
          createdUtc: 1700000000,
          edited: true,
          isSubmitter: false,
          permalink: "/r/test/comments/abc/test_post/comment2",
        },
      ]

      mockRedditClient.getUserComments.mockResolvedValue(mockComments)

      const result = await getUserComments({ username: "testuser" })

      expect(result.content[0].text).toContain("*(edited)*")
    })

    it("should truncate long comments", async () => {
      const longComment = "x".repeat(350)
      const mockComments = [
        {
          id: "comment3",
          author: "testuser",
          body: longComment,
          score: 5,
          subreddit: "test",
          submissionTitle: "Test",
          createdUtc: 1700000000,
          edited: false,
          isSubmitter: false,
          permalink: "/r/test/comments/def/test/comment3",
        },
      ]

      mockRedditClient.getUserComments.mockResolvedValue(mockComments)

      const result = await getUserComments({ username: "testuser" })

      expect(result.content[0].text).toContain("x".repeat(300) + "...")
      expect(result.content[0].text).not.toContain("x".repeat(301))
    })

    it("should throw error if Reddit client is not initialized", async () => {
      vi.mocked(getRedditClient).mockReturnValue(null)

      await expect(getUserComments({ username: "test" })).rejects.toThrow(
        new UserError("Reddit client not initialized"),
      )
    })

    it("should handle API errors", async () => {
      mockRedditClient.getUserComments.mockRejectedValue(new Error("API Error"))

      await expect(getUserComments({ username: "test" })).rejects.toThrow(
        new UserError("Failed to fetch user comments: Error: API Error"),
      )
    })
  })
})
