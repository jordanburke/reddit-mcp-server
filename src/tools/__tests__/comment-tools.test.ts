import { describe, it, expect, vi, beforeEach } from "vitest"
import { getPostComments } from "../comment-tools"
import { getRedditClient } from "../../client/reddit-client"
import { UserError } from "fastmcp"

vi.mock("../../client/reddit-client")

describe("getPostComments", () => {
  const mockRedditClient = {
    getPostComments: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getRedditClient).mockReturnValue(mockRedditClient as any)
  })

  it("should fetch post comments with default parameters", async () => {
    const mockData = {
      post: {
        id: "test123",
        title: "Test Post Title",
        author: "testauthor",
        subreddit: "testsubreddit",
        score: 500,
        upvoteRatio: 0.9,
        numComments: 25,
        createdUtc: 1700000000,
        selftext: "This is the post content",
        permalink: "/r/testsubreddit/comments/test123",
        over18: false,
        spoiler: false,
      },
      comments: [
        {
          id: "comment1",
          author: "commenter1",
          body: "This is a comment",
          score: 10,
          createdUtc: 1700000100,
          edited: false,
          isSubmitter: false,
          depth: 0,
        },
        {
          id: "comment2",
          author: "testauthor",
          body: "This is a reply from OP",
          score: 5,
          createdUtc: 1700000200,
          edited: true,
          isSubmitter: true,
          depth: 1,
        },
      ],
    }

    mockRedditClient.getPostComments.mockResolvedValue(mockData)

    const result = await getPostComments({
      post_id: "test123",
      subreddit: "testsubreddit",
    })

    expect(mockRedditClient.getPostComments).toHaveBeenCalledWith("test123", "testsubreddit", {
      sort: "best",
      limit: 100,
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe("text")
    expect(result.content[0].text).toContain("Comments for: Test Post Title")
    expect(result.content[0].text).toContain("**u/commenter1**")
    expect(result.content[0].text).toContain("**u/testauthor** **[OP]**")
    expect(result.content[0].text).toContain("└─")
  })

  it("should fetch comments with custom parameters", async () => {
    mockRedditClient.getPostComments.mockResolvedValue({ post: {}, comments: [] })

    await getPostComments({
      post_id: "test456",
      subreddit: "programming",
      sort: "controversial",
      limit: 50,
    })

    expect(mockRedditClient.getPostComments).toHaveBeenCalledWith("test456", "programming", {
      sort: "controversial",
      limit: 50,
    })
  })

  it("should throw error if Reddit client is not initialized", async () => {
    vi.mocked(getRedditClient).mockReturnValue(null)

    await expect(getPostComments({ post_id: "test", subreddit: "test" })).rejects.toThrow(
      new UserError("Reddit client not initialized"),
    )
  })

  it("should throw error if required parameters are missing", async () => {
    await expect(getPostComments({ post_id: "", subreddit: "test" })).rejects.toThrow(
      new UserError("post_id and subreddit are required"),
    )

    await expect(getPostComments({ post_id: "test", subreddit: "" })).rejects.toThrow(
      new UserError("post_id and subreddit are required"),
    )
  })

  it("should handle API errors", async () => {
    mockRedditClient.getPostComments.mockRejectedValue(new Error("API Error"))

    await expect(getPostComments({ post_id: "test", subreddit: "test" })).rejects.toThrow(
      new UserError("Failed to fetch comments: Error: API Error"),
    )
  })
})
