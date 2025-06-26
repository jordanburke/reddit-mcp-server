import { getRedditClient } from "../client/reddit-client"
import { formatSubredditInfo } from "../utils/formatters"
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

export async function getSubredditInfo(params: { subreddit_name: string }) {
  const { subreddit_name } = params
  const client = getRedditClient()

  if (!client) {
    throw new McpError(ErrorCode.InternalError, "Reddit client not initialized")
  }

  try {
    console.error(`[Tool] Getting info for r/${subreddit_name}`)
    const subreddit = await client.getSubredditInfo(subreddit_name)
    const formattedSubreddit = formatSubredditInfo(subreddit)

    return {
      content: [
        {
          type: "text",
          text: `
# Subreddit Information: r/${formattedSubreddit.name}

## Overview
- Name: r/${formattedSubreddit.name}
- Title: ${formattedSubreddit.title}
- Subscribers: ${formattedSubreddit.stats.subscribers.toLocaleString()}
- Active Users: ${
            typeof formattedSubreddit.stats.activeUsers === "number"
              ? formattedSubreddit.stats.activeUsers.toLocaleString()
              : formattedSubreddit.stats.activeUsers
          }

## Description
${formattedSubreddit.description.short}

## Detailed Description
${formattedSubreddit.description.full}

## Metadata
- Created: ${formattedSubreddit.metadata.created}
- Flags: ${formattedSubreddit.metadata.flags.join(", ")}

## Links
- Subreddit: ${formattedSubreddit.links.subreddit}
- Wiki: ${formattedSubreddit.links.wiki}

## Community Analysis
- ${formattedSubreddit.communityAnalysis.replace(/\n  - /g, "\n- ")}

## Engagement Tips
- ${formattedSubreddit.engagementTips.replace(/\n  - /g, "\n- ")}
          `,
        },
      ],
    }
  } catch (error) {
    console.error(`[Error] Error getting subreddit info: ${error}`)
    throw new McpError(ErrorCode.InternalError, `Failed to fetch subreddit data: ${error}`)
  }
}

export async function getTrendingSubreddits() {
  const client = getRedditClient()

  if (!client) {
    throw new McpError(ErrorCode.InternalError, "Reddit client not initialized")
  }

  try {
    console.error("[Tool] Getting trending subreddits")
    const trendingSubreddits = await client.getTrendingSubreddits()

    return {
      content: [
        {
          type: "text",
          text: `
# Trending Subreddits

${trendingSubreddits.map((subreddit, index) => `${index + 1}. r/${subreddit}`).join("\n")}
          `,
        },
      ],
    }
  } catch (error) {
    console.error(`[Error] Error getting trending subreddits: ${error}`)
    throw new McpError(ErrorCode.InternalError, `Failed to fetch trending subreddits: ${error}`)
  }
}
