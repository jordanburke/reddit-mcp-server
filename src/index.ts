#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

class RedditServer {
  private server: Server;

  constructor() {
    console.log("[Setup] Initializing Reddit Server...");

    this.server = new Server(
      {
        name: "reddit-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error("[Error] Server error:", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
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
              }
            },
            required: ["subreddit", "post_id"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (request.params.name === "test_reddit_mcp_server") {
          return {
            content: [
              {
                type: "text",
                text: "Hello, world!",
              },
            ],
          };
        }

        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool with name ${request.params.name} not found`
        );
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error("[Error] Error calling tool:", error.message);

          throw new McpError(
            ErrorCode.InternalError,
            `Failed to fetch data: ${error.message}`
          );
        }

        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("[Server] Server is running");
  }
}

const server = new RedditServer();
server.run().catch(console.error);
