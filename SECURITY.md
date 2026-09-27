# Security Policy

## Supported versions

Only the latest published version of `reddit-mcp-server` receives security fixes. Older
versions are not patched — upgrade before reporting an issue you can only reproduce on an
older release.

| Version | Supported |
| ------- | --------- |
| 1.5.x   | ✅        |
| < 1.5   | ❌        |

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub:
[Report a vulnerability](https://github.com/jordanburke/reddit-mcp-server/security/advisories/new).

If you cannot use GitHub advisories, email jordan.burke@gmail.com with `SECURITY` in the
subject line.

Please include:

- The version you are running (`npx reddit-mcp-server --version`, or the package version).
- Your transport mode (stdio or `TRANSPORT_TYPE=httpStream`) and auth mode (`REDDIT_AUTH_MODE`).
- Steps to reproduce, ideally with a minimal tool call or request.
- What an attacker gains — credential disclosure, unintended writes to Reddit, request
  forgery, and so on.

**Never include real credentials in a report.** Redact `REDDIT_CLIENT_SECRET`,
`REDDIT_PASSWORD`, `OAUTH_TOKEN`, and any Reddit access token.

## What to expect

- Acknowledgement within 5 business days.
- A fix or a decision, with reasoning, within 30 days for confirmed issues.
- Credit in the release notes and the advisory, unless you ask otherwise.

This is a single-maintainer project with no bug bounty.

## Scope

In scope:

- Credential or token disclosure — leaking `REDDIT_*` values or the OAuth bearer token into
  logs, tool output, or requests to unintended endpoints.
- Path or parameter injection through tool inputs that redirects a request away from its
  intended Reddit endpoint.
- Authentication bypass on the HTTP transport when `OAUTH_ENABLED=true`.
- Unintended write operations — a read-only tool call that creates, edits, or deletes Reddit
  content.
- Dependency vulnerabilities that are reachable from this server's code paths.

Out of scope:

- Reddit API behavior, rate limits, and outages. Report those to Reddit.
- Findings that require an attacker who already controls the machine or the environment
  variables the server reads.
- Exposing the HTTP transport to an untrusted network on purpose. It binds `127.0.0.1` by
  default; overriding `HOST` to a public interface is your risk to accept, and you should
  set `OAUTH_ENABLED=true` if you do.
- Prompt injection from Reddit content that changes what a connected LLM decides to do. The
  server returns Reddit data faithfully; deciding what to trust is the client's job.

## Operational notes

- Write tools (`create_post`, `reply_to_post`, `edit_post`, `edit_comment`, `delete_post`,
  `delete_comment`) require `REDDIT_USERNAME` and `REDDIT_PASSWORD`. Omit those variables and
  the server can only read.
- Credentials are read from the environment and are never written to disk or included in tool
  responses.
- Deletions are permanent. `REDDIT_SAFE_MODE=standard` or `strict` adds write delays and
  duplicate-content checks, but does not gate deletes.
