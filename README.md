# Reddit MCP Server ⚙️

A Model Context Protocol (MCP) that provides tools for fetching and creating Reddit content.

> **Note**: This is a fork of the original [reddit-mcp-server](https://github.com/alexandros-lekkas/reddit-mcp-server) by Alexandros Lekkas, updated with pnpm, tsup build system, and npx execution support.

https://github.com/user-attachments/assets/caa37704-7c92-4bf8-b7e8-56d02ccb4983

## 🔧 Available Tools (Features)

**Read-only Tools (Client Credentials):**

- `get_reddit_post(subreddit, post_id)` - Get a specific Reddit post
- `get_top_posts(subreddit, time_filter, limit)` - Get top posts from a subreddit
- `get_user_info(username)` - Get information about a Reddit user
- `get_subreddit_info(subreddit_name)` - Get information about a subreddit
- `get_trending_subreddits()` - Get currently trending subreddits
- `search_reddit(query, subreddit?, sort?, time_filter?, limit?, type?)` - Search for posts on Reddit
- `get_post_comments(post_id, subreddit, sort?, limit?)` - Get comments for a specific Reddit post
- `get_user_posts(username, sort?, time_filter?, limit?)` - Get posts submitted by a specific user
- `get_user_comments(username, sort?, time_filter?, limit?)` - Get comments made by a specific user

**Write Tools (User Credentials Required):**

- `create_post(subreddit, title, content, is_self)` - Create a new post in a subreddit
- `reply_to_post(post_id, content, subreddit?)` - Post a reply to an existing Reddit post

## 🔌 Installation

### Installing via Smithery

To install Reddit Content Integration Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@alexandros-lekkas/reddit-mcp-server):

```bash
npx -y @smithery/cli install reddit-mcp-server --client claude
```

### Manual Installation
1. `git clone https://github.com/jordanburke/reddit-mcp-server`

2. Create a Reddit app [here](https://www.reddit.com/prefs/apps)

![image](https://github.com/user-attachments/assets/bb7582d6-abf2-4282-a102-bd2e0f2c1c41)

Make sure to select "script"!

3. Copy the client ID and client secret

4. Create a `.env` file based on `.env.example`

Do this with your `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`

If you want to write posts you need to include your `REDDIT_USERNAME` and `REDDIT_PASSWORD` (don't worry, I won't steal them 😜)

5. Install dependencies with `pnpm install`

6. Build the project with `pnpm build`

7. Run with `pnpm dev` and open the inspection server (http://127.0.0.1:6274/)

![image](https://github.com/user-attachments/assets/705c63ef-5d3c-4a68-8d3b-18dfda0a29f2)

8. If the connection works, add this to your MCP config (for Cursor or Claude Desktop)

```json
  "mcpServers": {
    "reddit": {
      "command": "npx",
      "args": [
        "reddit-mcp-server"
      ],
      "env": {
        "REDDIT_CLIENT_ID": "<YOUR_CLIENT_ID>",
        "REDDIT_CLIENT_SECRET": "<YOUR_CLIENT_SECRET>",
        "REDDIT_USERNAME": "<YOUR_USERNAME_OPTIONAL>",
        "REDDIT_PASSWORD": "<YOUR_PASSWORD_OPTIONAL>"
      },
      "autoApprove": [
        "get_reddit_post",
        "get_top_posts",
        "get_user_info",
        "get_subreddit_info",
        "get_trending_subreddits",
        "search_reddit",
        "get_post_comments",
        "get_user_posts",
        "get_user_comments",
        "create_post",
        "reply_to_post"
      ] // You don't need to add this, but it makes it so that you don't have to keep clicking approve
    }
  }
```

(Make sure to replace the environmental variables with your actual keys, not the 😜 emoji)

## 🛠️ Development

### Commands

```bash
# Install dependencies
pnpm install

# Build TypeScript to JavaScript
pnpm build

# Run the MCP inspector for development/testing
pnpm inspect

# Build and run inspector in one command
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format
```

### Version & Help

```bash
# Check version
npx reddit-mcp-server --version

# Show help
npx reddit-mcp-server --help
```

## 📚 Credits

- This is a fork of the original [reddit-mcp-server](https://github.com/alexandros-lekkas/reddit-mcp-server) by Alexandros Lekkas.

- Credit goes to the [Python Reddit MCP Server](https://github.com/Arindam200/reddit-mcp) by Arindam200 for the inspiration and implementation of these tools.
