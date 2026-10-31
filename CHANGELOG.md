# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-10-31

A major version because HTTP clients lose `/sse` and `/ready`, and invalid arguments change shape. Stdio clients (Claude Desktop, Claude Code, `npx`) see no change.

### Changed

- The server runs on [somamcp](https://github.com/sapientsai/somamcp) 2.2 (MCP TypeScript SDK 2.x) instead of FastMCP. Tool names, descriptions and parameters are unchanged; tools now also carry a top-level `title`, and their input schemas are JSON Schema draft 2020-12
- Tool errors read as plain text: `Failed to search: …` instead of `Tool 'search_reddit' execution failed: Failed to search: …`, still with `isError: true`
- Invalid tool arguments come back as a tool result with `isError: true` (`Invalid arguments for tool 'get_user_posts': Too big: …`), not a JSON-RPC `-32602` protocol error, and the message no longer names the field
- HTTP serving is stateless: no `Mcp-Session-Id`, and `GET`/`DELETE /mcp` answer 405. MCP SDK clients handle this
- `/health` answers JSON (`{"name":"reddit-mcp-server","status":"running"}`) instead of the text `✓ Ok`. `/health/detail` is new and takes the bearer token when `OAUTH_ENABLED=true`; with OAuth off it always answers 401
- Requests over 4 MiB get 413
- 401 and 403 responses carry the standard reason phrases instead of custom ones; the status codes are unchanged
- The Docker Compose health check probes `/health` instead of `/`, which was always 404
- The Docker build downloads pnpm's native binary once per platform, with retries, in a cached layer. The runtime image runs on node alone, without pnpm, and shrinks from 129 MB to 72 MB
- `manifest.json` lists all 25 tools; it listed 15
- `functype` 1.22; `somamcp` 2.2.1, so `/health/detail` answers a wrong token with 403, as `/mcp` does

### Removed

- The legacy SSE endpoint (`/sse`). HTTP clients use Streamable HTTP at `/mcp`
- `/ready`. Use `/health`

### Unchanged on purpose

- CORS: preflight and responses still allow any origin, as under FastMCP
- Keepalive: HTTP responses stream as SSE with periodic keepalive frames, as FastMCP's pings did, so idle-timeout proxies don't cut long tool calls

## [1.7.2] - 2026-10-30

### Changed

- Keyless list output (search, user posts, user comments) omits the archive's lagging scores and comment counts; keyless `get_reddit_post` replaces its stats with a note and drops the engagement analysis built on them
- Arctic Shift throttling (HTTP 429 or "Timeout") retries once after the `X-RateLimit-Reset` time, capped at 10 seconds; a second failure says when to retry

### Fixed

- Subreddit and user search results no longer show blank post-only fields (author, comments)
- `get_subreddit_info` no longer prints an empty Community Analysis for mid-size subreddits

## [1.7.1] - 2026-10-28

### Fixed

- Keyless search no longer reports the default `relevance` sort as ignored, and subreddit search reports its subscriber order
- `get_reddit_post` no longer prints an empty Engagement Analysis
- The publish workflow waits up to 15 minutes for the npm tarball and logs in to the MCP Registry after that wait

## [1.7.0] - 2026-10-28

### Added

- Keyless reads through the [Arctic Shift](https://github.com/ArthurHeitmann/arctic_shift) archive, a free third-party Reddit archive, for posts, comment threads, users, subreddit info and rules, and search within a subreddit. Ranked listings stay on RSS and fall back to the archive's newest posts when RSS fails. Every archive result says where it came from
- `get_post_comments` lists the ids of collapsed comments, so `get_more_comments` can expand them
- `test_reddit_mcp_server` reports whether reads come from Reddit's API or keyless sources

### Changed

- Dependencies updated to latest, with ts-builds 4 and pnpm 12; Node pinned to 24.21.0 for npm publishing

## [1.6.3] - 2026-09-27

### Fixed

- Link posts show their body text as well as their URL, and comment truncation limits are higher
- stdio mode warns when stdin is a terminal, which means no MCP client is attached

## [1.6.2] - 2026-09-18

### Changed

- fastmcp 4.20

### Fixed

- The publish workflow waits for npm before publishing to the MCP Registry

## [1.6.1] - 2026-09-17

### Added

- `save_content` and `unsave_content`

### Fixed

- `search_reddit` with `type=sr` or `type=user` always returned no results
- The publish workflow tolerates an npm version that is already published

## [1.6.0] - 2026-09-17

### Added

- RSS fallback: `browse_subreddit` and `get_top_posts` work without OAuth credentials

### Deprecated

- `REDDIT_AUTH_MODE=anonymous`, because Reddit blocks unauthenticated API requests; it is now an alias for `auto` without credentials

## [1.5.3] - 2026-08-08

### Changed

- The README documents Reddit's IP block on unauthenticated requests

## [1.5.2] - 2026-08-08

### Security

- Subreddit names, usernames and thing ids are validated before they reach a request URL. A crafted value such as `../../api/v1/me` could previously steer the OAuth token to a different Reddit endpoint
- SECURITY.md and private vulnerability reporting

### Fixed

- When Reddit IP-blocks unauthenticated requests, the error says so and points to OAuth credentials, instead of reading as a private subreddit

## [1.5.1] - 2026-07-01

### Changed

- Richer tool descriptions and parameter docs

## [1.5.0] - 2026-06-22

### Added

- Cursor pagination (`after`) on listing tools: `get_top_posts`, `browse_subreddit`, `search_reddit`, `get_user_posts`, `get_user_comments` (tools render a "more results" hint with the next cursor)
- Rate-limit resilience: transparent HTTP 429 retry honoring `Retry-After`/`x-ratelimit-reset` with exponential-backoff fallback (`REDDIT_MAX_RETRIES`, default 3)
- `get_subreddit_rules` — a subreddit's posting rules
- `get_post_flairs` — available link flairs; `create_post` now accepts `flair_id`/`flair_text`
- `get_more_comments` — expand truncated "load more" comment stubs via `/api/morechildren`
- Authenticated-user reads: `get_me`, `get_my_overview`, `get_my_saved`

### Changed

- Client error channel is now a typed discriminated ADT (`Either<RedditError, T>` — `HttpError`/`NotFoundError`/`ApiError`/`ValidationError`/`NotAuthenticatedError`/`UnknownError`) built on functype `Try`, replacing bare `Error`; observable error messages are unchanged
- Removed an unused duplicate set of tool modules (`src/tools/*`); tools are defined inline in the server entry

### Fixed

- `get_me` no longer crashes in read-only mode — it now returns a clear `NotAuthenticatedError` when `REDDIT_USERNAME` is not configured
- Flaky test failures caused by a duplicate `vi.mock` hoist race

## [1.0.7] - 2025-06-27

### Fixed

- Fixed server crash issue caused by stdout pollution in bin.js
- Cleaned up published package to only include necessary files (reduced from 112KB to 24KB)

### Added

- Search Reddit functionality (`search_reddit` tool)
- Get post comments with threaded display (`get_post_comments` tool)
- Get user posts (`get_user_posts` tool)
- Get user comments (`get_user_comments` tool)
- Comprehensive test suite for all new functionality

### Changed

- Migrated from axios to native fetch API
- Improved error handling and removed console output that violated MCP protocol

## [1.0.6] - 2025-06-27

### Added

- New Reddit API endpoints (had packaging issues, use 1.0.7 instead)

## [1.0.5] - 2025-06-27

### Changed

- Migrated from axios to fetch for HTTP requests
- Fixed linting errors and improved code formatting

## [1.0.4] and earlier

- Previous versions with axios-based implementation
