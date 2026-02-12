# Reddit MCP Server

A Model Context Protocol (MCP) server for interacting with Reddit - fetch posts, comments, user info, and **create content**.

[![npm version](https://img.shields.io/npm/v/reddit-mcp-server.svg)](https://www.npmjs.com/package/reddit-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/reddit-mcp-server.svg)](https://www.npmjs.com/package/reddit-mcp-server)
[![GitHub stars](https://img.shields.io/github/stars/jordanburke/reddit-mcp-server.svg?style=flat&logo=github)](https://github.com/jordanburke/reddit-mcp-server/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

<a href="https://glama.ai/mcp/servers/@jordanburke/reddit-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@jordanburke/reddit-mcp-server/badge" alt="reddit-mcp-server MCP server" />
</a>

## Features at a Glance

| Feature                         | reddit-mcp-server  | Other Reddit MCPs  |
| ------------------------------- | :----------------: | :----------------: |
| **Create Posts**                | :white_check_mark: |        :x:         |
| **Reply to Posts/Comments**     | :white_check_mark: |        :x:         |
| **Edit Posts/Comments**         | :white_check_mark: |        :x:         |
| **Delete Posts/Comments**       | :white_check_mark: |        :x:         |
| **Spam Protection (Safe Mode)** | :white_check_mark: |        :x:         |
| Browse Subreddits               | :white_check_mark: | :white_check_mark: |
| Search Reddit                   | :white_check_mark: | :white_check_mark: |
| User Analysis                   | :white_check_mark: | :white_check_mark: |
| Post Comments                   | :white_check_mark: | :white_check_mark: |
| Zero-Setup Anonymous Mode       | :white_check_mark: | :white_check_mark: |
| Three-Tier Auth (10/60/100 rpm) | :white_check_mark: | :white_check_mark: |

## Quick Start

### Option 1: Claude Desktop Extension (Easiest)

Download and open the extension file - Claude Desktop will install it automatically:

**[Download reddit-mcp-server.mcpb](https://github.com/jordanburke/reddit-mcp-server/releases/latest/download/reddit-mcp-server.mcpb)**

### Option 2: NPX (No install required)

```bash
npx reddit-mcp-server
```

Or add to your MCP config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "reddit": {
      "command": "npx",
      "args": ["reddit-mcp-server"]
    }
  }
}
```

### Option 3: Claude Code

```bash
claude mcp add --transport stdio reddit -- npx reddit-mcp-server
```

## Features

### Read-only Tools

| Tool                      | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `get_reddit_post`         | Get a specific Reddit post with engagement analysis |
| `get_top_posts`           | Get top posts from a subreddit or home feed         |
| `get_user_info`           | Get detailed information about a Reddit user        |
| `get_user_posts`          | Get posts submitted by a specific user              |
| `get_user_comments`       | Get comments made by a specific user                |
| `get_subreddit_info`      | Get subreddit details and statistics                |
| `get_trending_subreddits` | Get currently trending subreddits                   |
| `get_post_comments`       | Get comments from a specific post with threading    |
| `search_reddit`           | Search for posts across Reddit                      |

### Write Tools (Require User Credentials)

| Tool             | Description                                 |
| ---------------- | ------------------------------------------- |
| `create_post`    | Create a new post in a subreddit            |
| `reply_to_post`  | Post a reply to an existing post or comment |
| `edit_post`      | Edit your own Reddit post (self-text only)  |
| `edit_comment`   | Edit your own Reddit comment                |
| `delete_post`    | Permanently delete your own post            |
| `delete_comment` | Permanently delete your own comment         |
| `vote_post`      | Vote on a post/comment (upvote/downvote)    |

## Configuration

### Environment Variables

| Variable               | Required | Default        | Description                                               |
| ---------------------- | -------- | -------------- | --------------------------------------------------------- |
| `REDDIT_CLIENT_ID`     | No\*     | -              | Reddit app client ID                                      |
| `REDDIT_CLIENT_SECRET` | No\*     | -              | Reddit app client secret                                  |
| `REDDIT_USERNAME`      | No       | -              | Reddit username (for write operations)                    |
| `REDDIT_PASSWORD`      | No       | -              | Reddit password (for write operations)                    |
| `REDDIT_USER_AGENT`    | No       | Auto-generated | Custom User-Agent string                                  |
| `REDDIT_AUTH_MODE`     | No       | `auto`         | Authentication mode: `auto`, `authenticated`, `anonymous` |
| `REDDIT_SAFE_MODE`     | No       | `off`          | Write safeguards: `off`, `standard`, `strict`             |

\*Required only if using `authenticated` mode.

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

**New!** Protect your Reddit account from spam detection and bans with built-in safeguards.

### Why Use Safe Mode?

Reddit's spam detection can flag accounts for:

- Rapid posting or commenting
- Duplicate or similar content
- Non-standard User-Agent strings

Safe Mode helps prevent these issues automatically.

### Mode Options

| Mode       | Write Delay | Duplicate Detection | Use Case                       |
| ---------- | ----------- | ------------------- | ------------------------------ |
| `off`      | None        | No                  | Default, no safeguards         |
| `standard` | 2 seconds   | Last 10 items       | Recommended for normal use     |
| `strict`   | 5 seconds   | Last 20 items       | For cautious automated posting |

### Enable Safe Mode

```bash
export REDDIT_SAFE_MODE=standard
npx reddit-mcp-server
```

Or in your MCP config:

```json
{
  "env": {
    "REDDIT_SAFE_MODE": "standard"
  }
}
```

### What Safe Mode Does

1. **Rate Limiting**: Enforces minimum delays between write operations
2. **Duplicate Detection**: Blocks identical content from being posted twice
3. **Smart User-Agent**: Auto-generates Reddit-compliant User-Agent format when username is provided

## Authentication Modes

### Mode Comparison

| Mode             | Rate Limit     | Setup Required | Best For                 |
| ---------------- | -------------- | -------------- | ------------------------ |
| `anonymous`      | ~10 req/min    | None           | Quick testing, read-only |
| `auto` (default) | 10-100 req/min | Optional       | Flexible usage           |
| `authenticated`  | 60-100 req/min | Required       | Production use           |

### Anonymous Mode (Zero Setup)

```json
{
  "env": {
    "REDDIT_AUTH_MODE": "anonymous"
  }
}
```

### Authenticated Mode (Higher Rate Limits)

1. Create a Reddit app at https://www.reddit.com/prefs/apps (select "script" type)
2. Copy the client ID and secret
3. Configure:

```json
{
  "env": {
    "REDDIT_AUTH_MODE": "authenticated",
    "REDDIT_CLIENT_ID": "your_client_id",
    "REDDIT_CLIENT_SECRET": "your_client_secret"
  }
}
```

### Write Operations

To create posts, reply, edit, or delete content, you need user credentials:

```json
{
  "env": {
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

## Credits

- Fork of [reddit-mcp-server](https://github.com/alexandros-lekkas/reddit-mcp-server) by Alexandros Lekkas
- Inspired by [Python Reddit MCP Server](https://github.com/Arindam200/reddit-mcp) by Arindam200

## Credential Provider Security Model (v1.3+)

This server now supports a credential-provider flow:

- `git-credential` (default, recommended)
- `pass-cli`
- `env` (legacy/backward-compatible, less secure)

### Security rationale

Environment variables are easy but high-exposure in multi-process environments. Secure providers avoid long-lived secret env injection and resolve secrets at runtime.

### Migration notes

1. Keep existing `REDDIT_CLIENT_SECRET` / `REDDIT_PASSWORD` setup by setting `REDDIT_CREDENTIAL_PROVIDER=env`.
2. Move to `git-credential` (default) or `pass-cli` for production.
3. Provide username via `--username` (preferred) or explicit config from plugin (`reddit.username`).
4. In secure provider modes, username is not taken from env by default.

### Production configuration examples

#### git-credential (default)

```bash
reddit-mcp-server \
  --credential-provider git-credential \
  --username your_reddit_username \
  --client-id your_client_id
```

Store credentials in git credential store as:

- path `oauth-client-secret` (password = app client secret)
- path `password` (password = reddit account/app password)

#### pass-cli

```bash
# Preferred with current Proton Pass CLI: use pass://... URIs (optionally with /field)
REDDIT_PASS_CLI_CLIENT_SECRET_KEY='pass://<share-id>/<item-id>/client_secret' \
REDDIT_PASS_CLI_PASSWORD_KEY='pass://<share-id>/<item-id>/password' \
reddit-mcp-server \
  --credential-provider pass-cli \
  --username your_reddit_username \
  --client-id your_client_id
```

Compatibility notes:

- Older `pass-cli` variants that support `pass-cli secret get <key>` are supported.
- Current Proton Pass CLI variants without `secret` are also supported; the server falls back to `pass-cli item view <key>` and expects `key` to be a pass URI.
- Keep `REDDIT_PASS_CLI_COMMAND` as a binary path/name (default `pass-cli`), not a full shell command.

#### Legacy env mode (less secure)

```bash
REDDIT_CREDENTIAL_PROVIDER=env \
REDDIT_USERNAME=... \
REDDIT_CLIENT_SECRET=... \
REDDIT_PASSWORD=... \
reddit-mcp-server
```
