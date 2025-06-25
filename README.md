# Reddit MCP Server ⚙️

A Model Context Protocol (MCP) that provides tools for fetching and creating Reddit content.

> **Note**: This is a fork of the original [reddit-mcp-server](https://github.com/alexandros-lekkas/reddit-mcp-server) by Alexandros Lekkas, updated with pnpm, tsup build system, and npx execution support.

[![smithery badge](https://smithery.ai/badge/@jordanburke/reddit-mcp-server)](https://smithery.ai/server/@jordanburke/reddit-mcp-server)

https://github.com/user-attachments/assets/caa37704-7c92-4bf8-b7e8-56d02ccb4983

## 🧑‍💻 About

https://www.linkedin.com/feed/update/urn:li:activity:7328864060534419457/

![image](https://github.com/user-attachments/assets/aedc0966-75d4-45c4-a384-df03d232e29d)

## 🔧 Available Tools (Features)

**Read-only Tools (Client Credentials):**

- `get_user_info(username)` - Get detailed user analysis with engagement insights
- `get_top_posts(subreddit, time_filter, limit)` - Get and analyze top posts
- `get_subreddit_stats(subreddit)` - Get comprehensive subreddit analysis
- `get_trending_subreddits()` - Get list of trending subreddits

**Read-write Tools (User Credentials):**

- `create_post(subreddit, title, content, flair, is_self)` - Create an optimized post
- `reply_to_post(post_id, content, subreddit)` - Add a reply with engagement insights
- `reply_to_comment(comment_id, content, subreddit)` - Add a strategic reply

## 🔌 Installation

### Installing via Smithery

To install Reddit Content Integration Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@alexandros-lekkas/reddit-mcp-server):

```bash
npx -y @smithery/cli install @jordanburke/reddit-mcp-server --client claude
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

6. Run with `pnpm dev` and open the inspection server (http://127.0.0.1:6274/)

![image](https://github.com/user-attachments/assets/705c63ef-5d3c-4a68-8d3b-18dfda0a29f2)

7. If the connection works, add this to your MCP config (for Cursor or Claude, depending on which agent you are using)

```json
  "mcpServers": {
    "reddit": {
      "command": "npx",
      "args": [
        "reddit-mcp-server"
      ],
      "env": {
        "REDDIT_CLIENT_ID": "😜",
        "REDDIT_CLIENT_SECRET": "😜",
        "REDDIT_USERNAME": "😜",
        "REDDIT_PASSWORD": "😜"
      },
      "autoApprove": [
        "get_reddit_post",
        "get_top_posts",
        "get_user_info",
        "get_subreddit_info",
        "get_trending_subreddits",
        "create_post",
        "reply_to_post"
      ] // You don't need to add this, but it makes it so that you don't have to keep clicking approve
    }
  }
```

(Make sure to replace the environmental variables with your actual keys, not the 😜 emoji)

## 📚 Credits

- This is a fork of the original [reddit-mcp-server](https://github.com/alexandros-lekkas/reddit-mcp-server) by Alexandros Lekkas.

- Credit goes to the [Python Reddit MCP Server](https://github.com/Arindam200/reddit-mcp) by Arindam200 for the inspiration and implementation of these tools. This repository is, at the moment, simply a Node.js port of the Python implementation.

- Credit goes to [Eugene Sh](https://medium.com/@eugenesh4work/how-to-build-an-mcp-server-fast-a-step-by-step-tutorial-e09faa5f7e3b) for the tutorial on how to build an MCP server (which was used as a reference for this implementation).
