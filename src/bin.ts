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
  -v, --version                        Show version number
  -h, --help                           Show help
  --credential-provider <provider>     git-credential (default) | pass-cli | env
  --username <redditUsername>          Reddit username for user-auth write operations (non-secret)
  --client-id <clientId>               Reddit API client ID
  --auth-mode <mode>                   auto | authenticated | anonymous
  --safe-mode <mode>                   off | standard | strict

Environment Variables:
  REDDIT_CREDENTIAL_PROVIDER   Credential provider (default: git-credential)
  REDDIT_CLIENT_ID             Reddit API client ID
  REDDIT_USER_AGENT            Custom user agent (optional)

  # Less secure legacy mode (backward compatible)
  REDDIT_CLIENT_SECRET         Reddit app client secret (env provider only)
  REDDIT_PASSWORD              Reddit password (env provider only)
  REDDIT_USERNAME              Legacy username source (env provider only)

  # git-credential provider settings
  REDDIT_GIT_CREDENTIAL_HOST                    Host for git credential lookups (default: reddit.com)
  REDDIT_GIT_CREDENTIAL_CLIENT_SECRET_PATH      Path key for client secret (default: oauth-client-secret)
  REDDIT_GIT_CREDENTIAL_PASSWORD_PATH           Path key for account password (default: password)

  # pass-cli provider settings
  REDDIT_PASS_CLI_COMMAND             pass-cli binary path/name (default: pass-cli)
  REDDIT_PASS_CLI_CLIENT_SECRET_KEY   pass-cli key for client secret
  REDDIT_PASS_CLI_PASSWORD_KEY        pass-cli key for reddit password

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
