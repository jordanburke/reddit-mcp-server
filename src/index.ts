import { FastMCP } from "fastmcp"
import { z } from "zod"
import { initializeRedditClient, getRedditClient } from "./client/reddit-client"
import { formatUserInfo, formatPostInfo, formatSubredditInfo, formatCommentInfo } from "./utils/formatters"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

// Initialize Reddit client
async function setupRedditClient() {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  const userAgent = process.env.REDDIT_USER_AGENT || "RedditMCPServer/1.1.0"
  const username = process.env.REDDIT_USERNAME
  const password = process.env.REDDIT_PASSWORD

  if (!clientId || !clientSecret) {
    console.error(
      "[Error] Missing required Reddit API credentials. Please set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables."
    )
    process.exit(1)
  }

  try {
    await initializeRedditClient({
      clientId,
      clientSecret,
      userAgent,
      username,
      password,
    })

    console.error("[Setup] Reddit client initialized")
    if (username && password) {
      console.error(`[Setup] Authenticated as user: ${username}`)
    } else {
      console.error("[Setup] Running in read-only mode (no user authentication)")
    }
  } catch (error) {
    console.error("[Error] Failed to initialize Reddit client:", error)
    process.exit(1)
  }
}

// Create FastMCP server
const server = new FastMCP({
  name: "reddit-mcp-server",
  version: "1.1.0",
  instructions: `A comprehensive Reddit MCP server that provides tools for interacting with Reddit API.
  
Available capabilities:
- Fetch Reddit posts, comments, and user information
- Get subreddit details and statistics  
- Search Reddit content across posts and subreddits
- Create posts and reply to posts/comments (with authentication)
- Analyze engagement metrics and community insights

For write operations (posting, replying), ensure REDDIT_USERNAME and REDDIT_PASSWORD are configured.`,
  
  // Optional OAuth configuration for HTTP transport
  ...(process.env.OAUTH_ENABLED === "true" && {
    authenticate: async (request) => {
      const authHeader = request.headers.authorization
      const expectedToken = process.env.OAUTH_TOKEN

      if (!expectedToken) {
        // If OAuth is enabled but no token configured, generate one
        const token = Array.from({ length: 32 }, () => 
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
            .charAt(Math.floor(Math.random() * 62))
        ).join('')
        console.log(`[Auth] Generated OAuth token: ${token}`)
        throw new Response(JSON.stringify({ 
          error: "No OAuth token configured", 
          generatedToken: token 
        }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
      }

      if (!authHeader?.startsWith("Bearer ")) {
        throw new Response(null, {
          status: 401,
          statusText: "Missing or invalid Authorization header"
        })
      }

      const token = authHeader.slice(7)
      if (token !== expectedToken) {
        throw new Response(null, {
          status: 403,
          statusText: "Invalid token"
        })
      }

      return { authenticated: true }
    }
  })
})

// Test tool
server.addTool({
  name: "test_reddit_mcp_server",
  description: "Test the Reddit MCP Server connection and configuration",
  parameters: z.object({}),
  execute: async () => {
    const client = getRedditClient()
    const hasAuth = client ? "✓" : "✗"
    const hasWriteAccess = process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD ? "✓" : "✗"
    
    return `Reddit MCP Server Status:
- Server: ✓ Running
- Reddit Client: ${hasAuth} ${client ? "Initialized" : "Not initialized"}  
- Write Access: ${hasWriteAccess} ${hasWriteAccess === "✓" ? "Available" : "Read-only mode"}
- Version: 1.1.0

Ready to handle Reddit API requests!`
  }
})

// User tools
server.addTool({
  name: "get_user_info",
  description: "Get detailed information about a Reddit user including karma, account status, and activity analysis",
  parameters: z.object({
    username: z.string().describe("The Reddit username (without u/ prefix)")
  }),
  execute: async (args) => {
    const client = getRedditClient()
    if (!client) {
      throw new Error("Reddit client not initialized")
    }

    const user = await client.getUser(args.username)
    const formattedUser = formatUserInfo(user)

    return `# User Information: u/${formattedUser.username}

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
- ${formattedUser.activityAnalysis.replace(/\n  - /g, "\n- ")}

## Recommendations
- ${formattedUser.recommendations.replace(/\n  - /g, "\n- ")}`
  }
})

server.addTool({
  name: "get_user_posts",
  description: "Get recent posts by a Reddit user with sorting and filtering options",
  parameters: z.object({
    username: z.string().describe("The Reddit username (without u/ prefix)"),
    sort: z.enum(["new", "hot", "top"]).default("new").describe("Sort order for posts"),
    time_filter: z.enum(["hour", "day", "week", "month", "year", "all"]).default("all").describe("Time filter for top posts"),
    limit: z.number().min(1).max(100).default(10).describe("Number of posts to retrieve")
  }),
  execute: async (args) => {
    const client = getRedditClient()
    if (!client) {
      throw new Error("Reddit client not initialized")
    }

    const posts = await client.getUserPosts(args.username, {
      sort: args.sort,
      timeFilter: args.time_filter,
      limit: args.limit
    })

    if (posts.length === 0) {
      return `No posts found for u/${args.username} with the specified filters.`
    }

    const postSummaries = posts.map((post, index) => {
      const flags = [
        ...(post.over18 ? ["**NSFW**"] : []),
        ...(post.spoiler ? ["**Spoiler**"] : [])
      ]
      
      return `### ${index + 1}. ${post.title} ${flags.join(" ")}
- Subreddit: r/${post.subreddit}
- Score: ${post.score.toLocaleString()} (${(post.upvoteRatio * 100).toFixed(1)}% upvoted)
- Comments: ${post.numComments.toLocaleString()}
- Posted: ${new Date(post.createdUtc * 1000).toLocaleString()}
- Link: https://reddit.com${post.permalink}`
    }).join("\n\n")

    return `# Posts by u/${args.username} (${args.sort} - ${args.time_filter})

${postSummaries}`
  }
})

server.addTool({
  name: "get_user_comments",
  description: "Get recent comments by a Reddit user with sorting and filtering options",
  parameters: z.object({
    username: z.string().describe("The Reddit username (without u/ prefix)"),
    sort: z.enum(["new", "hot", "top"]).default("new").describe("Sort order for comments"),
    time_filter: z.enum(["hour", "day", "week", "month", "year", "all"]).default("all").describe("Time filter for top comments"),
    limit: z.number().min(1).max(100).default(10).describe("Number of comments to retrieve")
  }),
  execute: async (args) => {
    const client = getRedditClient()
    if (!client) {
      throw new Error("Reddit client not initialized")
    }

    const comments = await client.getUserComments(args.username, {
      sort: args.sort,
      timeFilter: args.time_filter,
      limit: args.limit
    })

    if (comments.length === 0) {
      return `No comments found for u/${args.username} with the specified filters.`
    }

    const commentSummaries = comments.map((comment, index) => {
      const truncatedBody = comment.body.length > 300 
        ? comment.body.substring(0, 300) + "..."
        : comment.body
      
      const flags = [
        ...(comment.edited ? ["*(edited)*"] : []),
        ...(comment.isSubmitter ? ["**OP**"] : [])
      ]

      return `### ${index + 1}. Comment ${flags.join(" ")}
In r/${comment.subreddit} on "${comment.submissionTitle}"

> ${truncatedBody}

- Score: ${comment.score.toLocaleString()}
- Posted: ${new Date(comment.createdUtc * 1000).toLocaleString()}
- Link: https://reddit.com${comment.permalink}`
    }).join("\n\n")

    return `# Comments by u/${args.username} (${args.sort} - ${args.time_filter})

${commentSummaries}`
  }
})

// Post tools
server.addTool({
  name: "get_reddit_post",
  description: "Get detailed information about a specific Reddit post including content, stats, and engagement analysis",
  parameters: z.object({
    subreddit: z.string().describe("The subreddit name (without r/ prefix)"),
    post_id: z.string().describe("The Reddit post ID")
  }),
  execute: async (args) => {
    const client = getRedditClient()
    if (!client) {
      throw new Error("Reddit client not initialized")
    }

    const post = await client.getPost(args.post_id, args.subreddit)
    const formattedPost = formatPostInfo(post)

    return `# Post from r/${formattedPost.subreddit}

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
- Flags: ${formattedPost.metadata.flags.length ? formattedPost.metadata.flags.join(", ") : "None"}
- Flair: ${formattedPost.metadata.flair}

## Links
- Full Post: ${formattedPost.links.fullPost}
- Short Link: ${formattedPost.links.shortLink}

## Engagement Analysis
- ${formattedPost.engagementAnalysis.replace(/\n  - /g, "\n- ")}

## Best Time to Engage
${formattedPost.bestTimeToEngage}`
  }
})

server.addTool({
  name: "get_top_posts",
  description: "Get top posts from a subreddit or from the Reddit home feed",
  parameters: z.object({
    subreddit: z.string().optional().describe("The subreddit name (without r/ prefix). Leave empty for home feed"),
    time_filter: z.enum(["hour", "day", "week", "month", "year", "all"]).default("week").describe("Time period for top posts"),
    limit: z.number().min(1).max(100).default(10).describe("Number of posts to retrieve")
  }),
  execute: async (args) => {
    const client = getRedditClient()
    if (!client) {
      throw new Error("Reddit client not initialized")
    }

    const posts = await client.getTopPosts(args.subreddit || "", args.time_filter, args.limit)
    
    if (posts.length === 0) {
      const location = args.subreddit ? `r/${args.subreddit}` : "home feed"
      return `No posts found in ${location} for the specified time period.`
    }

    const formattedPosts = posts.map(formatPostInfo)
    const postSummaries = formattedPosts.map((post, index) => `### ${index + 1}. ${post.title}
- Author: u/${post.author}
- Score: ${post.stats.score.toLocaleString()} (${(post.stats.upvoteRatio * 100).toFixed(1)}% upvoted)
- Comments: ${post.stats.comments.toLocaleString()}
- Posted: ${post.metadata.posted}
- Link: ${post.links.shortLink}`).join("\n\n")

    const location = args.subreddit ? `r/${args.subreddit}` : "Home Feed"
    return `# Top Posts from ${location} (${args.time_filter})

${postSummaries}`
  }
})

// Subreddit tools
server.addTool({
  name: "get_subreddit_info",
  description: "Get detailed information about a subreddit including description, stats, and community analysis",
  parameters: z.object({
    subreddit_name: z.string().describe("The subreddit name (without r/ prefix)")
  }),
  execute: async (args) => {
    const client = getRedditClient()
    if (!client) {
      throw new Error("Reddit client not initialized")
    }

    const subreddit = await client.getSubredditInfo(args.subreddit_name)
    const formattedSubreddit = formatSubredditInfo(subreddit)

    return `# Subreddit Information: r/${formattedSubreddit.name}

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
- ${formattedSubreddit.engagementTips.replace(/\n  - /g, "\n- ")}`
  }
})

server.addTool({
  name: "get_trending_subreddits",
  description: "Get a list of currently trending subreddits",
  parameters: z.object({}),
  execute: async () => {
    const client = getRedditClient()
    if (!client) {
      throw new Error("Reddit client not initialized")
    }

    const trendingSubreddits = await client.getTrendingSubreddits()

    return `# Trending Subreddits

${trendingSubreddits.map((subreddit, index) => `${index + 1}. r/${subreddit}`).join("\n")}`
  }
})

// Search tools
server.addTool({
  name: "search_reddit",
  description: "Search Reddit for posts and content across subreddits",
  parameters: z.object({
    query: z.string().describe("Search query"),
    subreddit: z.string().optional().describe("Limit search to specific subreddit (without r/ prefix)"),
    sort: z.enum(["relevance", "hot", "top", "new", "comments"]).default("relevance").describe("Sort order"),
    time_filter: z.enum(["hour", "day", "week", "month", "year", "all"]).default("all").describe("Time filter"),
    limit: z.number().min(1).max(100).default(10).describe("Number of results"),
    type: z.enum(["link", "sr", "user"]).default("link").describe("Type of content to search")
  }),
  execute: async (args) => {
    const client = getRedditClient()
    if (!client) {
      throw new Error("Reddit client not initialized")
    }

    if (!args.query || args.query.trim() === "") {
      throw new Error("Search query cannot be empty")
    }

    const posts = await client.searchReddit(args.query, {
      subreddit: args.subreddit,
      sort: args.sort,
      timeFilter: args.time_filter,
      limit: args.limit,
      type: args.type
    })

    if (posts.length === 0) {
      const searchLocation = args.subreddit ? ` in r/${args.subreddit}` : ""
      return `No results found for "${args.query}"${searchLocation}.`
    }

    const searchResults = posts.map((post, index) => {
      const flags = [
        ...(post.over18 ? ["**NSFW**"] : []),
        ...(post.spoiler ? ["**Spoiler**"] : [])
      ]

      return `### ${index + 1}. ${post.title} ${flags.join(" ")}
- Subreddit: r/${post.subreddit}
- Author: u/${post.author}
- Score: ${post.score.toLocaleString()} (${(post.upvoteRatio * 100).toFixed(1)}% upvoted)
- Comments: ${post.numComments.toLocaleString()}
- Posted: ${new Date(post.createdUtc * 1000).toLocaleString()}
- Link: https://reddit.com${post.permalink}`
    }).join("\n\n")

    const searchLocation = args.subreddit ? ` in r/${args.subreddit}` : ""
    return `# Reddit Search Results for: "${args.query}"${searchLocation}

Sorted by: ${args.sort} | Time: ${args.time_filter} | Type: ${args.type}

${searchResults}`
  }
})

// Comment tools
server.addTool({
  name: "get_post_comments",
  description: "Get comments from a specific Reddit post",
  parameters: z.object({
    post_id: z.string().describe("The Reddit post ID"),
    subreddit: z.string().describe("The subreddit name (without r/ prefix)"),
    sort: z.enum(["best", "top", "new", "controversial", "old", "qa"]).default("best").describe("Comment sort order"),
    limit: z.number().min(1).max(500).default(100).describe("Maximum number of comments to retrieve")
  }),
  execute: async (args) => {
    const client = getRedditClient()
    if (!client) {
      throw new Error("Reddit client not initialized")
    }

    if (!args.post_id || !args.subreddit) {
      throw new Error("post_id and subreddit are required")
    }

    const data = await client.getPostComments(args.post_id, args.subreddit, {
      sort: args.sort,
      limit: args.limit
    })

    const post = data.post
    const comments = data.comments

    let response = `# Comments for: ${post.title}

**Post by u/${post.author} in r/${post.subreddit}**
- Score: ${post.score.toLocaleString()} | Comments: ${post.numComments.toLocaleString()}
- Posted: ${new Date(post.createdUtc * 1000).toLocaleString()}

---

`

    if (comments.length === 0) {
      response += "No comments found for this post."
      return response
    }

    const commentSummaries = comments.map((comment, index) => {
      const indent = "└─".repeat(Math.min(comment.depth || 0, 3))
      const authorBadge = comment.isSubmitter ? " **[OP]**" : ""
      const editedBadge = comment.edited ? " *(edited)*" : ""

      return `${indent} **u/${comment.author}**${authorBadge}${editedBadge} (${comment.score.toLocaleString()} points)

${comment.body}

---`
    }).join("\n\n")

    response += commentSummaries
    return response
  }
})

// Initialize and start server
async function main() {
  try {
    await setupRedditClient()
    
    // Start with stdio transport (for Claude Desktop)
    await server.start({
      transportType: "stdio"
    })
  } catch (error) {
    console.error("[Error] Failed to start server:", error)
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.error("[Shutdown] Shutting down Reddit MCP Server...")
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.error("[Shutdown] Shutting down Reddit MCP Server...")
  process.exit(0)
})

main().catch(console.error)