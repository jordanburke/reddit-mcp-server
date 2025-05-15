# Reddit MCP Server ⚙️

A Model Context Protocol (MCP) that provides tools for fetching and creating Reddit content.

![image](https://github.com/user-attachments/assets/705c63ef-5d3c-4a68-8d3b-18dfda0a29f2)

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

1. `git clone https://github.com/alexandros-lekkas/reddit-mcp-server`

2. Create a Reddit app [here](https://www.reddit.com/prefs/apps)

![image](https://github.com/user-attachments/assets/bb7582d6-abf2-4282-a102-bd2e0f2c1c41)

Make sure to select "script"!

3. Copy the client ID and client secret

4. Create a `.env` file based on `.env.example`

Do this with your `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`

If you want to write posts you need to include your `REDDIT_USERNAME` and `REDDIT_PASSWORD` (don't worry, I won't steal them 😜)

5. Run with `npm run dev` and open the inspection server (http://127.0.0.1:6274/)

![image](https://github.com/user-attachments/assets/705c63ef-5d3c-4a68-8d3b-18dfda0a29f2)

6. If the connection works, add this to your MCP config (for Cursor or Claude, depending on which agent you are using)

```json
  "mcpServers": {
    "reddit": {
      "command": "node",
      "args": [
        "C:\\path\\to\\reddit-mcp-server\\build\\index.js" // Replace this with your local path to build/index.js
      ],
      "env": {
        "REDDIT_CLIENT_ID": "😜",
        "REDDIT_CLIENT_SECRET": "😜",
        "REDDIT_USERNAME": "😜",
        "REDDIT_PASSWORD": "😜"
      }
    }
  }
```

(Make sure to replace the environmental variables with your actual keys, not the 😜 emoji)

## 📚 Credits

- Credit goes to the [Python Reddit MCP Server](https://github.com/Arindam200/reddit-mcp) by Arindam200 for the inspiration and implementation of these tools. This repository is, at the moment, simply a Node.js port of the Python implementation.

- Credit goes to [Eugene Sh](https://medium.com/@eugenesh4work/how-to-build-an-mcp-server-fast-a-step-by-step-tutorial-e09faa5f7e3b) for the tutorial on how to build an MCP server (which was used as a reference for this implementation).
