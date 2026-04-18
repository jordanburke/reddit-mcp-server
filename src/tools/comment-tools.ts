import { UserError } from "fastmcp"

import { getRedditClient } from "../client/reddit-client"
import type { RedditComment } from "../types"
import { formatPost } from "../utils/formatters"

export async function getPostComments(params: {
  readonly post_id: string
  readonly subreddit: string
  readonly sort?: string
  readonly limit?: number
}) {
  const { post_id, subreddit, sort = "best", limit = 100 } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  if (post_id === "" || subreddit === "") {
    // eslint-disable-next-line functype/prefer-either
    throw new UserError("post_id and subreddit are required")
  }

  const result = await client.getPostComments(post_id, subreddit, {
    sort,
    limit,
  })

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to fetch comments: ${err.message}`)
    },
    ({ post, comments }) => {
      const formattedPost = formatPost(post)

      const formatComment = (comment: RedditComment): string => {
        const edited = comment.edited ? " *(edited)*" : ""
        const submitter = comment.isSubmitter ? " **[OP]**" : ""
        const depth = comment.depth ?? 0
        const prefix = "  ".repeat(depth) + (depth > 0 ? "└─ " : "")

        return `${prefix}**u/${comment.author}**${submitter} • ${comment.score} points • ${new Date(comment.createdUtc * 1000).toLocaleString()}${edited}
${prefix}${comment.body.split("\n").join(`\n${prefix}`)}`
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `# Comments for: ${formattedPost.title}

## Post Details
- Author: u/${formattedPost.author}
- Subreddit: r/${formattedPost.subreddit}
- Score: ${formattedPost.score} (${formattedPost.upvoteRatio}% upvoted)
- Posted: ${formattedPost.createdAt}
- Link: https://reddit.com${formattedPost.permalink}

## Post Content
${formattedPost.selftext ?? "[Link post - no text content]"}

## Comments (${comments.length} loaded, sorted by ${sort})

${comments.map((comment) => formatComment(comment)).join("\n\n---\n\n")}`,
          },
        ],
      }
    },
  )
}
