import { UserError } from "fastmcp"

import { getRedditClient } from "../client/reddit-client"
import { formatCommentInfo, formatPostInfo } from "../utils/formatters"

export async function getRedditPost(params: { readonly subreddit: string; readonly post_id: string }) {
  const { subreddit, post_id } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  const result = await client.getPost(post_id, subreddit)

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to fetch post data: ${err.message}`)
    },
    (post) => {
      const formattedPost = formatPostInfo(post)

      return {
        content: [
          {
            type: "text" as const,
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
- Flags: ${formattedPost.metadata.flags.length > 0 ? formattedPost.metadata.flags.join(", ") : "None"}
- Flair: ${formattedPost.metadata.flair}

## Links
- Full Post: ${formattedPost.links.fullPost}
- Short Link: ${formattedPost.links.shortLink}

## Engagement Analysis
- ${formattedPost.engagementAnalysis.replace(/\n {2}- /g, "\n- ")}

## Best Time to Engage
${formattedPost.bestTimeToEngage}
          `,
          },
        ],
      }
    },
  )
}

export async function getTopPosts(params: {
  readonly subreddit: string
  readonly time_filter?: string
  readonly limit?: number
}) {
  const { subreddit, time_filter = "week", limit = 10 } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  const result = await client.getTopPosts(subreddit, time_filter, limit)

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to fetch top posts: ${err.message}`)
    },
    (posts) => {
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
            type: "text" as const,
            text: `
# Top Posts from r/${subreddit} (${time_filter})

${postSummaries}
          `,
          },
        ],
      }
    },
  )
}

export async function createPost(params: {
  readonly subreddit: string
  readonly title: string
  readonly content: string
  readonly is_self?: boolean
}) {
  const { subreddit, title, content, is_self = true } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  const result = await client.createPost(subreddit, title, content, is_self)

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to create post: ${err.message}`)
    },
    (post) => {
      const formattedPost = formatPostInfo(post)

      return {
        content: [
          {
            type: "text" as const,
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
    },
  )
}

export async function replyToPost(params: {
  readonly post_id: string
  readonly content: string
  readonly subreddit?: string
}) {
  const { post_id, content } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  const result = await client.replyToPost(post_id, content)

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to reply to post: ${err.message}`)
    },
    (comment) => {
      const formattedComment = formatCommentInfo(comment)

      return {
        content: [
          {
            type: "text" as const,
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
    },
  )
}
