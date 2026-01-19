# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Reddit MCP (Model Context Protocol) server that provides tools for interacting with the Reddit API. It's built with TypeScript and uses FastMCP to expose Reddit functionality as tools that can be used by AI assistants.

## Available Tools

### Read-only Tools (Client Credentials Only)

- `get_reddit_post` - Get a specific Reddit post with engagement analysis
- `get_top_posts` - Get top posts from a subreddit or home feed
- `get_user_info` - Get detailed information about a Reddit user
- `get_subreddit_info` - Get subreddit details, stats, and community insights
- `get_trending_subreddits` - Get currently trending/popular subreddits
- `search_reddit` - Search for posts across Reddit with filters
- `get_post_comments` - Get comments from a specific post with threading
- `get_user_posts` - Get posts submitted by a specific user
- `get_user_comments` - Get comments made by a specific user

### Write Tools (User Credentials Required)

**IMPORTANT**: These tools require both REDDIT_USERNAME and REDDIT_PASSWORD to be configured.

- `create_post` - Create a new post in a subreddit (text or link)
- `reply_to_post` - Post a reply to an existing Reddit post or comment
- `edit_post` - Edit your own Reddit post (self-text posts only, titles cannot be edited)
- `edit_comment` - Edit your own Reddit comment
- `delete_post` - **PERMANENTLY** delete your own Reddit post (cannot be undone!)
- `delete_comment` - **PERMANENTLY** delete your own Reddit comment (cannot be undone!)

### Server Modes

The server supports two transport modes:

1. **HTTP Server (Default)**: Runs on port 3000 with `/mcp` endpoint
   - Used for Docker deployments and direct execution
   - Access via: `http://localhost:3000/mcp`
   - SSE endpoint: `http://localhost:3000/sse`

2. **Stdio Mode**: For CLI and npx usage
   - Automatically enabled when using `npx reddit-mcp-server` or the bin entry point
   - Used for integration with Claude Desktop and other MCP clients

## Development Commands

```bash
# Install dependencies
pnpm install

# Build TypeScript to JavaScript with tsup
pnpm build

# Run the MCP inspector for development/testing
pnpm inspect

# Build and run inspector in one command
pnpm dev

# Build and start the server via npx
pnpm start

# Format code with Prettier
pnpm format

# Check code formatting
pnpm format:check

# Lint code with ESLint
pnpm lint

# Fix linting issues
pnpm lint:fix
```

## Architecture

### Core Components

1. **Reddit Client** (`src/client/reddit-client.ts`): Singleton pattern implementation that handles:
   - OAuth2 authentication (client credentials and password flow)
   - Automatic token refresh via axios interceptors
   - Rate limiting and error handling
   - Both read-only and authenticated operations

2. **Tool Modules** (`src/tools/`): Modular organization by functionality:
   - `post-tools.ts`: Post creation, retrieval, and management
   - `comment-tools.ts`: Comment retrieval and threading
   - `subreddit-tools.ts`: Subreddit info, statistics, trending
   - `user-tools.ts`: User information and engagement insights
   - `search-tools.ts`: Reddit search functionality

3. **Type Definitions** (`src/types.ts`): Comprehensive TypeScript types for all Reddit entities

### Authentication Flow

The server supports three authentication modes configured via `REDDIT_AUTH_MODE`:

1. **auto (default)**: Automatically chooses the best authentication method
   - If REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are provided: Uses OAuth (60-100 req/min)
   - Otherwise: Falls back to anonymous mode (~10 req/min)
   - Gracefully degrades without failing

2. **authenticated**: Requires OAuth credentials
   - Requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET
   - Server fails to start if credentials are missing
   - Provides higher rate limits (60-100 req/min)
   - Use for production environments with guaranteed credentials

3. **anonymous**: Uses public JSON API without authentication
   - No credentials required - zero-setup experience
   - Lower rate limit (~10 req/min)
   - Perfect for testing and development
   - Read-only operations work without any Reddit app setup

**Write operations** (create_post, reply_to_post, edit_post, edit_comment, delete_post, delete_comment):

- Require REDDIT_USERNAME and REDDIT_PASSWORD in **any** mode
- Will fail gracefully with a clear error message if credentials are missing
- Token management is handled automatically by the Reddit client

## Environment Setup

Environment variables:

```bash
# Reddit API Credentials (optional unless using authenticated mode)
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=YourApp/1.0.0  # Optional, defaults to "RedditMCPServer/1.1.0"

# Reddit User Credentials (optional, for write operations)
REDDIT_USERNAME=your_username
REDDIT_PASSWORD=your_password

# Authentication Mode (optional, defaults to 'auto')
REDDIT_AUTH_MODE=auto            # Options: auto, authenticated, anonymous

# Transport Configuration
# TRANSPORT_TYPE=stdio            # Uncomment for stdio mode (default: httpStream for node, stdio for npx/bin)
PORT=3000                          # HTTP server port (default: 3000)

# OAuth Authentication (for HTTP server)
OAUTH_ENABLED=true                # Set to "true" to enable OAuth protection
OAUTH_TOKEN=your_secret_token     # Optional, will generate random token if not provided
```

### Quick Start Examples

**Try without any setup:**

```bash
export REDDIT_AUTH_MODE=anonymous
npx reddit-mcp-server
```

**With OAuth for higher rate limits:**

```bash
export REDDIT_AUTH_MODE=auto
export REDDIT_CLIENT_ID=your_client_id
export REDDIT_CLIENT_SECRET=your_client_secret
npx reddit-mcp-server
```

### Transport Modes

The server defaults to stdio mode for MCP client compatibility:

- **Running directly**: `node dist/index.js` → stdio mode (default)
- **Running via npx**: `npx reddit-mcp-server` → stdio mode
- **Running via Docker**: Set `TRANSPORT_TYPE=httpStream` for HTTP server on port 3000
- **Force HTTP mode**: Set `TRANSPORT_TYPE=httpStream` or `TRANSPORT_TYPE=http`

### OAuth Security

The HTTP server supports optional OAuth protection:

- **Disabled by default**: The server runs without authentication
- **Enable with**: `OAUTH_ENABLED=true`
- **Token options**:
  - Provide your own: `OAUTH_TOKEN=your-secure-token`
  - Auto-generate: Server creates a random 32-character token on startup
- **Usage**: Include `Authorization: Bearer <token>` header in requests to `/mcp`

Example request with OAuth:

```bash
curl -H "Authorization: Bearer your-token" http://localhost:3000/mcp
```

## Key Implementation Details

1. **Error Handling**: All tools use try-catch blocks and return MCP-compliant error responses
2. **Rate Limiting**: Built into the Reddit client to respect API limits
3. **Token Refresh**: Automatic when tokens expire via authentication checks
4. **Singleton Client**: Ensures single authenticated instance across all tools
5. **Thing IDs**: Reddit uses prefixed IDs (t3* for posts, t1* for comments). The client methods handle both prefixed and non-prefixed IDs automatically.
6. **Edit Operations**: Only self-text posts can be edited. Titles and link posts cannot be edited per Reddit API limitations.
7. **Delete Operations**: Deletions are permanent and cannot be undone. The content is removed but the post/comment ID remains.

## Testing Approach

The project uses Vitest for testing:

- **Run tests**: `pnpm test`
- **Watch mode**: `pnpm test:watch`
- **Coverage**: `pnpm test:coverage`
- **Manual testing**: Use the MCP inspector (`pnpm inspect`)
- Test both authenticated and unauthenticated flows
- Verify error handling for invalid inputs and API failures

## Common Development Tasks

1. **Adding a new Reddit tool**:
   - Add method to RedditClient class (`src/client/reddit-client.ts`)
   - Define TypeScript types in `src/types.ts` if needed
   - Create MCP tool in main server (`src/index.ts`)
   - Add tests to `src/client/__tests__/reddit-client.test.ts`
   - Update documentation (README.md and CLAUDE.md)

2. **Modifying Reddit client**:
   - Update `src/client/reddit-client.ts`
   - Ensure backward compatibility with existing tools
   - Test both auth flows if authentication logic changes
   - Add comprehensive tests for new functionality

3. **Debugging**:
   - Use `pnpm inspect` to test tools interactively
   - Check authentication flow for auth issues
   - Verify environment variables are set correctly
   - Review console.error logs for Reddit API responses
   - Test with real Reddit API using test scripts (e.g., create test post, edit, delete)
