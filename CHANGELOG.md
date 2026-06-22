# Changelog

All notable changes to this project will be documented in this file.

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
