import { UserError } from "fastmcp"
import { Option } from "functype"

import { getRedditClient } from "../client/reddit-client"
import { formatPost } from "../utils/formatters"

export async function searchReddit(params: {
  readonly query: string
  readonly subreddit?: string
  readonly sort?: string
  readonly time_filter?: string
  readonly limit?: number
  readonly type?: string
}) {
  const { query, subreddit, sort = "relevance", time_filter = "all", limit = 10, type = "link" } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  if (query.trim().length === 0) {
    // eslint-disable-next-line functype/prefer-either
    throw new UserError("Search query cannot be empty")
  }

  const result = await client.searchReddit(query, {
    subreddit,
    sort,
    timeFilter: time_filter,
    limit,
    type,
  })

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to search Reddit: ${err.message}`)
    },
    (posts) => {
      const subredditLabel = Option(subreddit).fold(
        () => "",
        (sr) => ` in r/${sr}`,
      )

      const formatSelftext = (selftext: string | undefined): string =>
        Option(selftext).fold(
          () => "",
          (text) => `\n${text.substring(0, 200)}${text.length > 200 ? "..." : ""}\n`,
        )

      return {
        content: [
          {
            type: "text" as const,
            text: `# Reddit Search Results for: "${query}"${subredditLabel}

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
${formatSelftext(formatted.selftext)}
- Link: https://reddit.com${formatted.permalink}
${formatted.nsfw ? "- **NSFW**" : ""}
${formatted.spoiler === true ? "- **Spoiler**" : ""}
`
  })
  .join("\n")}`,
          },
        ],
      }
    },
  )
}
