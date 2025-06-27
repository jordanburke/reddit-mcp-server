import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js"
import { initializeRedditClient } from "./client/reddit-client"
import * as tools from "./tools"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

class RedditServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: "reddit-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    )

    // Initialize the Reddit client
    this.initializeRedditClient()

    this.setupToolHandlers()

    this.server.onerror = async (error) => {
      await this.server.sendLoggingMessage({
        level: "error",
        logger: "reddit-server",
        data: `Server error: ${error}`,
      })
    }

    process.on("SIGINT", async () => {
      await this.server.close()
      process.exit(0)
    })
  }

  private initializeRedditClient() {
    const clientId = process.env.REDDIT_CLIENT_ID
    const clientSecret = process.env.REDDIT_CLIENT_SECRET
    const userAgent = process.env.REDDIT_USER_AGENT || "RedditMCPServer/0.1.0"
    const username = process.env.REDDIT_USERNAME
    const password = process.env.REDDIT_PASSWORD

    if (!clientId || !clientSecret) {
      // Can't use server logging here as server isn't initialized yet
      // Exit silently with error code
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

      // Client initialized successfully
    } catch {
      // Can't use server logging here as server isn't connected yet
      // Exit silently with error code
      process.exit(1)
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "test_reddit_mcp_server",
          description: "Test the Reddit MCP Server",
          inputSchema: {
            type: "object",
            properties: {
              // No input parameters, this will just return a test message
            },
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
      ],
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const toolName = request.params.name
        const toolParams = request.params.arguments || {}

        // Log tool call
        await this.server.sendLoggingMessage({
          level: "debug",
          logger: "reddit-server",
          data: `Tool call: ${toolName}`,
        })

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

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Tool with name ${toolName} not found`)
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          await this.server.sendLoggingMessage({
            level: "error",
            logger: "reddit-server",
            data: `Error calling tool: ${error.message}`,
          })

          throw new McpError(ErrorCode.InternalError, `Failed to fetch data: ${error.message}`)
        }

        throw error
      }
    })
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)

    // Log server startup
    await this.server.sendLoggingMessage({
      level: "info",
      logger: "reddit-server",
      data: "Reddit MCP Server is running",
    })

    // Log authentication status
    const username = process.env.REDDIT_USERNAME
    const password = process.env.REDDIT_PASSWORD
    await this.server.sendLoggingMessage({
      level: "info",
      logger: "reddit-server",
      data:
        username && password
          ? `Authenticated as user: ${username}`
          : "Running in read-only mode (no user authentication)",
    })
  }
}

// Only run if this is the main module
if (require.main === module) {
  const server = new RedditServer()
  server.run().catch(() => {
    // Exit silently on error
    process.exit(1)
  })
}

export { RedditServer }
