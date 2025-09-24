# Changelog

All notable changes to this project will be documented in this file.

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
