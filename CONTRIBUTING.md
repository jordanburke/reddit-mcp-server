# Contributing to reddit-mcp-server

## PR Scope Rules

Every pull request must contain **one logical change**. Pick one:

- A bug fix
- A security fix
- A new feature
- A refactor
- A documentation update
- A test improvement

Do not bundle unrelated changes into a single PR, even if they seem small. PRs that mix concerns (e.g., a security fix with a new feature, or a bug fix with a config refactor) will be sent back for splitting.

### New Features

New features **must** be proposed in a GitHub issue before you write code. This lets us discuss scope, approach, and whether the feature fits the project before you invest time. PRs that introduce undiscussed features will be closed.

### Breaking Changes

Breaking changes require **explicit maintainer approval** in a GitHub issue before implementation. If your PR changes existing behavior for current users, it is a breaking change.

Examples of breaking changes:

- Changing default values for existing configuration or environment variables
- Renaming, removing, or relabeling existing environment variables
- Adding required configuration that was not previously needed
- Changing transport, authentication, or API behavior without opt-in
- Altering the server's default mode of operation

### Version Bumps

Version numbers in `package.json`, `server.json`, and related files are managed by the maintainer. Do not include version bumps in your PRs.

## What We Accept

- **Security fixes** -- fast-tracked, reviewed with priority
- **Bug fixes** with tests demonstrating the fix
- **New tools/features** that were discussed and approved in an issue first
- **Documentation improvements**
- **Test coverage improvements**

## Enforcement

1. Non-compliant PRs receive a "changes requested" review citing the specific policy violations.
2. If the issues are not addressed, the PR will be closed.
3. You are welcome to resubmit a compliant PR at any time.

## Development Setup

```bash
pnpm install
pnpm build
pnpm test
pnpm format
pnpm lint
```

Use `pnpm inspect` to test tools interactively with the MCP inspector.
