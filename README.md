# Reddit MCP Server

A Model Context Protocol (MCP) server for interacting with Reddit - fetch posts, comments, user info, and **create content**.

[![npm version](https://img.shields.io/npm/v/reddit-mcp-server.svg)](https://www.npmjs.com/package/reddit-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/reddit-mcp-server.svg)](https://www.npmjs.com/package/reddit-mcp-server)
[![GitHub stars](https://img.shields.io/github/stars/jordanburke/reddit-mcp-server.svg?style=flat&logo=github)](https://github.com/jordanburke/reddit-mcp-server/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

<a href="https://glama.ai/mcp/servers/@jordanburke/reddit-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@jordanburke/reddit-mcp-server/badge" alt="reddit-mcp-server MCP server" />
</a>

## Reddit is closing its public API

Reddit announced on 2026-09-30 that it is ending RSS feeds and its public Data API, and moving apps to its Developer Platform ([r/redditdev post](https://www.reddit.com/r/redditdev/comments/1wubcvf/), [r/modnews post](https://www.reddit.com/r/modnews/comments/1wubgvt/)):

| Date       | What Reddit does                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| 2026-10-31 | Stops accepting new requests for public API access                                                      |
| 2026-11-13 | Stops supporting RSS feeds                                                                              |
| 2027-01-12 | Starts removing API access for apps and users that haven't registered or responded to Reddit's outreach |
| March 2027 | Closes public API access for all remaining apps and users                                               |

### What this server uses to keep working

The server reads from three sources and uses the best one you have:

| Source                                                                 | Needs                                         | Used for                                                              | Lasts until                                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Reddit's API (OAuth)                                                   | `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` | Every tool, with live data (writes also need username and password)   | March 2027, per Reddit                                                         |
| Reddit's RSS feeds                                                     | Nothing                                       | Ranked listings (hot, top, rising, controversial) without credentials | 2026-11-13                                                                     |
| [Arctic Shift](https://github.com/ArthurHeitmann/arctic_shift) archive | Nothing                                       | Most read tools without credentials                                   | No announced end. It's free, run by one volunteer, and has no uptime guarantee |

Arctic Shift is a third-party copy of Reddit, not Reddit's API. Its scores and comment counts lag, and every result from it says so. See [Keyless Mode](#keyless-mode) for what each tool can do without credentials.

### What it means for you

- **You have OAuth credentials:** every read tool works. Write tools also need `REDDIT_USERNAME` and `REDDIT_PASSWORD`. Register your app at [developers.reddit.com/app-registration](https://developers.reddit.com/app-registration) before 2027-01-12, or Reddit may remove its access early.
- **You don't have credentials:** most read tools work with no setup. Reddit no longer accepts new API access requests, so new users run in keyless mode.
- **After 2026-11-13:** without credentials, ranked listings fall back to the archive's newest posts, because RSS is gone.
- **After March 2027:** Reddit's plan ends the OAuth path, so the write tools and the OAuth-only reads stop working. Keyless reads keep working as long as Arctic Shift runs. Arctic Shift doesn't document where it gets its data, so Reddit's changes may affect it too.

## Features at a Glance

| Feature                         | reddit-mcp-server  | Other Reddit MCPs  |
| ------------------------------- | :----------------: | :----------------: |
| **Create Posts**                | :white_check_mark: |        :x:         |
| **Reply to Posts/Comments**     | :white_check_mark: |        :x:         |
| **Edit Posts/Comments**         | :white_check_mark: |        :x:         |
| **Delete Posts/Comments**       | :white_check_mark: |        :x:         |
| **Spam Protection (Safe Mode)** | :white_check_mark: |        :x:         |
| **Bot Disclosure Footer**       | :white_check_mark: |        :x:         |
| **Policy Compliance Built-in**  | :white_check_mark: |        :x:         |
| Browse Subreddits               | :white_check_mark: | :white_check_mark: |
| Search Reddit                   | :white_check_mark: | :white_check_mark: |
| User Analysis                   | :white_check_mark: | :white_check_mark: |
| Post Comments                   | :white_check_mark: | :white_check_mark: |
| OAuth Auth (60-100 rpm)         | :white_check_mark: | :white_check_mark: |
| **Keyless mode (zero-setup)**   | :white_check_mark: |        :x:         |

## Quick Start

### Option 1: Claude Desktop Extension (Easiest)

Download and open the extension file - Claude Desktop will install it automatically:

**[Download reddit-mcp-server.mcpb](https://github.com/jordanburke/reddit-mcp-server/releases/latest/download/reddit-mcp-server.mcpb)**

### Option 2: NPX (No install required)

Add to your MCP config (Claude Desktop, Cursor, etc.). Credentials are optional: without them the server runs in [keyless mode](#keyless-mode), and with them you get live data and every tool.

```json
{
  "mcpServers": {
    "reddit": {
      "command": "npx",
      "args": ["reddit-mcp-server"],
      "env": {
        "REDDIT_CLIENT_ID": "your_client_id",
        "REDDIT_CLIENT_SECRET": "your_client_secret"
      }
    }
  }
}
```

### Option 3: Claude Code

```bash
REDDIT_CLIENT_ID=your_client_id REDDIT_CLIENT_SECRET=your_client_secret \
  claude mcp add --transport stdio reddit -- npx reddit-mcp-server
```

Leave out the two variables to run keyless.

## Features

### Read-only Tools

| Tool                      | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `get_reddit_post`         | Get a specific Reddit post with engagement analysis                         |
| `get_top_posts`           | Get top posts from a subreddit or home feed                                 |
| `browse_subreddit`        | Browse a subreddit/home feed by sort (hot, new, top, rising, controversial) |
| `get_user_info`           | Get detailed information about a Reddit user                                |
| `get_user_posts`          | Get posts submitted by a specific user                                      |
| `get_user_comments`       | Get comments made by a specific user                                        |
| `get_subreddit_info`      | Get subreddit details and statistics                                        |
| `get_trending_subreddits` | Get currently trending subreddits                                           |
| `get_post_comments`       | Get comments from a specific post with threading                            |
| `search_reddit`           | Search for posts across Reddit                                              |

### Write Tools (Require User Credentials)

| Tool             | Description                                    |
| ---------------- | ---------------------------------------------- |
| `create_post`    | Create a new post in a subreddit               |
| `reply_to_post`  | Post a reply to an existing post or comment    |
| `edit_post`      | Edit your own Reddit post (self-text only)     |
| `edit_comment`   | Edit your own Reddit comment                   |
| `save_content`   | Save a post or comment to your account         |
| `unsave_content` | Remove a post or comment from your saved items |
| `delete_post`    | Permanently delete your own post               |
| `delete_comment` | Permanently delete your own comment            |

## Configuration

### Environment Variables

| Variable                | Required | Default        | Description                                                           |
| ----------------------- | -------- | -------------- | --------------------------------------------------------------------- |
| `REDDIT_CLIENT_ID`      | Yes      | -              | Reddit app client ID (OAuth required since mid-2026)                  |
| `REDDIT_CLIENT_SECRET`  | Yes      | -              | Reddit app client secret                                              |
| `REDDIT_USERNAME`       | No       | -              | Reddit username (for write operations)                                |
| `REDDIT_PASSWORD`       | No       | -              | Reddit password (for write operations)                                |
| `REDDIT_USER_AGENT`     | No       | Auto-generated | Custom User-Agent string                                              |
| `REDDIT_AUTH_MODE`      | No       | `auto`         | Authentication mode: `auto`, `authenticated` (`anonymous` deprecated) |
| `REDDIT_SAFE_MODE`      | No       | `standard`     | Write safeguards: `off`, `standard`, `strict`                         |
| `REDDIT_BOT_DISCLOSURE` | No       | `off`          | Bot disclosure footer: `auto`, `off`                                  |
| `REDDIT_BOT_FOOTER`     | No       | Built-in       | Custom bot footer text (when disclosure is `auto`)                    |
| `REDDIT_CACHE`          | No       | `on`           | In-memory caching of read requests: `on`, `off`                       |
| `REDDIT_CACHE_MAX_MB`   | No       | `50`           | Cache size cap in MB (LRU eviction beyond this)                       |
| `REDDIT_MAX_RETRIES`    | No       | `3`            | Retries on HTTP 429 with Retry-After backoff (`0` to disable)         |

Reddit closed self-service app creation in November 2025. See [Authentication](#authentication) for how to get credentials.

### Full MCP Config Example

```json
{
  "mcpServers": {
    "reddit": {
      "command": "npx",
      "args": ["reddit-mcp-server"],
      "env": {
        "REDDIT_CLIENT_ID": "your_client_id",
        "REDDIT_CLIENT_SECRET": "your_client_secret",
        "REDDIT_USERNAME": "your_username",
        "REDDIT_PASSWORD": "your_password",
        "REDDIT_SAFE_MODE": "standard"
      }
    }
  }
}
```

## Safe Mode (Spam Protection)

Protect your Reddit account from spam detection and bans with built-in safeguards. **Enabled by default** (`standard` mode) per Reddit's Responsible Builder Policy.

### Why Use Safe Mode?

Reddit's spam detection can flag accounts for:

- Rapid posting or commenting
- Duplicate or similar content
- Posting the same content across multiple subreddits
- Non-standard User-Agent strings

Safe Mode helps prevent these issues automatically.

### Mode Options

| Mode       | Write Delay | Duplicate Detection       | Use Case                       |
| ---------- | ----------- | ------------------------- | ------------------------------ |
| `off`      | None        | No                        | Explicit opt-out only          |
| `standard` | 2 seconds   | Last 10 items + cross-sub | **Default**, recommended       |
| `strict`   | 5 seconds   | Last 20 items + cross-sub | For cautious automated posting |

### Disable Safe Mode

Safe mode is enabled by default. To explicitly disable:

```bash
export REDDIT_SAFE_MODE=off
npx reddit-mcp-server
```

### What Safe Mode Does

1. **Rate Limiting**: Enforces minimum delays between write operations
2. **Duplicate Detection**: Blocks identical content from being posted twice
3. **Cross-Subreddit Detection**: Prevents posting the same content to multiple subreddits (per Reddit policy)
4. **Smart User-Agent**: Auto-generates Reddit-compliant User-Agent format when username is provided

## Bot Disclosure

Reddit's Responsible Builder Policy requires bots to disclose their automated nature. Enable automatic bot footers on all posted content:

```bash
export REDDIT_BOT_DISCLOSURE=auto
npx reddit-mcp-server
```

When enabled, a footer is appended to all posts, replies, and edits:

```
---
🤖 I am a bot | Built with reddit-mcp-server
```

Customize the footer with `REDDIT_BOT_FOOTER`:

```bash
export REDDIT_BOT_DISCLOSURE=auto
export REDDIT_BOT_FOOTER=$'\n\n---\n^(🤖 Custom bot footer text)'
```

## Authentication

### ⚠️ Reddit API Changes (2026)

**Anonymous mode no longer works.** As of mid-2026, Reddit blocks all unauthenticated API requests with HTTP 403. OAuth credentials are now required for any API access.

**Reddit is closing its public API.** See [Reddit is closing its public API](#reddit-is-closing-its-public-api) for the dates and what this server does about them.

Reddit closed self-service OAuth app creation in November 2025, and as of 2026-10-31 it accepts no new requests for public API access. Existing OAuth credentials keep working until Reddit closes public API access in March 2027.

### Getting Credentials

**If you already have a Reddit app** (created at `/prefs/apps` before November 2025, or approved through Reddit's Developer Support): use your existing client ID and secret. They still work at 60-100 req/min. Register the app at [developers.reddit.com/app-registration](https://developers.reddit.com/app-registration) before 2027-01-12.

**If you don't have credentials**: Reddit no longer accepts new requests for public API access, so use [keyless mode](#keyless-mode).

### Mode Comparison

| Mode              | Rate Limit     | Setup Required    | Tools Available                                 | Best For      |
| ----------------- | -------------- | ----------------- | ----------------------------------------------- | ------------- |
| `auto` (default)  | 60-100 req/min | OAuth credentials | All tools                                       | Most users    |
| `authenticated`   | 60-100 req/min | OAuth credentials | All tools                                       | Explicit mode |
| `auto` (no creds) | Shared, free   | None              | Most read tools ([Keyless Mode](#keyless-mode)) | Quick testing |
| `anonymous`       | Shared, free   | None              | Same as `auto` without credentials              | Legacy alias  |

### Keyless Mode

Without OAuth credentials, reads come from two free sources:

- **Reddit's RSS feeds** for ranked listings (`hot`, `top`, `rising`, `controversial`, and the home feed). Reddit retires RSS on 2026-11-13. When a feed fails for a named subreddit, the server falls back to the archive's newest posts and says ranking is unavailable.
- **The [Arctic Shift](https://github.com/ArthurHeitmann/arctic_shift) archive**, a free third-party copy of Reddit run by one volunteer. It is not Reddit's API and has no uptime guarantee.

| Tool                                        | Keyless source         | Limits                                                                  |
| ------------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `browse_subreddit` (new)                    | Arctic Shift           | One subreddit; no multireddits                                          |
| `browse_subreddit` (other), `get_top_posts` | RSS, then Arctic Shift | Archive fallback is newest-first, not ranked                            |
| `get_reddit_post`                           | Arctic Shift           |                                                                         |
| `get_post_comments`                         | Arctic Shift           | Recent comments may be missing; no sort                                 |
| `get_more_comments`                         | Arctic Shift           |                                                                         |
| `get_user_info`                             | Arctic Shift           | Account age estimated from first activity; status flags unknown         |
| `get_user_posts`, `get_user_comments`       | Arctic Shift           | Newest first only                                                       |
| `get_subreddit_info`, `get_subreddit_rules` | Arctic Shift           |                                                                         |
| `search_reddit`                             | Arctic Shift           | Posts need `subreddit`; `type=sr` matches name prefixes; no `type=user` |

**Archive caveats:** scores and comment counts lag, and are often 0 or 1 on recent posts. Keyword search on large subreddits is slow, and the archive throttles it. The server waits up to 10 seconds and retries once. If that fails too, the error says when to retry. Every archive result ends with a note naming the source.

**Still needs OAuth:** `get_trending_subreddits`, `get_post_flairs`, `get_me`, `get_my_overview`, `get_my_saved`, and all write tools.

### Read-Only Access (OAuth)

```json
{
  "env": {
    "REDDIT_CLIENT_ID": "your_client_id",
    "REDDIT_CLIENT_SECRET": "your_client_secret"
  }
}
```

### Write Operations (OAuth + User Credentials)

To create posts, reply, edit, or delete content, add your Reddit username and password:

```json
{
  "env": {
    "REDDIT_CLIENT_ID": "your_client_id",
    "REDDIT_CLIENT_SECRET": "your_client_secret",
    "REDDIT_USERNAME": "your_username",
    "REDDIT_PASSWORD": "your_password",
    "REDDIT_SAFE_MODE": "standard"
  }
}
```

## Development

### Commands

```bash
pnpm install        # Install dependencies
pnpm build          # Build TypeScript
pnpm dev            # Build and run MCP inspector
pnpm test           # Run tests
pnpm lint           # Lint code
pnpm format         # Format code
```

### CLI Options

```bash
npx reddit-mcp-server --version         # Show version
npx reddit-mcp-server --help            # Show help
npx reddit-mcp-server --generate-token  # Generate OAuth token for HTTP mode
```

## HTTP Server Mode

For Docker deployments or web-based clients, use HTTP transport:

```bash
TRANSPORT_TYPE=httpStream PORT=3000 node dist/index.js
```

### With OAuth Protection

```bash
export OAUTH_ENABLED=true
export OAUTH_TOKEN=$(npx reddit-mcp-server --generate-token | tail -1)
TRANSPORT_TYPE=httpStream node dist/index.js
```

Make authenticated requests:

```bash
curl -H "Authorization: Bearer $OAUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"method":"tools/list","params":{}}' \
     http://localhost:3000/mcp
```

## Docker

### Quick Start

```bash
# Pull and run
docker pull ghcr.io/jordanburke/reddit-mcp-server:latest

docker run -d \
  --name reddit-mcp \
  -p 3000:3000 \
  -e REDDIT_CLIENT_ID=your_client_id \
  -e REDDIT_CLIENT_SECRET=your_client_secret \
  -e REDDIT_SAFE_MODE=standard \
  ghcr.io/jordanburke/reddit-mcp-server:latest
```

### Docker Compose

```yaml
services:
  reddit-mcp:
    image: ghcr.io/jordanburke/reddit-mcp-server:latest
    ports:
      - "3000:3000"
    environment:
      - REDDIT_CLIENT_ID=${REDDIT_CLIENT_ID}
      - REDDIT_CLIENT_SECRET=${REDDIT_CLIENT_SECRET}
      - REDDIT_USERNAME=${REDDIT_USERNAME}
      - REDDIT_PASSWORD=${REDDIT_PASSWORD}
      - REDDIT_SAFE_MODE=standard
      - OAUTH_ENABLED=${OAUTH_ENABLED:-false}
      - OAUTH_TOKEN=${OAUTH_TOKEN}
    restart: unless-stopped
```

### Build Locally

```bash
docker build -t reddit-mcp-server .
docker run -d --name reddit-mcp -p 3000:3000 --env-file .env reddit-mcp-server
```

## Reddit Responsible Builder Policy

This server is designed with [Reddit's Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) in mind:

- **Safe mode on by default** — rate limiting and duplicate detection prevent spam
- **Cross-subreddit duplicate detection** — blocks identical content across subreddits
- **Bot disclosure support** — optional automated footer for transparency
- **No voting/karma manipulation** — upvote/downvote tools are intentionally excluded
- **No private messaging** — DM tools are intentionally excluded
- **Policy-aware AI instructions** — MCP server instructions remind AI assistants of data usage restrictions

## Credits

- Fork of [reddit-mcp-server](https://github.com/alexandros-lekkas/reddit-mcp-server) by Alexandros Lekkas
- Inspired by [Python Reddit MCP Server](https://github.com/Arindam200/reddit-mcp) by Arindam200
