#!/usr/bin/env node

// Read package.json dynamically
const fs = require('fs')
const path = require('path')
const packageJsonPath = path.join(__dirname, '..', 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

// Handle command line arguments BEFORE any other imports
const args = process.argv.slice(2)

if (args.includes('--version') || args.includes('-v')) {
  console.log(packageJson.version)
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Reddit MCP Server v${packageJson.version}

Usage: reddit-mcp-server [options]

Options:
  -v, --version     Show version number
  -h, --help        Show help

Environment Variables:
  REDDIT_CLIENT_ID      Reddit API client ID (required)
  REDDIT_CLIENT_SECRET  Reddit API client secret (required)
  REDDIT_USERNAME       Reddit username (optional, for write operations)
  REDDIT_PASSWORD       Reddit password (optional, for write operations)
  REDDIT_USER_AGENT     Custom user agent (optional)

For more information, visit: https://github.com/jordanburke/reddit-mcp-server
`)
  process.exit(0)
}

// Only import and start server if not showing version/help
async function main() {
  const { RedditServer } = await import("./index.js")
  const server = new RedditServer()
  server.run().catch(() => {
    process.exit(1)
  })
}

main()
