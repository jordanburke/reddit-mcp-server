#!/usr/bin/env node

declare const __VERSION__: string

// Force stdio mode for CLI/npx usage (unless explicitly overridden)
if (!process.env.TRANSPORT_TYPE) {
  process.env.TRANSPORT_TYPE = "stdio"
}

// Handle command line arguments BEFORE any other imports
const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(__VERSION__)
  process.exit(0)
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Reddit MCP Server v${__VERSION__}

Usage: reddit-mcp-server [options]

Options:
  -v, --version        Show version number
  -h, --help           Show help

Environment Variables:
  REDDIT_CLIENT_ID      Reddit API client ID (optional, for OAuth)
  REDDIT_CLIENT_SECRET  Reddit API client secret (optional, for OAuth)
  REDDIT_USERNAME       Reddit username (optional, for write operations)
  REDDIT_PASSWORD       Reddit password (optional, for write operations)
  REDDIT_USER_AGENT     Custom user agent (optional)
  REDDIT_AUTH_MODE      Authentication mode: auto, authenticated, anonymous (default: auto)
  REDDIT_SAFE_MODE      Spam protection: off, standard, strict (default: standard)
  REDDIT_BOT_DISCLOSURE Bot disclosure footer: auto, off (default: off)
  REDDIT_BOT_FOOTER     Custom bot footer text (optional, used with REDDIT_BOT_DISCLOSURE=auto)

For more information, visit: https://github.com/jordanburke/reddit-mcp-server
`)
  process.exit(0)
}

// Import and start server if not showing version/help
async function main() {
  // Import and run the main function from the FastMCP server
  await import("./index.js")
  // The index.js exports main() directly, so we just need to execute the file
  // The main() is already executed when the module is imported
}

main().then()
