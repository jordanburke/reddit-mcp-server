import { getRedditClient } from "../client/reddit-client"
import { formatPostInfo, formatCommentInfo } from "../utils/formatters"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

export async function getRedditPost(params: { subreddit: string; post_id: string }) {
  const { subreddit, post_id } = params
  const client = getRedditClient()

  if (!client) {
    throw new McpError(ErrorCode.InternalError, "Reddit client not initialized")
  }

  try {
    // Getting post
    const post = await client.getPost(post_id, subreddit)
    const formattedPost = formatPostInfo(post)

    return {
      content: [
        {
          type: "text",
          text: `
# Post from r/${formattedPost.subreddit}

## Post Details
- Title: ${formattedPost.title}
- Type: ${formattedPost.type}
- Author: u/${formattedPost.author}

## Content
${formattedPost.content}

## Stats
- Score: ${formattedPost.stats.score.toLocaleString()}
- Upvote Ratio: ${(formattedPost.stats.upvoteRatio * 100).toFixed(1)}%
- Comments: ${formattedPost.stats.comments.toLocaleString()}

## Metadata
- Posted: ${formattedPost.metadata.posted}
- Flags: ${formattedPost.metadata.flags.length ? formattedPost.metadata.flags.join(", ") : "None"}
- Flair: ${formattedPost.metadata.flair}

## Links
- Full Post: ${formattedPost.links.fullPost}
- Short Link: ${formattedPost.links.shortLink}

## Engagement Analysis
- ${formattedPost.engagementAnalysis.replace(/\n  - /g, "\n- ")}

## Best Time to Engage
${formattedPost.bestTimeToEngage}
          `,
        },
      ],
    }
  } catch (error) {
    // Error will be logged by the server
    throw new McpError(ErrorCode.InternalError, `Failed to fetch post data: ${String(error)}`)
  }
}

export async function getTopPosts(params: { subreddit: string; time_filter?: string; limit?: number }) {
  const { subreddit, time_filter = "week", limit = 10 } = params
  const client = getRedditClient()

  if (!client) {
    throw new McpError(ErrorCode.InternalError, "Reddit client not initialized")
  }

  try {
    // Getting top posts
    const posts = await client.getTopPosts(subreddit, time_filter, limit)
    const formattedPosts = posts.map(formatPostInfo)

    const postSummaries = formattedPosts
      .map(
        (post, index) => `
### ${index + 1}. ${post.title}
- Author: u/${post.author}
- Score: ${post.stats.score.toLocaleString()} (${(post.stats.upvoteRatio * 100).toFixed(1)}% upvoted)
- Comments: ${post.stats.comments.toLocaleString()}
- Posted: ${post.metadata.posted}
- Link: ${post.links.shortLink}
    `,
      )
      .join("\n")

    return {
      content: [
        {
          type: "text",
          text: `
# Top Posts from r/${subreddit} (${time_filter})

${postSummaries}
          `,
        },
      ],
    }
  } catch (error) {
    // Error will be logged by the server
    throw new McpError(ErrorCode.InternalError, `Failed to fetch top posts: ${String(error)}`)
  }
}

export async function createPost(params: { subreddit: string; title: string; content: string; is_self?: boolean }) {
  const { subreddit, title, content, is_self = true } = params
  const client = getRedditClient()

  if (!client) {
    throw new McpError(ErrorCode.InternalError, "Reddit client not initialized")
  }

  try {
    // Creating post
    const post = await client.createPost(subreddit, title, content, is_self)
    const formattedPost = formatPostInfo(post)

    return {
      content: [
        {
          type: "text",
          text: `
# Post Created Successfully

## Post Details
- Title: ${formattedPost.title}
- Subreddit: r/${formattedPost.subreddit}
- Type: ${formattedPost.type}
- Link: ${formattedPost.links.fullPost}

Your post has been successfully submitted to r/${formattedPost.subreddit}.
          `,
        },
      ],
    }
  } catch (error) {
    // Error will be logged by the server
    throw new McpError(ErrorCode.InternalError, `Failed to create post: ${String(error)}`)
  }
}

export async function replyToPost(params: { post_id: string; content: string; subreddit?: string }) {
  const { post_id, content } = params
  const client = getRedditClient()

  if (!client) {
    throw new McpError(ErrorCode.InternalError, "Reddit client not initialized")
  }

  try {
    // Replying to post
    const comment = await client.replyToPost(post_id, content)
    const formattedComment = formatCommentInfo(comment)

    return {
      content: [
        {
          type: "text",
          text: `
# Reply Posted Successfully

## Comment Details
- Author: u/${formattedComment.author}
- Subreddit: r/${formattedComment.context.subreddit}
- Thread: ${formattedComment.context.thread}
- Link: ${formattedComment.link}

Your reply has been successfully posted.
          `,
        },
      ],
    }
  } catch (error) {
    // Error will be logged by the server
    throw new McpError(ErrorCode.InternalError, `Failed to reply to post: ${String(error)}`)
  }
}
