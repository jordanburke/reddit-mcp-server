import { UserError } from "fastmcp"

import { getRedditClient } from "../client/reddit-client"
import type { RedditComment } from "../types"
import { formatPost } from "../utils/formatters"

export async function getPostComments(params: { post_id: string; subreddit: string; sort?: string; limit?: number }) {
  const { post_id, subreddit, sort = "best", limit = 100 } = params
  const client = getRedditClient()

  if (!client) {
    throw new UserError("Reddit client not initialized")
  }

  if (!post_id || !subreddit) {
    throw new UserError("post_id and subreddit are required")
  }

  try {
    const { post, comments } = await client.getPostComments(post_id, subreddit, {
      sort,
      limit,
    })

    const formattedPost = formatPost(post)

    // Function to format comments with proper indentation
    const formatComment = (comment: RedditComment): string => {
      const edited = comment.edited ? " *(edited)*" : ""
      const submitter = comment.isSubmitter ? " **[OP]**" : ""
      const depth = comment.depth || 0
      const prefix = "  ".repeat(depth) + (depth > 0 ? "└─ " : "")

      return `${prefix}**u/${comment.author}**${submitter} • ${comment.score} points • ${new Date(comment.createdUtc * 1000).toLocaleString()}${edited}
${prefix}${comment.body.split("\n").join(`\n${prefix}`)}`
    }

    return {
      content: [
        {
          type: "text",
          text: `# Comments for: ${formattedPost.title}

## Post Details
- Author: u/${formattedPost.author}
- Subreddit: r/${formattedPost.subreddit}
- Score: ${formattedPost.score} (${formattedPost.upvoteRatio}% upvoted)
- Posted: ${formattedPost.createdAt}
- Link: https://reddit.com${formattedPost.permalink}

## Post Content
${formattedPost.selftext || "[Link post - no text content]"}

## Comments (${comments.length} loaded, sorted by ${sort})

${comments.map((comment) => formatComment(comment)).join("\n\n---\n\n")}`,
        },
      ],
    }
  } catch (error) {
    throw new UserError(`Failed to fetch comments: ${String(error)}`)
  }
}
