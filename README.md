# Reddit MCP Server ⚙️

A Model Context Protocol (MCP) that provides tools for fetching and creating Reddit content.

> **Note**: This is a fork of the [reddit-mcp-server](https://github.com/alexandros-lekkas/reddit-mcp-server) by Alexandros Lekkas, updated with pnpm, tsup build system, and npx execution support.

<a href="https://glama.ai/mcp/servers/@jordanburke/reddit-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@jordanburke/reddit-mcp-server/badge" alt="reddit-mcp-server MCP server" />
</a>

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
- `edit_post(thing_id, new_text)` - Edit your own Reddit post (self-text posts only)
- `edit_comment(thing_id, new_text)` - Edit your own Reddit comment
- `delete_post(thing_id)` - Delete your own Reddit post
- `delete_comment(thing_id)` - Delete your own Reddit comment

## 🔌 Installation

1. `git clone https://github.com/jordanburke/reddit-mcp-server`

2. Create a Reddit app [here](https://www.reddit.com/prefs/apps)

![image](https://github.com/user-attachments/assets/bb7582d6-abf2-4282-a102-bd2e0f2c1c41)

Make sure to select "script"!

3. Copy the client ID and client secret

4. Create a `.env` file based on `.env.example`

Do this with your `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`

If you want to write posts you need to include your `REDDIT_USERNAME` and `REDDIT_PASSWORD`

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
        "reply_to_post",
        "edit_post",
        "edit_comment",
        "delete_post",
        "delete_comment"
      ] // Optional if you do not want to always approve
    }
  }
```

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

# Generate OAuth token for HTTP server
npx reddit-mcp-server --generate-token
```

### HTTP MCP Endpoint (FastMCP)

In addition to the standard npx execution, this server supports HTTP transport via FastMCP for direct HTTP integration:

```bash
# Start the HTTP server on port 3000 (default)
node dist/index.js

# Start with custom port
PORT=8080 node dist/index.js

# Or use the npm script
pnpm start
```

The server will be available at `http://localhost:3000` with the MCP endpoint at `http://localhost:3000/mcp`.

#### OAuth Security (Optional)

The HTTP server supports optional OAuth protection to secure your endpoints:

**Generate a secure token:**

```bash
npx reddit-mcp-server --generate-token
# Output: Generated OAuth token: A8f2Kp9x3NmQ7vR4tL6eZ1sW5yB8hC2j
```

**Enable OAuth with generated token:**

```bash
export OAUTH_ENABLED=true
export OAUTH_TOKEN="A8f2Kp9x3NmQ7vR4tL6eZ1sW5yB8hC2j"
pnpm serve
```

**Make authenticated requests:**

```bash
curl -H "Authorization: Bearer A8f2Kp9x3NmQ7vR4tL6eZ1sW5yB8hC2j" \
     -H "Content-Type: application/json" \
     -d '{"method":"tools/list","params":{}}' \
     http://localhost:3000/mcp
```

**OAuth Configuration:**

- `OAUTH_ENABLED=true` - Enables OAuth protection (disabled by default)
- `OAUTH_TOKEN=your-token` - Your custom token (or use `--generate-token`)
- Without OAuth, the server is accessible without authentication
- Health check (`/`) is always unprotected; only `/mcp` requires authentication

#### MCP Client Configuration

For MCP clients connecting to an OAuth-protected server, configure according to the [MCP Authorization specification](https://modelcontextprotocol.io/specification/draft/basic/authorization):

**HTTP-based MCP Clients (e.g., web applications):**

```javascript
// Example using fetch API
const response = await fetch("http://localhost:3000/mcp", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_TOKEN",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  }),
})

const result = await response.json()
```

**Direct HTTP MCP Client:**

```javascript
const client = new MCP.Client({
  transport: new MCP.HTTPTransport({
    url: "http://localhost:3000/mcp",
    headers: {
      Authorization: "Bearer YOUR_TOKEN",
    },
  }),
})
```

**Custom MCP Client Implementation:**

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { HTTPTransport } from "@modelcontextprotocol/sdk/client/http.js"

const transport = new HTTPTransport({
  url: "http://localhost:3000/mcp",
  headers: {
    Authorization: "Bearer YOUR_TOKEN",
    "Content-Type": "application/json",
  },
})

const client = new Client(
  {
    name: "reddit-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  },
)

await client.connect(transport)
```

**Important Notes:**

- Replace `YOUR_TOKEN` with your generated OAuth token
- Authorization header MUST be included in every request to `/mcp`
- Tokens MUST NOT be included in URI query strings per MCP specification
- Use HTTPS in production for secure token transmission

**For Remote/Deployed Servers:**
When connecting to a remote Reddit MCP server (e.g., deployed on your infrastructure):

```javascript
// Production server with OAuth
const response = await fetch("https://your-server.com/mcp", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_TOKEN",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  }),
})
```

**MCP Client Configuration for Remote Server:**

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { HTTPTransport } from "@modelcontextprotocol/sdk/client/http.js"

// For your deployed server
const transport = new HTTPTransport({
  url: "https://your-reddit-mcp.company.com/mcp",
  headers: {
    Authorization: "Bearer YOUR_GENERATED_TOKEN",
    "Content-Type": "application/json",
  },
})

const client = new Client(
  {
    name: "reddit-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  },
)

await client.connect(transport)
```

**Claude Desktop/Cursor with Remote Server (HTTP):**
For remote servers, you can use a proxy approach:

```json
{
  "mcpServers": {
    "reddit-remote": {
      "command": "node",
      "args": [
        "-e",
        "const http = require('https'); const req = http.request('https://your-server.com/mcp', {method:'POST',headers:{'Authorization':'Bearer YOUR_TOKEN','Content-Type':'application/json'}}, res => res.pipe(process.stdout)); process.stdin.pipe(req);"
      ],
      "env": {}
    }
  }
}
```

**For Claude Desktop/Cursor (stdio transport):**
OAuth is not applicable when using the traditional npx execution method. Use the stdio configuration instead:

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

#### Remote Deployment Examples

**Deploy to your infrastructure and share the URL:**

1. **Generate secure token:**

   ```bash
   npx reddit-mcp-server --generate-token
   # Output: Generated OAuth token: xyz123abc456def789
   ```

2. **Deploy with Docker on your server:**

   ```bash
   docker run -d \
     --name reddit-mcp \
     -p 3000:3000 \
     -e REDDIT_CLIENT_ID=your_reddit_client_id \
     -e REDDIT_CLIENT_SECRET=your_reddit_client_secret \
     -e OAUTH_ENABLED=true \
     -e OAUTH_TOKEN=xyz123abc456def789 \
     ghcr.io/jordanburke/reddit-mcp-server:latest
   ```

3. **Share with your team:**

   ```
   Server URL: https://your-server.com/mcp
   OAuth Token: xyz123abc456def789
   ```

4. **Team members connect:**
   ```typescript
   const client = new Client(...);
   const transport = new HTTPTransport({
     url: 'https://your-server.com/mcp',
     headers: { 'Authorization': 'Bearer xyz123abc456def789' }
   });
   await client.connect(transport);
   ```

This allows integration with systems that support HTTP-based MCP communication via the FastMCP framework.

## 🐳 Docker Usage

### Pull from GitHub Container Registry

```bash
# Pull the latest image
docker pull ghcr.io/jordanburke/reddit-mcp-server:latest

# Pull a specific version
docker pull ghcr.io/jordanburke/reddit-mcp-server:v1.0.10
```

### Run with Docker

```bash
# Run the HTTP server (recommended)
docker run -d \
  --name reddit-mcp \
  -p 3000:3000 \
  -e REDDIT_CLIENT_ID=your_client_id \
  -e REDDIT_CLIENT_SECRET=your_client_secret \
  -e REDDIT_USERNAME=your_username \
  -e REDDIT_PASSWORD=your_password \
  ghcr.io/jordanburke/reddit-mcp-server:latest

# Run with OAuth enabled (secure)
docker run -d \
  --name reddit-mcp \
  -p 3000:3000 \
  -e REDDIT_CLIENT_ID=your_client_id \
  -e REDDIT_CLIENT_SECRET=your_client_secret \
  -e OAUTH_ENABLED=true \
  -e OAUTH_TOKEN=your_generated_token \
  ghcr.io/jordanburke/reddit-mcp-server:latest

# Run with custom port
docker run -d \
  --name reddit-mcp \
  -p 8080:3000 \
  --env-file .env \
  ghcr.io/jordanburke/reddit-mcp-server:latest

# Generate token using Docker
docker run --rm \
  ghcr.io/jordanburke/reddit-mcp-server:latest \
  node dist/bin.js --generate-token

# Run as stdio MCP server (for direct integration)
docker run -it \
  --env-file .env \
  ghcr.io/jordanburke/reddit-mcp-server:latest \
  node dist/index.js
```

### Build Locally

```bash
# Build the image
docker build -t reddit-mcp-server .

# Run the locally built image
docker run -d \
  --name reddit-mcp \
  -p 3000:3000 \
  --env-file .env \
  reddit-mcp-server
```

### Docker Compose Example

```yaml
version: "3.8"

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
      # Optional OAuth settings
      - OAUTH_ENABLED=${OAUTH_ENABLED:-false}
      - OAUTH_TOKEN=${OAUTH_TOKEN}
    restart: unless-stopped
```

## 📚 Credits

- This is a fork of the original [reddit-mcp-server](https://github.com/alexandros-lekkas/reddit-mcp-server) by Alexandros Lekkas.

- Credit goes to the [Python Reddit MCP Server](https://github.com/Arindam200/reddit-mcp) by Arindam200 for the inspiration and implementation of these tools.