#!/usr/bin/env node

// Read package.json dynamically
import fs from "fs"
import path from "path"
const packageJsonPath = path.join(__dirname, "..", "package.json")
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))

// Handle command line arguments BEFORE any other imports
const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(packageJson.version)
  process.exit(0)
}

if (args.includes("--generate-token")) {
  // Import the token generator
  async function generateToken() {
    const { generateRandomToken } = await import("./middleware/auth.js")
    const token = generateRandomToken(32)
    console.log(`Generated OAuth token: ${token}`)
    console.log(`\nTo use this token, set the environment variable:`)
    console.log(`export OAUTH_TOKEN="${token}"`)
    console.log(`export OAUTH_ENABLED=true`)
    console.log(`\nThen start the HTTP server with: pnpm serve`)
    process.exit(0)
  }
  generateToken().catch((error) => {
    console.error("Failed to generate token:", error)
    process.exit(1)
  })
} else {
  // Only import and start server if not showing version/help/generate-token
  main().then()
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Reddit MCP Server v${packageJson.version}

Usage: reddit-mcp-server [options]

Options:
  -v, --version        Show version number
  -h, --help           Show help
  --generate-token     Generate a secure OAuth token for HTTP server

Environment Variables:
  REDDIT_CLIENT_ID      Reddit API client ID (required)
  REDDIT_CLIENT_SECRET  Reddit API client secret (required)
  REDDIT_USERNAME       Reddit username (optional, for write operations)
  REDDIT_PASSWORD       Reddit password (optional, for write operations)
  REDDIT_USER_AGENT     Custom user agent (optional)

HTTP Server OAuth Variables:
  OAUTH_ENABLED         Set to "true" to enable OAuth protection
  OAUTH_TOKEN           Custom OAuth token (use --generate-token to create one)

For more information, visit: https://github.com/jordanburke/reddit-mcp-server
`)
  process.exit(0)
}

// Only import and start server if not showing version/help/generate-token
async function main() {
  const { RedditServer } = await import("./index.js")
  const server = new RedditServer()
  server.run().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
