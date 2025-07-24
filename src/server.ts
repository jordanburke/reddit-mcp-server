import { Hono } from "hono"
import { cors } from "hono/cors"
import { serve } from "@hono/node-server"
import { StreamableHTTPTransport } from "@hono/mcp"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js"
import { initializeRedditClient } from "./client/reddit-client"
import * as tools from "./tools"
import { createAuthMiddleware, generateRandomToken } from "./middleware/auth"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

const app = new Hono()

// Configure OAuth
const authToken = process.env.OAUTH_TOKEN || (process.env.OAUTH_ENABLED === "true" ? generateRandomToken() : undefined)
const authConfig = {
  enabled: process.env.OAUTH_ENABLED === "true",
  token: authToken,
}

// Log auth configuration on startup
if (authConfig.enabled) {
  if (process.env.OAUTH_TOKEN) {
    console.log("[Auth] OAuth enabled with provided token")
  } else {
    console.log(`[Auth] OAuth enabled with generated token: ${authToken}`)
  }
} else {
  console.log("[Auth] OAuth disabled - server accessible without authentication")
}

// Add CORS middleware
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["*"],
  }),
)

// Add OAuth middleware (applies to all protected routes)
app.use("/mcp", createAuthMiddleware(authConfig))

// Health check endpoint
app.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "Reddit MCP Server",
    endpoint: "/mcp",
    version: "1.0.10",
    auth: {
      enabled: authConfig.enabled,
      ...(authConfig.enabled && { token_provided: !!process.env.OAUTH_TOKEN }),
    },
  })
})

// Create MCP server instance
function createMCPServer() {
  const server = new Server(
    {
      name: "reddit-mcp-server",
      version: "1.0.10",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  // Set up list tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "test_reddit_mcp_server",
        description: "Test the Reddit MCP Server",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_reddit_post",
        description: "Get a Reddit post",
        inputSchema: {
          type: "object",
          properties: {
            subreddit: {
              type: "string",
              description: "The subreddit to fetch posts from",
            },
            post_id: {
              type: "string",
              description: "The ID of the post to fetch",
            },
          },
          required: ["subreddit", "post_id"],
        },
      },
      {
        name: "get_top_posts",
        description: "Get top posts from a subreddit",
        inputSchema: {
          type: "object",
          properties: {
            subreddit: {
              type: "string",
              description: "Name of the subreddit",
            },
            time_filter: {
              type: "string",
              description: "Time period to filter posts (e.g. 'day', 'week', 'month', 'year', 'all')",
              enum: ["day", "week", "month", "year", "all"],
              default: "week",
            },
            limit: {
              type: "integer",
              description: "Number of posts to fetch",
              default: 10,
            },
          },
          required: ["subreddit"],
        },
      },
      {
        name: "get_user_info",
        description: "Get information about a Reddit user",
        inputSchema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "The username of the Reddit user to get info for",
            },
          },
          required: ["username"],
        },
      },
      {
        name: "get_subreddit_info",
        description: "Get information about a subreddit",
        inputSchema: {
          type: "object",
          properties: {
            subreddit_name: {
              type: "string",
              description: "Name of the subreddit",
            },
          },
          required: ["subreddit_name"],
        },
      },
      {
        name: "get_trending_subreddits",
        description: "Get currently trending subreddits",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "create_post",
        description: "Create a new post in a subreddit",
        inputSchema: {
          type: "object",
          properties: {
            subreddit: {
              type: "string",
              description: "Name of the subreddit to post in",
            },
            title: {
              type: "string",
              description: "Title of the post",
            },
            content: {
              type: "string",
              description: "Content of the post (text for self posts, URL for link posts)",
            },
            is_self: {
              type: "boolean",
              description: "Whether this is a self (text) post (true) or link post (false)",
              default: true,
            },
          },
          required: ["subreddit", "title", "content"],
        },
      },
      {
        name: "reply_to_post",
        description: "Post a reply to an existing Reddit post",
        inputSchema: {
          type: "object",
          properties: {
            post_id: {
              type: "string",
              description: "The ID of the post to reply to",
            },
            content: {
              type: "string",
              description: "The content of the reply",
            },
            subreddit: {
              type: "string",
              description: "The subreddit name if known (for validation)",
            },
          },
          required: ["post_id", "content"],
        },
      },
      {
        name: "search_reddit",
        description: "Search for posts on Reddit",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
            subreddit: {
              type: "string",
              description: "Search within a specific subreddit (optional)",
            },
            sort: {
              type: "string",
              description: "Sort order: relevance, hot, top, new, comments",
              enum: ["relevance", "hot", "top", "new", "comments"],
              default: "relevance",
            },
            time_filter: {
              type: "string",
              description: "Time filter: hour, day, week, month, year, all",
              enum: ["hour", "day", "week", "month", "year", "all"],
              default: "all",
            },
            limit: {
              type: "number",
              description: "Maximum number of results to return",
              minimum: 1,
              maximum: 100,
              default: 10,
            },
            type: {
              type: "string",
              description: "Type of content: link (posts), sr (subreddits), user (users)",
              enum: ["link", "sr", "user"],
              default: "link",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_post_comments",
        description: "Get comments for a specific Reddit post",
        inputSchema: {
          type: "object",
          properties: {
            post_id: {
              type: "string",
              description: "The ID of the post",
            },
            subreddit: {
              type: "string",
              description: "The subreddit where the post is located",
            },
            sort: {
              type: "string",
              description: "Comment sort order: best, top, new, controversial, old, qa",
              enum: ["best", "top", "new", "controversial", "old", "qa"],
              default: "best",
            },
            limit: {
              type: "number",
              description: "Maximum number of comments to load",
              minimum: 1,
              maximum: 500,
              default: 100,
            },
          },
          required: ["post_id", "subreddit"],
        },
      },
      {
        name: "get_user_posts",
        description: "Get posts submitted by a specific user",
        inputSchema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "The username to get posts for",
            },
            sort: {
              type: "string",
              description: "Sort order: new, hot, top, controversial",
              enum: ["new", "hot", "top", "controversial"],
              default: "new",
            },
            time_filter: {
              type: "string",
              description: "Time filter for top/controversial: hour, day, week, month, year, all",
              enum: ["hour", "day", "week", "month", "year", "all"],
              default: "all",
            },
            limit: {
              type: "number",
              description: "Maximum number of posts to return",
              minimum: 1,
              maximum: 100,
              default: 10,
            },
          },
          required: ["username"],
        },
      },
      {
        name: "get_user_comments",
        description: "Get comments made by a specific user",
        inputSchema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "The username to get comments for",
            },
            sort: {
              type: "string",
              description: "Sort order: new, hot, top, controversial",
              enum: ["new", "hot", "top", "controversial"],
              default: "new",
            },
            time_filter: {
              type: "string",
              description: "Time filter for top/controversial: hour, day, week, month, year, all",
              enum: ["hour", "day", "week", "month", "year", "all"],
              default: "all",
            },
            limit: {
              type: "number",
              description: "Maximum number of comments to return",
              minimum: 1,
              maximum: 100,
              default: 10,
            },
          },
          required: ["username"],
        },
      },
    ],
  }))

  // Set up call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const toolName = request.params.name
      const toolParams = request.params.arguments || {}

      switch (toolName) {
        case "test_reddit_mcp_server":
          return {
            content: [
              {
                type: "text",
                text: "Hello, world! The Reddit MCP Server is working correctly.",
              },
            ],
          }

        case "get_reddit_post":
          return await tools.getRedditPost(toolParams as { subreddit: string; post_id: string })

        case "get_top_posts":
          return await tools.getTopPosts(
            toolParams as {
              subreddit: string
              time_filter?: string
              limit?: number
            },
          )

        case "get_user_info":
          return await tools.getUserInfo(toolParams as { username: string })

        case "get_subreddit_info":
          return await tools.getSubredditInfo(toolParams as { subreddit_name: string })

        case "get_trending_subreddits":
          return await tools.getTrendingSubreddits()

        case "create_post":
          return await tools.createPost(
            toolParams as {
              subreddit: string
              title: string
              content: string
              is_self?: boolean
            },
          )

        case "reply_to_post":
          return await tools.replyToPost(
            toolParams as {
              post_id: string
              content: string
              subreddit?: string
            },
          )

        case "search_reddit":
          return await tools.searchReddit(
            toolParams as {
              query: string
              subreddit?: string
              sort?: string
              time_filter?: string
              limit?: number
              type?: string
            },
          )

        case "get_post_comments":
          return await tools.getPostComments(
            toolParams as {
              post_id: string
              subreddit: string
              sort?: string
              limit?: number
            },
          )

        case "get_user_posts":
          return await tools.getUserPosts(
            toolParams as {
              username: string
              sort?: string
              time_filter?: string
              limit?: number
            },
          )

        case "get_user_comments":
          return await tools.getUserComments(
            toolParams as {
              username: string
              sort?: string
              time_filter?: string
              limit?: number
            },
          )

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool with name ${toolName} not found`)
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new McpError(ErrorCode.InternalError, `Failed to fetch data: ${error.message}`)
      }
      throw error
    }
  })

  return server
}

// Initialize Reddit client
function initializeReddit() {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  const userAgent = process.env.REDDIT_USER_AGENT || "RedditMCPServer/0.1.0"
  const username = process.env.REDDIT_USERNAME
  const password = process.env.REDDIT_PASSWORD

  if (!clientId || !clientSecret) {
    console.error(
      "[Error] Missing required Reddit API credentials. Please set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables.",
    )
    process.exit(1)
  }

  try {
    initializeRedditClient({
      clientId,
      clientSecret,
      userAgent,
      username,
      password,
    })

    console.log("[Setup] Reddit client initialized")
    if (username && password) {
      console.log(`[Setup] Authenticated as user: ${username}`)
    } else {
      console.log("[Setup] Running in read-only mode (no user authentication)")
    }
  } catch (error) {
    console.error("[Error] Failed to initialize Reddit client:", error)
    process.exit(1)
  }
}

// MCP endpoint
app.all("/mcp", async (c) => {
  console.log(`[MCP] Request received: ${c.req.method} ${c.req.url}`)

  try {
    const mcpServer = createMCPServer()
    const transport = new StreamableHTTPTransport()
    await mcpServer.connect(transport)
    return transport.handleRequest(c)
  } catch (error) {
    console.error("[MCP] Request handling failed:", error)
    return c.json({ error: "Internal server error" }, 500)
  }
})

// Initialize Reddit client on startup
initializeReddit()

// Start server
export function startServer(port = 3000) {
  const server = serve({
    fetch: app.fetch,
    port,
  })

  console.log(`[Server] Reddit MCP Server running at http://localhost:${port}`)
  console.log(`[Server] MCP endpoint available at http://localhost:${port}/mcp`)

  return server
}

// If running directly, start the server
if (require.main === module) {
  const port = parseInt(process.env.PORT || "3000", 10)
  startServer(port)
}
