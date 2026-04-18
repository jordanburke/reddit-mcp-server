import { UserError } from "fastmcp"

import { getRedditClient } from "../client/reddit-client"
import { formatSubredditInfo } from "../utils/formatters"

export async function getSubredditInfo(params: { readonly subreddit_name: string }) {
  const { subreddit_name } = params

  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  const result = await client.getSubredditInfo(subreddit_name)

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to fetch subreddit data: ${err.message}`)
    },
    (subreddit) => {
      const formattedSubreddit = formatSubredditInfo(subreddit)

      return {
        content: [
          {
            type: "text" as const,
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
    },
  )
}

export async function getTrendingSubreddits() {
  const client = getRedditClient().orThrow(new UserError("Reddit client not initialized"))

  const result = await client.getTrendingSubreddits()

  return result.fold(
    (err) => {
      // eslint-disable-next-line functype/prefer-either
      throw new UserError(`Failed to fetch trending subreddits: ${err.message}`)
    },
    (trendingSubreddits) => ({
      content: [
        {
          type: "text" as const,
          text: `
# Trending Subreddits

${trendingSubreddits.map((subreddit, index) => `${index + 1}. r/${subreddit}`).join("\n")}
          `,
        },
      ],
    }),
  )
}
