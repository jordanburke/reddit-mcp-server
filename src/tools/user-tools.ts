import { UserError } from "fastmcp"
import { Option } from "functype"

import { getRedditClient } from "../client/reddit-client"
import { formatUserInfo } from "../utils/formatters"

export async function getUserInfo(params: { readonly username: string }) {
  const { username } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  const result = await client.getUser(username)

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to fetch user data: ${err.message}`)
    },
    (user) => {
      const formattedUser = formatUserInfo(user)

      return {
        content: [
          {
            type: "text" as const,
            text: `
# User Information: u/${formattedUser.username}

## Profile Overview
- Username: u/${formattedUser.username}
- Karma:
  - Comment Karma: ${formattedUser.karma.commentKarma.toLocaleString()}
  - Post Karma: ${formattedUser.karma.postKarma.toLocaleString()}
  - Total Karma: ${formattedUser.karma.totalKarma.toLocaleString()}
- Account Status: ${formattedUser.accountStatus.join(", ")}
- Account Created: ${formattedUser.accountCreated}
- Profile URL: ${formattedUser.profileUrl}

## Activity Analysis
- ${formattedUser.activityAnalysis.replace(/\n {2}- /g, "\n- ")}

## Recommendations
- ${formattedUser.recommendations.replace(/\n {2}- /g, "\n- ")}
          `,
          },
        ],
      }
    },
  )
}

export async function getUserPosts(params: {
  readonly username: string
  readonly sort?: string
  readonly time_filter?: string
  readonly limit?: number
}) {
  const { username, sort = "new", time_filter = "all", limit = 10 } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  const result = await client.getUserPosts(username, {
    sort,
    timeFilter: time_filter,
    limit,
  })

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to fetch user posts: ${err.message}`)
    },
    (posts) => ({
      content: [
        {
          type: "text" as const,
          text: `# Posts by u/${username}

## Sort: ${sort} | Time: ${time_filter} | Count: ${posts.length}

${posts
  .map((post, index) => {
    const date = new Date(post.createdUtc * 1000).toLocaleString()
    const selftext = Option(post.selftext).fold(
      () => "",
      (text) => `\n${text.substring(0, 200)}${text.length > 200 ? "..." : ""}\n`,
    )

    return `### ${index + 1}. ${post.title}
- Subreddit: r/${post.subreddit}
- Score: ${post.score} (${Math.round(post.upvoteRatio * 100)}% upvoted)
- Comments: ${post.numComments}
- Posted: ${date}
${selftext}
- Link: https://reddit.com${post.permalink}
${post.over18 ? "- **NSFW**" : ""}
${post.spoiler === true ? "- **Spoiler**" : ""}`
  })
  .join("\n\n---\n\n")}`,
        },
      ],
    }),
  )
}

export async function getUserComments(params: {
  readonly username: string
  readonly sort?: string
  readonly time_filter?: string
  readonly limit?: number
}) {
  const { username, sort = "new", time_filter = "all", limit = 10 } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  const result = await client.getUserComments(username, {
    sort,
    timeFilter: time_filter,
    limit,
  })

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to fetch user comments: ${err.message}`)
    },
    (comments) => ({
      content: [
        {
          type: "text" as const,
          text: `# Comments by u/${username}

## Sort: ${sort} | Time: ${time_filter} | Count: ${comments.length}

${comments
  .map((comment, index) => {
    const date = new Date(comment.createdUtc * 1000).toLocaleString()
    const edited = comment.edited ? " *(edited)*" : ""
    const body = comment.body.length > 300 ? `${comment.body.substring(0, 300)}...` : comment.body

    return `### ${index + 1}. In r/${comment.subreddit} on "${comment.submissionTitle}"
- Score: ${comment.score} points
- Posted: ${date}${edited}
- Link: https://reddit.com${comment.permalink}

${body}`
  })
  .join("\n\n---\n\n")}`,
        },
      ],
    }),
  )
}
