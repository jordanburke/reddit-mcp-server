import { getRedditClient } from "../client/reddit-client"
import { formatPost } from "../utils/formatters"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

export async function searchReddit(params: {
  query: string
  subreddit?: string
  sort?: string
  time_filter?: string
  limit?: number
  type?: string
}) {
  const { query, subreddit, sort = "relevance", time_filter = "all", limit = 10, type = "link" } = params
  const client = getRedditClient()

  if (!client) {
    throw new McpError(ErrorCode.InternalError, "Reddit client not initialized")
  }

  if (!query || query.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, "Search query cannot be empty")
  }

  try {
    const posts = await client.searchReddit(query, {
      subreddit,
      sort,
      timeFilter: time_filter,
      limit,
      type,
    })

    return {
      content: [
        {
          type: "text",
          text: `# Reddit Search Results for: "${query}"${subreddit ? ` in r/${subreddit}` : ""}

## Search Parameters
- Sort: ${sort}
- Time Filter: ${time_filter}
- Type: ${type}
- Results: ${posts.length}

${posts
  .map((post, index) => {
    const formatted = formatPost(post)
    return `### ${index + 1}. ${formatted.title}
- Author: u/${formatted.author}
- Subreddit: r/${formatted.subreddit}
- Score: ${formatted.score} (${formatted.upvoteRatio}% upvoted)
- Comments: ${formatted.numComments}
- Posted: ${formatted.createdAt}
${formatted.selftext ? `\n${formatted.selftext.substring(0, 200)}${formatted.selftext.length > 200 ? "..." : ""}\n` : ""}
- Link: https://reddit.com${formatted.permalink}
${formatted.nsfw ? "- **NSFW**" : ""}
${formatted.spoiler ? "- **Spoiler**" : ""}
`
  })
  .join("\n")}`,
        },
      ],
    }
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to search Reddit: ${String(error)}`)
  }
}
