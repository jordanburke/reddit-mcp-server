# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Reddit MCP (Model Context Protocol) server that provides tools for interacting with the Reddit API. It's built with TypeScript and uses the MCP SDK to expose Reddit functionality as tools that can be used by AI assistants.

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
   - `post-tools.ts`: Post creation, replying to posts/comments
   - `subreddit-tools.ts`: Subreddit info, statistics, trending
   - `user-tools.ts`: User information and engagement insights

3. **Type Definitions** (`src/types.ts`): Comprehensive TypeScript types for all Reddit entities

### Authentication Flow

- **Read-only operations**: Only require client credentials (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET)
- **Write operations**: Additionally require user credentials (REDDIT_USERNAME, REDDIT_PASSWORD)
- Token management is handled automatically by the Reddit client

## Environment Setup

Required environment variables:
```bash
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=YourApp/1.0.0  # Optional, defaults to "RedditMCPServer/0.1.0"
REDDIT_USERNAME=your_username     # Optional, for write operations
REDDIT_PASSWORD=your_password     # Optional, for write operations
```

## Key Implementation Details

1. **Error Handling**: All tools use try-catch blocks and return MCP-compliant error responses
2. **Rate Limiting**: Built into the Reddit client to respect API limits
3. **Token Refresh**: Automatic via axios interceptors when tokens expire
4. **Singleton Client**: Ensures single authenticated instance across all tools

## Testing Approach

Currently no test framework is configured. When implementing tests:
- Use the MCP inspector (`pnpm inspect`) for manual testing
- Test both authenticated and unauthenticated flows
- Verify error handling for invalid inputs and API failures

## Common Development Tasks

1. **Adding a new Reddit tool**:
   - Create new function in appropriate tool file (`src/tools/`)
   - Define TypeScript types in `src/types.ts` if needed
   - Export from `src/tools/index.ts`
   - Register in main server (`src/index.ts`)

2. **Modifying Reddit client**:
   - Update `src/client/reddit-client.ts`
   - Ensure backward compatibility with existing tools
   - Test both auth flows if authentication logic changes

3. **Debugging**:
   - Use `pnpm inspect` to test tools interactively
   - Check axios interceptors for auth issues
   - Verify environment variables are set correctly