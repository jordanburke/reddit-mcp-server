import crypto from "crypto"
import dotenv from "dotenv"
import { FastMCP } from "fastmcp"
import { Option } from "functype"
import { z } from "zod"

import { getRedditClient, initializeRedditClient } from "./client/reddit-client"
import type {
  BotDisclosureConfig,
  CacheConfig,
  RedditAuthMode,
  RedditSafeMode,
  RetryConfig,
  SafeModeConfig,
  UserContent,
} from "./types"
import { formatPostInfo, formatSubredditInfo, formatUserInfo } from "./utils/formatters"

// Load environment variables
dotenv.config({ quiet: true })

// Version injected at build time by tsdown
declare const __VERSION__: string
const VERSION = (typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev") as `${number}.${number}.${number}`

// User-Agent validation and building
function validateUserAgent(userAgent: string, username?: string): void {
  const recommendedPattern = /^[\w-]+:[\w-]+:[\d.]+ \(by \/u\/\w+\)$/
  if (!recommendedPattern.test(userAgent)) {
    console.error("[Warning] User-Agent does not follow Reddit's recommended format")
    console.error("[Warning] Recommended: 'platform:app_id:version (by /u/username)'")
    console.error("[Warning] Non-standard User-Agents may increase ban risk")
    if (username !== undefined) {
      console.error(`[Warning] Consider using: 'typescript:reddit-mcp-server:${VERSION} (by /u/${username})'`)
    }
  }
}

function buildUserAgent(customAgent?: string, username?: string): string {
  if (customAgent !== undefined) {
    validateUserAgent(customAgent, username)
    return customAgent
  }

  if (username !== undefined) {
    const autoAgent = `typescript:reddit-mcp-server:${VERSION} (by /u/${username})`
    console.error(`[Setup] Auto-generated User-Agent: ${autoAgent}`)
    return autoAgent
  }

  const fallbackAgent = `typescript:reddit-mcp-server:${VERSION} (by /u/anonymous)`
  console.error(
    "[Setup] No REDDIT_USERNAME set — using anonymous User-Agent. Set REDDIT_USERNAME for a personalized agent.",
  )
  return fallbackAgent
}

// Safe mode configuration
function buildSafeModeConfig(safeMode: RedditSafeMode): SafeModeConfig {
  switch (safeMode) {
    case "off":
      return {
        enabled: false,
        mode: "off",
        writeDelayMs: 0,
        duplicateCheck: false,
        maxRecentHashes: 10,
      }
    case "standard":
      return {
        enabled: true,
        mode: "standard",
        writeDelayMs: 2000,
        duplicateCheck: true,
        maxRecentHashes: 10,
      }
    case "strict":
      return {
        enabled: true,
        mode: "strict",
        writeDelayMs: 5000,
        duplicateCheck: true,
        maxRecentHashes: 20,
      }
  }
}

function unwrapClient() {
  return getRedditClient().orThrow(new Error("Reddit client not initialized"))
}

// Footer appended to paginated listings when more results are available.
function nextPageHint(after?: string): string {
  return Option(after).fold(
    () => "",
    (cursor) => `\n\n---\nMore results available — call again with after="${cursor}" for the next page.`,
  )
}

// Render a mixed posts+comments listing (saved / overview).
function formatUserContent(heading: string, content: UserContent): string {
  const postsSection =
    content.posts.length === 0
      ? ""
      : `## Posts (${content.posts.length})\n${content.posts
          .map(
            (post, index) =>
              `${index + 1}. ${post.title} — r/${post.subreddit}, score ${post.score.toLocaleString()} — https://reddit.com${post.permalink}`,
          )
          .join("\n")}\n\n`

  const commentsSection =
    content.comments.length === 0
      ? ""
      : `## Comments (${content.comments.length})\n${content.comments
          .map((comment, index) => {
            const body = comment.body.length > 200 ? `${comment.body.substring(0, 200)}...` : comment.body
            return `${index + 1}. in r/${comment.subreddit}: ${body} — https://reddit.com${comment.permalink}`
          })
          .join("\n")}\n\n`

  const empty = content.posts.length === 0 && content.comments.length === 0 ? "No items found.\n\n" : ""

  return `# ${heading}\n\n${postsSection}${commentsSection}${empty}`.trimEnd() + nextPageHint(content.after)
}

// Initialize Reddit client
async function setupRedditClient() {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  const customUserAgent = process.env.REDDIT_USER_AGENT
  const username = process.env.REDDIT_USERNAME
  const password = process.env.REDDIT_PASSWORD
  const authMode = (process.env.REDDIT_AUTH_MODE ?? "auto") as RedditAuthMode
  const safeMode = (process.env.REDDIT_SAFE_MODE ?? "standard") as RedditSafeMode

  // Validate auth mode
  if (!["auto", "authenticated", "anonymous"].includes(authMode)) {
    console.error(`[Error] Invalid REDDIT_AUTH_MODE: ${authMode}`)
    console.error("[Error] Valid options are: auto, authenticated, anonymous")
    process.exit(1)
  }

  // Validate safe mode
  if (!["off", "standard", "strict"].includes(safeMode)) {
    console.error(`[Error] Invalid REDDIT_SAFE_MODE: ${safeMode}`)
    console.error("[Error] Valid options are: off, standard, strict")
    process.exit(1)
  }

  // In authenticated mode, require credentials
  if (authMode === "authenticated" && (clientId === undefined || clientSecret === undefined)) {
    console.error("[Error] Authenticated mode requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET")
    process.exit(1)
  }

  // For auto/anonymous, credentials are optional
  const hasCredentials = Boolean(clientId && clientSecret)

  // Build user-agent (auto-format with username if available)
  const userAgent = buildUserAgent(customUserAgent, username)

  // Build safe mode config
  const safeModeConfig = buildSafeModeConfig(safeMode)

  // Build bot disclosure config
  const botDisclosureMode = process.env.REDDIT_BOT_DISCLOSURE ?? "off"
  const defaultFooter =
    "\n\n---\n^(🤖 I am a bot | Built with) [^reddit-mcp-server](https://github.com/jordanburke/reddit-mcp-server)"
  const botDisclosureConfig: BotDisclosureConfig = {
    enabled: botDisclosureMode === "auto",
    footer: botDisclosureMode === "auto" ? (process.env.REDDIT_BOT_FOOTER ?? defaultFooter) : "",
  }

  // Build cache config (enabled by default to ease Reddit rate limits; opt out with REDDIT_CACHE=off)
  const cacheEnabled = (process.env.REDDIT_CACHE ?? "on") !== "off"
  const cacheMaxMb = Number(process.env.REDDIT_CACHE_MAX_MB ?? "50")
  const cacheConfig: CacheConfig = {
    enabled: cacheEnabled,
    maxBytes: (Number.isFinite(cacheMaxMb) && cacheMaxMb > 0 ? cacheMaxMb : 50) * 1024 * 1024,
  }

  // Retry on HTTP 429 with Retry-After backoff (opt out with REDDIT_MAX_RETRIES=0)
  const maxRetriesRaw = Number(process.env.REDDIT_MAX_RETRIES ?? "3")
  const retryConfig: RetryConfig = {
    maxRetries: Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0 ? Math.floor(maxRetriesRaw) : 3,
    baseDelayMs: 1000,
    maxDelayMs: 60_000,
  }

  const client = initializeRedditClient({
    clientId: clientId ?? "",
    clientSecret: clientSecret ?? "",
    userAgent,
    username,
    password,
    authMode,
    safeMode: safeModeConfig,
    botDisclosure: botDisclosureConfig,
    cache: cacheConfig,
    retry: retryConfig,
  })

  console.error("[Setup] Reddit client initialized")
  console.error(`[Setup] Authentication mode: ${authMode}`)

  if (authMode === "anonymous" || !hasCredentials) {
    console.error("[Setup] Using anonymous Reddit API (~10 req/min)")
    console.error("[Setup] No authentication required - ready to use!")
  } else {
    console.error("[Setup] Testing Reddit API connection...")
    const isConnected = await client.checkAuthentication()

    if (!isConnected) {
      console.error("[Error] ✗ Failed to connect to Reddit API")
      console.error("[Error] Please check your REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET")
      process.exit(1)
    }

    console.error("[Setup] ✓ Reddit API connection successful")
    console.error("[Setup] Using OAuth Reddit API (60-100 req/min)")
  }

  if (username !== undefined && password !== undefined) {
    console.error(`[Setup] ✓ User authenticated as: ${username}`)
    console.error("[Setup] Write operations enabled (posting, replying, editing, deleting)")
  } else {
    console.error("[Setup] Read-only mode (no user credentials)")
    console.error("[Setup] For write operations, set REDDIT_USERNAME and REDDIT_PASSWORD")
  }

  // Log safe mode status
  if (safeModeConfig.enabled) {
    console.error(`[Setup] ✓ Safe mode enabled: ${safeModeConfig.mode}`)
    console.error(`[Setup]   - Write delay: ${safeModeConfig.writeDelayMs}ms between operations`)
    console.error(`[Setup]   - Duplicate detection: enabled (tracking last ${safeModeConfig.maxRecentHashes} items)`)
  } else {
    console.error(
      "[Setup] Safe mode: off (explicitly disabled — ensure compliance with Reddit's Responsible Builder Policy)",
    )
  }

  // Log bot disclosure status
  if (botDisclosureConfig.enabled) {
    console.error("[Setup] ✓ Bot disclosure: enabled (automated content will include bot footer)")
  } else {
    console.error("[Setup] Bot disclosure: off")
    console.error("[Setup] For Reddit policy compliance, consider REDDIT_BOT_DISCLOSURE=auto")
  }
}

// OAuth token: generate once at startup, never expose in responses
const oauthToken = process.env.OAUTH_TOKEN ?? crypto.randomBytes(32).toString("hex")
if (process.env.OAUTH_ENABLED === "true" && process.env.OAUTH_TOKEN === undefined) {
  console.error(`[Auth] Generated OAuth token: ${oauthToken}`)
}

// Create FastMCP server
const server = new FastMCP({
  name: "reddit-mcp-server",
  version: VERSION,
  instructions: `A comprehensive Reddit MCP server that provides tools for interacting with Reddit API.

Available capabilities:
- Fetch Reddit posts, comments, and user information
- Get subreddit details and statistics
- Search Reddit content across posts and subreddits
- Create posts and reply to posts/comments (with authentication)
- Edit your own posts and comments (with authentication)
- Delete your own posts and comments (with authentication)
- Analyze engagement metrics and community insights

For write operations (posting, replying, editing, deleting), ensure REDDIT_USERNAME and REDDIT_PASSWORD are configured.

IMPORTANT - Reddit Responsible Builder Policy compliance:
- Data retrieved via these tools must NOT be used for AI model training without Reddit's written approval
- Data must NOT be sold, licensed, or commercially redistributed
- Do NOT attempt to de-anonymize or re-identify Reddit users
- Do NOT post identical or substantially similar content across multiple subreddits
- Do NOT use these tools to manipulate votes, karma, or circumvent Reddit safety mechanisms
- All bot-generated content must clearly disclose its automated nature
- Bots must NOT send private/direct messages without explicit user consent
For details: https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy`,

  // Optional OAuth configuration for HTTP transport
  ...(process.env.OAUTH_ENABLED === "true" && {
    authenticate: (request: { readonly headers: { readonly authorization?: string } }) => {
      const authHeader = request.headers.authorization
      if (!authHeader?.startsWith("Bearer ")) {
        // eslint-disable-next-line functype/prefer-either
        throw new Response(null, {
          status: 401,
          statusText: "Missing or invalid Authorization header",
        })
      }

      const token = authHeader.slice(7)
      const tokenBuffer = Buffer.from(token)
      const expectedBuffer = Buffer.from(oauthToken)
      const tokenHash = crypto.createHash("sha256").update(tokenBuffer).digest()
      const expectedHash = crypto.createHash("sha256").update(expectedBuffer).digest()
      if (!crypto.timingSafeEqual(tokenHash, expectedHash)) {
        // eslint-disable-next-line functype/prefer-either
        throw new Response(null, {
          status: 403,
          statusText: "Invalid token",
        })
      }

      return Promise.resolve({ authenticated: true })
    },
  }),
})

// Test tool
server.addTool({
  name: "test_reddit_mcp_server",
  description:
    'Health check for the Reddit MCP server. Read-only and side-effect-free — inspects local configuration only and makes no Reddit API calls. Returns the server version, whether the Reddit client is initialized, whether OAuth credentials are present, and whether write access (REDDIT_USERNAME/REDDIT_PASSWORD) is configured. Use this first to diagnose setup/auth problems. Do NOT use it to check Reddit\'s own status or connectivity — it never contacts Reddit. A "✗ Write Access" result means the write tools (create_post, reply_to_post, edit_*, delete_*) will fail.',
  annotations: {
    title: "Test Reddit MCP Server",
    readOnlyHint: true,
    openWorldHint: false,
  },
  parameters: z.object({}),
  execute: () => {
    const client = getRedditClient()
    const hasAuth = client.fold(
      () => "✗",
      () => "✓",
    )
    const hasWriteAccess =
      process.env.REDDIT_USERNAME !== undefined && process.env.REDDIT_PASSWORD !== undefined ? "✓" : "✗"

    return Promise.resolve(`Reddit MCP Server Status:
- Server: ✓ Running
- Reddit Client: ${hasAuth} ${client.fold(
      () => "Not initialized",
      () => "Initialized",
    )}
- Write Access: ${hasWriteAccess} ${hasWriteAccess === "✓" ? "Available" : "Read-only mode"}
- Version: ${VERSION}

Ready to handle Reddit API requests!`)
  },
})

// User tools
server.addTool({
  name: "get_user_info",
  description:
    "Get a public profile for any Reddit user: comment/post/total karma, account age and status flags, plus a short activity analysis and engagement tips. Read-only; works in anonymous mode. Returns profile stats only — use get_user_posts / get_user_comments for their actual content. Use get_me instead for your own authenticated account; do NOT expect private fields here, as only public data is returned.",
  annotations: {
    title: "Get User Info",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    username: z
      .string()
      .describe("The target user's Reddit username, without the u/ prefix (e.g. 'spez', not 'u/spez')."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getUser(args.username)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get user info: ${err.message}`)
      },
      (user) => {
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
- ${formattedUser.activityAnalysis.replace(/\n {2}- /g, "\n- ")}

## Recommendations
- ${formattedUser.recommendations.replace(/\n {2}- /g, "\n- ")}`
      },
    )
  },
})

server.addTool({
  name: "get_me",
  description:
    "Get the authenticated user's own profile (karma, account age, status flags). Read-only, but requires user credentials (REDDIT_USERNAME/REDDIT_PASSWORD) and fails in anonymous mode. Use this instead of get_user_info when you need the current account rather than an arbitrary user. Do NOT use it to look up other users — it always returns the logged-in account.",
  annotations: {
    title: "Get My Account",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({}),
  execute: async () => {
    const client = unwrapClient()

    const result = await client.getMe()
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get authenticated user: ${err.message}`)
      },
      (user) => {
        const formattedUser = formatUserInfo(user)

        return `# Your Account: u/${formattedUser.username}

## Profile Overview
- Username: u/${formattedUser.username}
- Karma:
  - Comment Karma: ${formattedUser.karma.commentKarma.toLocaleString()}
  - Post Karma: ${formattedUser.karma.postKarma.toLocaleString()}
  - Total Karma: ${formattedUser.karma.totalKarma.toLocaleString()}
- Account Status: ${formattedUser.accountStatus.join(", ")}
- Account Created: ${formattedUser.accountCreated}
- Profile URL: ${formattedUser.profileUrl}`
      },
    )
  },
})

server.addTool({
  name: "get_my_overview",
  description:
    "Get the authenticated user's own recent activity — posts and comments interleaved, newest first. Read-only but requires user credentials (REDDIT_USERNAME/REDDIT_PASSWORD). Returns up to `limit` items plus an `after` cursor for the next page. Use get_my_saved for saved items, or get_user_posts / get_user_comments for another user. Do NOT use this to fetch a specific post's thread — use get_post_comments.",
  annotations: {
    title: "Get My Overview",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    limit: z.number().min(1).max(100).default(25).describe("How many activity items to return, 1–100 (default 25)."),
    after: z
      .string()
      .optional()
      .describe("Forward pagination cursor: the `after` value returned by a previous call. Omit for the first page."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getMyOverview({ limit: args.limit, after: args.after })
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get your overview: ${err.message}`)
      },
      (content) => formatUserContent("Your Overview", content),
    )
  },
})

server.addTool({
  name: "get_my_saved",
  description:
    "Get the authenticated user's saved posts and comments (private to the account). Read-only but requires user credentials (REDDIT_USERNAME/REDDIT_PASSWORD). Returns up to `limit` items plus an `after` pagination cursor. Use get_my_overview for your authored activity. Do NOT use this for another user — saved items are private and have no cross-user equivalent.",
  annotations: {
    title: "Get My Saved",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    limit: z.number().min(1).max(100).default(25).describe("How many saved items to return, 1–100 (default 25)."),
    after: z
      .string()
      .optional()
      .describe("Forward pagination cursor: the `after` value returned by a previous call. Omit for the first page."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getMySaved({ limit: args.limit, after: args.after })
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get saved content: ${err.message}`)
      },
      (content) => formatUserContent("Your Saved Content", content),
    )
  },
})

server.addTool({
  name: "get_user_posts",
  description:
    "Get posts submitted by a specific user, with sort (new/hot/top) and time filter. Read-only; works anonymously. Returns a page of posts (title, subreddit, score, upvote ratio, comment count, permalink) plus an `after` cursor for paging. Use get_user_comments for their comments, or get_user_info for karma/profile stats. Do NOT use this to search a subreddit — use search_reddit or browse_subreddit.",
  annotations: {
    title: "Get User Posts",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    username: z.string().describe("The author's Reddit username, without the u/ prefix (e.g. 'spez')."),
    sort: z
      .enum(["new", "hot", "top"])
      .default("new")
      .describe(
        "Ordering: 'new' (most recent), 'hot' (currently active), or 'top' (highest score within `time_filter`). Default 'new'.",
      ),
    time_filter: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .default("all")
      .describe("Time window for scoring; only applies when sort='top'. Ignored for 'new'/'hot'. Default 'all'."),
    limit: z.number().min(1).max(100).default(10).describe("How many posts to return, 1–100 (default 10)."),
    after: z
      .string()
      .optional()
      .describe("Forward pagination cursor: the `after` value from a previous call. Omit for the first page."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getUserPosts(args.username, {
      sort: args.sort,
      timeFilter: args.time_filter,
      limit: args.limit,
      after: args.after,
    })

    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get user posts: ${err.message}`)
      },
      (page) => {
        const posts = page.items
        if (posts.length === 0) {
          return `No posts found for u/${args.username} with the specified filters.`
        }

        const postSummaries = posts
          .map((post, index) => {
            const flags = [...(post.over18 ? ["**NSFW**"] : []), ...(post.spoiler === true ? ["**Spoiler**"] : [])]

            return `### ${index + 1}. ${post.title} ${flags.join(" ")}
- Subreddit: r/${post.subreddit}
- Score: ${post.score.toLocaleString()} (${(post.upvoteRatio * 100).toFixed(1)}% upvoted)
- Comments: ${post.numComments.toLocaleString()}
- Posted: ${new Date(post.createdUtc * 1000).toLocaleString()}
- Link: https://reddit.com${post.permalink}`
          })
          .join("\n\n")

        return `# Posts by u/${args.username} (${args.sort} - ${args.time_filter})

${postSummaries}${nextPageHint(page.after)}`
      },
    )
  },
})

server.addTool({
  name: "get_user_comments",
  description:
    "Get comments made by a specific user, with sort (new/hot/top) and time filter. Read-only; works anonymously. Returns a page of comments (subreddit, parent post title, body excerpt, score, permalink) plus an `after` cursor. Use get_user_posts for their submissions, or get_user_info for karma/profile stats. Do NOT use this to read one post's thread — use get_post_comments.",
  annotations: {
    title: "Get User Comments",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    username: z.string().describe("The author's Reddit username, without the u/ prefix (e.g. 'spez')."),
    sort: z
      .enum(["new", "hot", "top"])
      .default("new")
      .describe(
        "Ordering: 'new' (most recent), 'hot' (currently active), or 'top' (highest score within `time_filter`). Default 'new'.",
      ),
    time_filter: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .default("all")
      .describe("Time window for scoring; only applies when sort='top'. Ignored for 'new'/'hot'. Default 'all'."),
    limit: z.number().min(1).max(100).default(10).describe("How many comments to return, 1–100 (default 10)."),
    after: z
      .string()
      .optional()
      .describe("Forward pagination cursor: the `after` value from a previous call. Omit for the first page."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getUserComments(args.username, {
      sort: args.sort,
      timeFilter: args.time_filter,
      limit: args.limit,
      after: args.after,
    })

    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get user comments: ${err.message}`)
      },
      (page) => {
        const comments = page.items
        if (comments.length === 0) {
          return `No comments found for u/${args.username} with the specified filters.`
        }

        const commentSummaries = comments
          .map((comment, index) => {
            const truncatedBody = comment.body.length > 300 ? `${comment.body.substring(0, 300)}...` : comment.body

            const flags = [...(comment.edited ? ["*(edited)*"] : []), ...(comment.isSubmitter ? ["**OP**"] : [])]

            return `### ${index + 1}. Comment ${flags.join(" ")}
In r/${comment.subreddit} on "${comment.submissionTitle}"

> ${truncatedBody}

- Score: ${comment.score.toLocaleString()}
- Posted: ${new Date(comment.createdUtc * 1000).toLocaleString()}
- Link: https://reddit.com${comment.permalink}`
          })
          .join("\n\n")

        return `# Comments by u/${args.username} (${args.sort} - ${args.time_filter})

${commentSummaries}${nextPageHint(page.after)}`
      },
    )
  },
})

// Post tools
server.addTool({
  name: "get_reddit_post",
  description:
    "Get a single post by subreddit + post id: title, author, self-text or link content, score, upvote ratio, comment count, flair/flags, and an engagement analysis. Read-only; works anonymously. Returns the post only — use get_post_comments for its comment thread. Do NOT use this to list a subreddit's posts (use browse_subreddit / get_top_posts) or to find posts by keyword (use search_reddit).",
  annotations: {
    title: "Get Reddit Post",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    subreddit: z.string().describe("The subreddit the post lives in, without the r/ prefix (e.g. 'programming')."),
    post_id: z
      .string()
      .describe(
        "Base36 post id — the segment after /comments/ in a permalink like reddit.com/r/<sub>/comments/<post_id>/... (e.g. '1abc23'). With or without a t3_ prefix.",
      ),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getPost(args.post_id, args.subreddit)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get post: ${err.message}`)
      },
      (post) => {
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
- Flags: ${formattedPost.metadata.flags.length > 0 ? formattedPost.metadata.flags.join(", ") : "None"}
- Flair: ${formattedPost.metadata.flair}

## Links
- Full Post: ${formattedPost.links.fullPost}
- Short Link: ${formattedPost.links.shortLink}

## Engagement Analysis
- ${formattedPost.engagementAnalysis.replace(/\n {2}- /g, "\n- ")}

## Best Time to Engage
${formattedPost.bestTimeToEngage}`
      },
    )
  },
})

server.addTool({
  name: "get_top_posts",
  description:
    "Get the top-scoring posts from a subreddit — or from the authenticated home feed if no subreddit is given — within a time window (hour…all). Read-only; works anonymously. Returns a page of posts (title, author, score, upvote ratio, comments, link) plus an `after` cursor. This is a shortcut for the 'top' sort; use browse_subreddit for hot/new/rising/controversial, or search_reddit to find posts by keyword.",
  annotations: {
    title: "Get Top Posts",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    subreddit: z
      .string()
      .optional()
      .describe(
        "Subreddit to read, without the r/ prefix (e.g. 'science'). Omit to use the authenticated home feed (requires credentials).",
      ),
    time_filter: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .default("week")
      .describe("Time window the 'top' ranking is computed over (e.g. 'day' = top today). Default 'week'."),
    limit: z.number().min(1).max(100).default(10).describe("How many posts to return, 1–100 (default 10)."),
    after: z
      .string()
      .optional()
      .describe("Forward pagination cursor: the `after` value from a previous call. Omit for the first page."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getTopPosts(args.subreddit ?? "", args.time_filter, args.limit, args.after)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get top posts: ${err.message}`)
      },
      (page) => {
        const posts = page.items
        if (posts.length === 0) {
          const location = Option(args.subreddit).fold(
            () => "home feed",
            (sr) => `r/${sr}`,
          )
          return `No posts found in ${location} for the specified time period.`
        }

        const formattedPosts = posts.map(formatPostInfo)
        const postSummaries = formattedPosts
          .map(
            (post, index) => `### ${index + 1}. ${post.title}
- Author: u/${post.author}
- Score: ${post.stats.score.toLocaleString()} (${(post.stats.upvoteRatio * 100).toFixed(1)}% upvoted)
- Comments: ${post.stats.comments.toLocaleString()}
- Posted: ${post.metadata.posted}
- Link: ${post.links.shortLink}`,
          )
          .join("\n\n")

        const location = Option(args.subreddit).fold(
          () => "Home Feed",
          (sr) => `r/${sr}`,
        )
        return `# Top Posts from ${location} (${args.time_filter})

${postSummaries}${nextPageHint(page.after)}`
      },
    )
  },
})

server.addTool({
  name: "browse_subreddit",
  description:
    "Browse a subreddit — or the authenticated home feed when no subreddit is given — by sort order: hot, new, top, rising, or controversial. Read-only; works anonymously. `time_filter` applies only to the top and controversial sorts. Returns a page of posts (title, author, score, upvote ratio, comments, link) plus an `after` cursor. Use get_top_posts as a shortcut for the top sort, or search_reddit to find posts by keyword rather than by feed order.",
  annotations: {
    title: "Browse Subreddit",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    subreddit: z
      .string()
      .optional()
      .describe(
        "Subreddit to browse, without the r/ prefix (e.g. 'news'). Omit to use the authenticated home feed (requires credentials).",
      ),
    sort: z
      .enum(["hot", "new", "top", "rising", "controversial"])
      .default("hot")
      .describe(
        "Feed ordering: 'hot' (default), 'new', 'rising', 'top', or 'controversial'. 'top'/'controversial' honor `time_filter`.",
      ),
    time_filter: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .default("week")
      .describe("Time window; only applies to sort='top' or 'controversial'. Ignored otherwise. Default 'week'."),
    limit: z.number().min(1).max(100).default(10).describe("How many posts to return, 1–100 (default 10)."),
    after: z
      .string()
      .optional()
      .describe("Forward pagination cursor: the `after` value from a previous call. Omit for the first page."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.browseSubreddit(
      args.subreddit ?? "",
      args.sort,
      args.time_filter,
      args.limit,
      args.after,
    )
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to browse subreddit: ${err.message}`)
      },
      (page) => {
        const posts = page.items
        const location = Option(args.subreddit).fold(
          () => "home feed",
          (sr) => `r/${sr}`,
        )
        if (posts.length === 0) {
          return `No posts found in ${location}.`
        }

        const formattedPosts = posts.map(formatPostInfo)
        const postSummaries = formattedPosts
          .map(
            (post, index) => `### ${index + 1}. ${post.title}
- Author: u/${post.author}
- Score: ${post.stats.score.toLocaleString()} (${(post.stats.upvoteRatio * 100).toFixed(1)}% upvoted)
- Comments: ${post.stats.comments.toLocaleString()}
- Posted: ${post.metadata.posted}
- Link: ${post.links.shortLink}`,
          )
          .join("\n\n")

        const timeSuffix = args.sort === "top" || args.sort === "controversial" ? `, ${args.time_filter}` : ""
        const heading = location === "home feed" ? "Home Feed" : location
        return `# ${args.sort} posts from ${heading} (${args.sort}${timeSuffix})

${postSummaries}${nextPageHint(page.after)}`
      },
    )
  },
})

// Subreddit tools
server.addTool({
  name: "get_subreddit_info",
  description:
    "Get a subreddit's profile: title, description, subscriber and active-user counts, creation date, flags, wiki/link URLs, plus a community analysis and posting tips. Read-only; works anonymously. Returns metadata about the community itself — use browse_subreddit / get_top_posts for its posts, or get_subreddit_rules for its posting rules. Do NOT use this to find subreddits by topic — use search_reddit with type='sr'.",
  annotations: {
    title: "Get Subreddit Info",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    subreddit_name: z.string().describe("The subreddit name, without the r/ prefix (e.g. 'askscience')."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getSubredditInfo(args.subreddit_name)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get subreddit info: ${err.message}`)
      },
      (subreddit) => {
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
- ${formattedSubreddit.communityAnalysis.replace(/\n {2}- /g, "\n- ")}

## Engagement Tips
- ${formattedSubreddit.engagementTips.replace(/\n {2}- /g, "\n- ")}`
      },
    )
  },
})

server.addTool({
  name: "get_subreddit_rules",
  description:
    "Get a subreddit's posting rules (each rule's name, what it applies to, and its description). Read-only; works anonymously. Returns the rules list, or a note when the subreddit lists none. Call this before create_post to check requirements and avoid auto-removal. For available post flairs use get_post_flairs instead.",
  annotations: {
    title: "Get Subreddit Rules",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    subreddit_name: z.string().describe("The subreddit name, without the r/ prefix (e.g. 'AskReddit')."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getSubredditRules(args.subreddit_name)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get subreddit rules: ${err.message}`)
      },
      (rules) => {
        if (rules.length === 0) {
          return `r/${args.subreddit_name} has no listed subreddit-specific rules.`
        }

        const ruleList = rules
          .map((rule, index) => {
            const applies = rule.kind === "all" ? "posts & comments" : `${rule.kind}s`
            const detail = rule.description.trim() === "" ? "" : `\n${rule.description.trim()}`
            return `### ${index + 1}. ${rule.shortName} _(applies to ${applies})_${detail}`
          })
          .join("\n\n")

        return `# Posting Rules for r/${args.subreddit_name}

${ruleList}`
      },
    )
  },
})

server.addTool({
  name: "get_post_flairs",
  description:
    "List a subreddit's selectable link flairs (flair text + flair_id) for use with create_post. Read-only, but requires user credentials; many subreddits expose flairs only to members, so this can 403 or return empty anonymously. Pass a returned flair_id (and flair_text for text-editable flairs) to create_post. For the subreddit's posting rules use get_subreddit_rules instead.",
  annotations: {
    title: "Get Post Flairs",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    subreddit_name: z.string().describe("The subreddit name, without the r/ prefix (e.g. 'gadgets')."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getPostFlairs(args.subreddit_name)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get post flairs: ${err.message}`)
      },
      (flairs) => {
        if (flairs.length === 0) {
          return `r/${args.subreddit_name} has no selectable link flairs (or none are visible to this account).`
        }

        const flairList = flairs
          .map((flair) => {
            const editable = flair.textEditable === true ? " _(text editable)_" : ""
            return `- ${flair.text}${editable} — \`flair_id: ${flair.id}\``
          })
          .join("\n")

        return `# Available Link Flairs for r/${args.subreddit_name}

${flairList}

Pass the desired \`flair_id\` to \`create_post\`.`
      },
    )
  },
})

server.addTool({
  name: "get_trending_subreddits",
  description:
    "Get the subreddits Reddit is currently featuring as trending/popular. Read-only, no parameters; works anonymously. Returns a list of subreddit names that changes through the day (cached briefly server-side). To find subreddits by keyword instead of by trend, use search_reddit with type='sr'.",
  annotations: {
    title: "Get Trending Subreddits",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({}),
  execute: async () => {
    const client = unwrapClient()

    const result = await client.getTrendingSubreddits()
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get trending subreddits: ${err.message}`)
      },
      (trendingSubreddits) => `# Trending Subreddits

${trendingSubreddits.map((subreddit, index) => `${index + 1}. r/${subreddit}`).join("\n")}`,
    )
  },
})

// Search tools
server.addTool({
  name: "search_reddit",
  description:
    "Search Reddit for posts — or subreddits/users via `type` — optionally scoped to one subreddit, with sort and time filters. Read-only; works anonymously. Returns a page of results (title, subreddit, author, score, comments, link) plus an `after` cursor for paging. Use this to find content by keyword; use browse_subreddit / get_top_posts to list a known subreddit's feed instead.",
  annotations: {
    title: "Search Reddit",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    query: z
      .string()
      .describe(
        "Search terms; supports Reddit operators (quotes for exact phrases, author:name, self:yes). Must be non-empty.",
      ),
    subreddit: z
      .string()
      .optional()
      .describe(
        "Restrict results to this subreddit, without the r/ prefix (e.g. 'python'). Omit to search all of Reddit.",
      ),
    sort: z
      .enum(["relevance", "hot", "top", "new", "comments"])
      .default("relevance")
      .describe(
        "Sort order. Prefer 'relevance' (default) for finding posts about a topic. Use 'top'/'hot' only for what's currently popular and 'new' for the latest — these rank by karma/recency and, especially combined with a narrow time_filter, can surface loosely-matching posts over the best topical results.",
      ),
    time_filter: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .default("all")
      .describe("Restrict to results from this recent window (e.g. 'week'). Default 'all' (no time limit)."),
    limit: z.number().min(1).max(100).default(10).describe("How many results to return, 1–100 (default 10)."),
    type: z
      .enum(["link", "sr", "user"])
      .default("link")
      .describe("What to search for: 'link' = posts (default), 'sr' = subreddits, 'user' = users."),
    after: z
      .string()
      .optional()
      .describe("Forward pagination cursor: the `after` value from a previous call. Omit for the first page."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    if (args.query.trim() === "") {
      // eslint-disable-next-line functype/prefer-either
      throw new Error("Search query cannot be empty")
    }

    const result = await client.searchReddit(args.query, {
      subreddit: args.subreddit,
      sort: args.sort,
      timeFilter: args.time_filter,
      limit: args.limit,
      type: args.type,
      after: args.after,
    })

    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to search: ${err.message}`)
      },
      (page) => {
        const posts = page.items
        if (posts.length === 0) {
          const searchLocation = Option(args.subreddit).fold(
            () => "",
            (sr) => ` in r/${sr}`,
          )
          return `No results found for "${args.query}"${searchLocation}.`
        }

        const searchResults = posts
          .map((post, index) => {
            const flags = [...(post.over18 ? ["**NSFW**"] : []), ...(post.spoiler === true ? ["**Spoiler**"] : [])]

            return `### ${index + 1}. ${post.title} ${flags.join(" ")}
- Subreddit: r/${post.subreddit}
- Author: u/${post.author}
- Score: ${post.score.toLocaleString()} (${(post.upvoteRatio * 100).toFixed(1)}% upvoted)
- Comments: ${post.numComments.toLocaleString()}
- Posted: ${new Date(post.createdUtc * 1000).toLocaleString()}
- Link: https://reddit.com${post.permalink}`
          })
          .join("\n\n")

        const searchLocation = Option(args.subreddit).fold(
          () => "",
          (sr) => ` in r/${sr}`,
        )
        return `# Reddit Search Results for: "${args.query}"${searchLocation}

Sorted by: ${args.sort} | Time: ${args.time_filter} | Type: ${args.type}

${searchResults}${nextPageHint(page.after)}`
      },
    )
  },
})

// Write tools (require user authentication)
server.addTool({
  name: "create_post",
  description:
    "Create a new text or link post in a subreddit. Mutating and NOT idempotent — each call publishes a separate post. Requires REDDIT_USERNAME and REDDIT_PASSWORD; fails without them. Returns the new post's id and URL. Check get_subreddit_rules and get_post_flairs first, since many subreddits require a flair or reject certain content. WARNING: rapid posting or duplicate content may trigger Reddit's spam detection and account bans — enable REDDIT_SAFE_MODE=standard for rate limiting and duplicate detection.",
  annotations: {
    title: "Create Post",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  parameters: z.object({
    subreddit: z.string().describe("Target subreddit, without the r/ prefix (e.g. 'test')."),
    title: z.string().describe("Post title (cannot be edited after creation)."),
    content: z
      .string()
      .describe(
        "For a self post (is_self=true): the body text, Reddit markdown supported. For a link post (is_self=false): the destination URL.",
      ),
    is_self: z
      .boolean()
      .default(true)
      .describe(
        "true = text/self post using `content` as the body (default); false = link post using `content` as the URL.",
      ),
    flair_id: z
      .string()
      .optional()
      .describe(
        "Link flair template id from get_post_flairs; many subreddits require one or the post is auto-removed.",
      ),
    flair_text: z
      .string()
      .optional()
      .describe("Custom flair text, allowed only for flairs whose template is text-editable."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    if (process.env.REDDIT_USERNAME === undefined || process.env.REDDIT_PASSWORD === undefined) {
      // eslint-disable-next-line functype/prefer-either
      throw new Error(
        "User authentication required. Please set REDDIT_USERNAME and REDDIT_PASSWORD environment variables.",
      )
    }

    const result = await client.createPost(
      args.subreddit,
      args.title,
      args.content,
      args.is_self,
      args.flair_id,
      args.flair_text,
    )
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to create post: ${err.message}`)
      },
      (post) => {
        const formattedPost = formatPostInfo(post)

        return `# Post Created Successfully

## Post Details
- Title: ${formattedPost.title}
- Subreddit: r/${formattedPost.subreddit}
- Type: ${formattedPost.type}
- Link: ${formattedPost.links.fullPost}

Your post has been successfully submitted to r/${formattedPost.subreddit}.`
      },
    )
  },
})

server.addTool({
  name: "reply_to_post",
  description:
    "Post a reply to an existing post or comment. Mutating and NOT idempotent — each call adds a new comment. Requires REDDIT_USERNAME and REDDIT_PASSWORD. The parent is identified by its thing id — t3_ for a post, t1_ for a comment — so this creates both top-level and nested replies. Returns the new comment's id. Use edit_comment to change a reply you already posted. WARNING: rapid or duplicate replies may trigger Reddit's spam detection; enable REDDIT_SAFE_MODE=standard for rate limiting and duplicate detection.",
  annotations: {
    title: "Reply to Post or Comment",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  parameters: z.object({
    post_id: z
      .string()
      .describe(
        "Parent thing id to reply under: t3_<id> for a post (creates a top-level comment) or t1_<id> for a comment (creates a nested reply).",
      ),
    content: z.string().describe("Reply body text; Reddit markdown supported."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    if (process.env.REDDIT_USERNAME === undefined || process.env.REDDIT_PASSWORD === undefined) {
      // eslint-disable-next-line functype/prefer-either
      throw new Error(
        "User authentication required. Please set REDDIT_USERNAME and REDDIT_PASSWORD environment variables.",
      )
    }

    const result = await client.replyToPost(args.post_id, args.content)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to reply: ${err.message}`)
      },
      (comment) => `# Reply Posted Successfully

## Comment Details
- Posted to: ${args.post_id}
- Author: u/${process.env.REDDIT_USERNAME}
- Comment ID: ${comment.id}

Your reply has been successfully posted.`,
    )
  },
})

server.addTool({
  name: "delete_post",
  description:
    "Permanently delete one of your own posts. Mutating and destructive but idempotent — deleting an already-deleted post is a no-op. Requires REDDIT_USERNAME and REDDIT_PASSWORD, and only works on posts authored by the authenticated account. Only affects the post you name; use delete_comment for comments. WARNING: this cannot be undone — the content is removed, though the post id remains.",
  annotations: {
    title: "Delete Post",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    thing_id: z
      .string()
      .describe(
        "The post to delete: a full thing id 't3_<id>' or just the base36 post id '<id>' (the 't3_' prefix is added automatically). Must be a post you authored.",
      ),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    if (process.env.REDDIT_USERNAME === undefined || process.env.REDDIT_PASSWORD === undefined) {
      // eslint-disable-next-line functype/prefer-either
      throw new Error(
        "User authentication required. Please set REDDIT_USERNAME and REDDIT_PASSWORD environment variables.",
      )
    }

    const result = await client.deletePost(args.thing_id)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to delete post: ${err.message}`)
      },
      () => `# Post Deleted Successfully

The post ${args.thing_id} has been permanently deleted from Reddit.

**Note**: This action cannot be undone. The post content has been removed and cannot be recovered.`,
    )
  },
})

server.addTool({
  name: "delete_comment",
  description:
    "Permanently delete one of your own comments. Mutating and destructive but idempotent — deleting an already-deleted comment is a no-op. Requires REDDIT_USERNAME and REDDIT_PASSWORD, and only works on comments authored by the authenticated account. Only affects the comment you name; use delete_post for posts. WARNING: this cannot be undone — the content is removed, though the comment id remains.",
  annotations: {
    title: "Delete Comment",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    thing_id: z
      .string()
      .describe(
        "The comment to delete: a full thing id 't1_<id>' or just the base36 comment id '<id>' (the 't1_' prefix is added automatically). Must be a comment you authored.",
      ),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    if (process.env.REDDIT_USERNAME === undefined || process.env.REDDIT_PASSWORD === undefined) {
      // eslint-disable-next-line functype/prefer-either
      throw new Error(
        "User authentication required. Please set REDDIT_USERNAME and REDDIT_PASSWORD environment variables.",
      )
    }

    const result = await client.deleteComment(args.thing_id)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to delete comment: ${err.message}`)
      },
      () => `# Comment Deleted Successfully

The comment ${args.thing_id} has been permanently deleted from Reddit.

**Note**: This action cannot be undone. The comment content has been removed and cannot be recovered.`,
    )
  },
})

server.addTool({
  name: "edit_post",
  description:
    'Replace the body text of one of your own self-text posts. Mutating and idempotent (same text → same result); it overwrites the previous body. Requires REDDIT_USERNAME and REDDIT_PASSWORD, and works only on self posts you authored — titles and link posts cannot be edited. Adds an "edited" marker. Use create_post to make a new post, or edit_comment for comments. WARNING: rapid edits may trigger spam detection; enable REDDIT_SAFE_MODE for protection.',
  annotations: {
    title: "Edit Post",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    thing_id: z
      .string()
      .describe(
        "The post to edit: a full thing id 't3_<id>' or just the base36 post id '<id>' (the 't3_' prefix is added automatically). Must be a self-text post you authored.",
      ),
    new_text: z
      .string()
      .describe("Replacement body text; fully overwrites the current body. Reddit markdown supported."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    if (process.env.REDDIT_USERNAME === undefined || process.env.REDDIT_PASSWORD === undefined) {
      // eslint-disable-next-line functype/prefer-either
      throw new Error(
        "User authentication required. Please set REDDIT_USERNAME and REDDIT_PASSWORD environment variables.",
      )
    }

    const result = await client.editPost(args.thing_id, args.new_text)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to edit post: ${err.message}`)
      },
      () => `# Post Edited Successfully

The post ${args.thing_id} has been updated with your new content.

**Note**:
- Only self (text) posts can be edited
- Post titles cannot be edited
- Link posts cannot be edited
- An "edited" marker will appear on your post`,
    )
  },
})

server.addTool({
  name: "edit_comment",
  description:
    'Replace the text of one of your own comments. Mutating and idempotent (same text → same result); it overwrites the previous content. Requires REDDIT_USERNAME and REDDIT_PASSWORD, and works only on comments you authored. Adds an "edited" marker. Use reply_to_post to add a new comment, or edit_post for posts. WARNING: rapid edits may trigger spam detection; enable REDDIT_SAFE_MODE for protection.',
  annotations: {
    title: "Edit Comment",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    thing_id: z
      .string()
      .describe(
        "The comment to edit: a full thing id 't1_<id>' or just the base36 comment id '<id>' (the 't1_' prefix is added automatically). Must be a comment you authored.",
      ),
    new_text: z
      .string()
      .describe("Replacement comment text; fully overwrites the current content. Reddit markdown supported."),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    if (process.env.REDDIT_USERNAME === undefined || process.env.REDDIT_PASSWORD === undefined) {
      // eslint-disable-next-line functype/prefer-either
      throw new Error(
        "User authentication required. Please set REDDIT_USERNAME and REDDIT_PASSWORD environment variables.",
      )
    }

    const result = await client.editComment(args.thing_id, args.new_text)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to edit comment: ${err.message}`)
      },
      () => `# Comment Edited Successfully

The comment ${args.thing_id} has been updated with your new content.

**Note**: An "edited" marker will appear on your comment to show it has been modified.`,
    )
  },
})

// Comment tools
server.addTool({
  name: "get_post_comments",
  description:
    "Get the comment thread for a post (by post id + subreddit), sorted best/top/new/controversial/old/qa. Read-only; works anonymously. Returns the post header plus threaded comments (author, OP/edited badges, score, body, nesting depth) up to `limit`. Long threads are truncated with 'load more' stubs — expand those with get_more_comments. Use get_reddit_post for just the post body, not the thread.",
  annotations: {
    title: "Get Post Comments",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    post_id: z
      .string()
      .describe(
        "Base36 post id — the segment after /comments/ in a permalink (e.g. '1abc23'). With or without a t3_ prefix.",
      ),
    subreddit: z.string().describe("The subreddit the post lives in, without the r/ prefix (e.g. 'movies')."),
    sort: z
      .enum(["best", "top", "new", "controversial", "old", "qa"])
      .default("best")
      .describe("Comment ordering: 'best' (default), 'top', 'new', 'controversial', 'old', or 'qa' (Q&A)."),
    limit: z
      .number()
      .min(1)
      .max(500)
      .default(100)
      .describe(
        "Maximum comments to return, 1–500 (default 100). Deeply nested replies may still be truncated as 'load more' stubs.",
      ),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    if (args.post_id === "" || args.subreddit === "") {
      // eslint-disable-next-line functype/prefer-either
      throw new Error("post_id and subreddit are required")
    }

    const result = await client.getPostComments(args.post_id, args.subreddit, {
      sort: args.sort,
      limit: args.limit,
    })

    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to get comments: ${err.message}`)
      },
      ({ post, comments }) => {
        const header = `# Comments for: ${post.title}

**Post by u/${post.author} in r/${post.subreddit}**
- Score: ${post.score.toLocaleString()} | Comments: ${post.numComments.toLocaleString()}
- Posted: ${new Date(post.createdUtc * 1000).toLocaleString()}

---

`

        if (comments.length === 0) {
          return `${header}No comments found for this post.`
        }

        const commentSummaries = comments
          .map((comment) => {
            const indent = "└─".repeat(Math.min(comment.depth ?? 0, 3))
            const authorBadge = comment.isSubmitter ? " **[OP]**" : ""
            const editedBadge = comment.edited ? " *(edited)*" : ""

            return `${indent} **u/${comment.author}**${authorBadge}${editedBadge} (${comment.score.toLocaleString()} points)

${comment.body}

---`
          })
          .join("\n\n")

        return header + commentSummaries
      },
    )
  },
})

server.addTool({
  name: "get_more_comments",
  description:
    "Expand truncated 'load more comments' stubs in a thread. Read-only; works anonymously. Pass the post's link id and the comment ids from a 'more' node (surfaced by get_post_comments) to fetch those hidden comments; returns the expanded comments (author, body excerpt, score, link). Call get_post_comments first to obtain the thread and its 'more' node ids — do NOT invent ids.",
  annotations: {
    title: "Get More Comments",
    readOnlyHint: true,
    openWorldHint: true,
  },
  parameters: z.object({
    link_id: z
      .string()
      .describe("The parent post's link id (base36, with or without the t3_ prefix) that the stub belongs to."),
    comment_ids: z
      .array(z.string())
      .min(1)
      .describe(
        "Base36 comment ids to expand, taken from a 'more' node returned by get_post_comments (not arbitrary ids).",
      ),
  }),
  execute: async (args) => {
    const client = unwrapClient()

    const result = await client.getMoreComments(args.link_id, args.comment_ids)
    return result.fold(
      (err) => {
        // eslint-disable-next-line functype/prefer-either
        throw new Error(`Failed to expand comments: ${err.message}`)
      },
      (comments) => {
        if (comments.length === 0) {
          return "No additional comments were returned for those ids."
        }

        const commentList = comments
          .map((comment, index) => {
            const truncated = comment.body.length > 300 ? `${comment.body.substring(0, 300)}...` : comment.body
            const flags = [...(comment.edited ? ["*(edited)*"] : []), ...(comment.isSubmitter ? ["**OP**"] : [])]
            return `### ${index + 1}. u/${comment.author} ${flags.join(" ")}
> ${truncated}

- Score: ${comment.score.toLocaleString()}
- Link: https://reddit.com${comment.permalink}`
          })
          .join("\n\n")

        return `# Expanded Comments (${comments.length})

${commentList}`
      },
    )
  },
})

// Initialize and start server
async function main() {
  await setupRedditClient()

  const useHttp = process.env.TRANSPORT_TYPE === "httpStream" || process.env.TRANSPORT_TYPE === "http"
  const port = parseInt(process.env.PORT ?? "3000")
  const host = process.env.HOST ?? "127.0.0.1"

  if (useHttp) {
    console.error(`[Setup] Starting HTTP server on ${host}:${port}`)
    await server.start({
      transportType: "httpStream",
      httpStream: {
        port,
        host,
        endpoint: "/mcp",
      },
    })
    console.error(`[Setup] HTTP server ready at http://${host}:${port}/mcp`)
    console.error(`[Setup] SSE endpoint available at http://${host}:${port}/sse`)
  } else {
    console.error("[Setup] Starting in stdio mode")
    await server.start({
      transportType: "stdio",
    })
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error("[Shutdown] Shutting down Reddit MCP Server...")
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.error("[Shutdown] Shutting down Reddit MCP Server...")
  process.exit(0)
})

void main().catch(console.error)
