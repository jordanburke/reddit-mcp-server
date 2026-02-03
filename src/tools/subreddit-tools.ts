import { UserError } from "fastmcp"

import { getRedditClient } from "../client/reddit-client"
import { formatSubredditInfo } from "../utils/formatters"

export async function getSubredditInfo(params: { subreddit_name: string }) {
  const { subreddit_name } = params
  const client = getRedditClient()

  if (!client) {
    throw new UserError("Reddit client not initialized")
  }

  try {
    // Getting subreddit info
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
- ${formattedSubreddit.communityAnalysis.replace(/\n {2}- /g, "\n- ")}

## Engagement Tips
- ${formattedSubreddit.engagementTips.replace(/\n {2}- /g, "\n- ")}
          `,
        },
      ],
    }
  } catch (error) {
    // Error will be logged by the server
    throw new UserError(`Failed to fetch subreddit data: ${String(error)}`)
  }
}

export async function getTrendingSubreddits() {
  const client = getRedditClient()

  if (!client) {
    throw new UserError("Reddit client not initialized")
  }

  try {
    // Getting trending subreddits
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
    // Error will be logged by the server
    throw new UserError(`Failed to fetch trending subreddits: ${String(error)}`)
  }
}
