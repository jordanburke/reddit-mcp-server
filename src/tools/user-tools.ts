import { UserError } from "fastmcp"

import { getRedditClient } from "../client/reddit-client"
import { formatUserInfo } from "../utils/formatters"

export async function getUserInfo(params: { username: string }) {
  const { username } = params
  const client = getRedditClient()

  if (!client) {
    throw new UserError("Reddit client not initialized")
  }

  try {
    // Getting user info
    const user = await client.getUser(username)
    const formattedUser = formatUserInfo(user)

    return {
      content: [
        {
          type: "text",
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
  } catch (error) {
    // Error will be logged by the server
    throw new UserError(`Failed to fetch user data: ${String(error)}`)
  }
}

export async function getUserPosts(params: { username: string; sort?: string; time_filter?: string; limit?: number }) {
  const { username, sort = "new", time_filter = "all", limit = 10 } = params
  const client = getRedditClient()

  if (!client) {
    throw new UserError("Reddit client not initialized")
  }

  try {
    const posts = await client.getUserPosts(username, {
      sort,
      timeFilter: time_filter,
      limit,
    })

    return {
      content: [
        {
          type: "text",
          text: `# Posts by u/${username}

## Sort: ${sort} | Time: ${time_filter} | Count: ${posts.length}

${posts
  .map((post, index) => {
    const date = new Date(post.createdUtc * 1000).toLocaleString()
    const selftext = post.selftext
      ? `\n${post.selftext.substring(0, 200)}${post.selftext.length > 200 ? "..." : ""}\n`
      : ""

    return `### ${index + 1}. ${post.title}
- Subreddit: r/${post.subreddit}
- Score: ${post.score} (${Math.round(post.upvoteRatio * 100)}% upvoted)
- Comments: ${post.numComments}
- Posted: ${date}
${selftext}
- Link: https://reddit.com${post.permalink}
${post.over18 ? "- **NSFW**" : ""}
${post.spoiler ? "- **Spoiler**" : ""}`
  })
  .join("\n\n---\n\n")}`,
        },
      ],
    }
  } catch (error) {
    throw new UserError(`Failed to fetch user posts: ${String(error)}`)
  }
}

export async function getUserComments(params: {
  username: string
  sort?: string
  time_filter?: string
  limit?: number
}) {
  const { username, sort = "new", time_filter = "all", limit = 10 } = params
  const client = getRedditClient()

  if (!client) {
    throw new UserError("Reddit client not initialized")
  }

  try {
    const comments = await client.getUserComments(username, {
      sort,
      timeFilter: time_filter,
      limit,
    })

    return {
      content: [
        {
          type: "text",
          text: `# Comments by u/${username}

## Sort: ${sort} | Time: ${time_filter} | Count: ${comments.length}

${comments
  .map((comment, index) => {
    const date = new Date(comment.createdUtc * 1000).toLocaleString()
    const edited = comment.edited ? " *(edited)*" : ""
    const body = comment.body.length > 300 ? comment.body.substring(0, 300) + "..." : comment.body

    return `### ${index + 1}. In r/${comment.subreddit} on "${comment.submissionTitle}"
- Score: ${comment.score} points
- Posted: ${date}${edited}
- Link: https://reddit.com${comment.permalink}

${body}`
  })
  .join("\n\n---\n\n")}`,
        },
      ],
    }
  } catch (error) {
    throw new UserError(`Failed to fetch user comments: ${String(error)}`)
  }
}
