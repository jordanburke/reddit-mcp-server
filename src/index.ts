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

    this.server.onerror = (error: Error) => {
      console.error("[Error] Server error:", error);
      process.exit(1);
    };
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "test-reddit-mcp-server",
          description: "Test the Reddit MCP Server",
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (request.params.name === "test-reddit-mcp-server") {
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
