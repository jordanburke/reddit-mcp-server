# Reddit MCP Server Roadmap

## What ships today (2.x)

- **Read tools (17):** posts, comment threads and collapsed comments, top and sorted listings, user profiles, posts and comments, subreddit info and rules, search, trending subreddits, post flairs, your own account, overview and saved items, and a status check.
- **Write tools (8):** create posts, reply, edit, save, unsave and delete your own posts and comments, with Safe Mode and optional bot disclosure.
- **Keyless reads:** without OAuth credentials, most read tools work through Reddit's RSS feeds and the [Arctic Shift](https://github.com/ArthurHeitmann/arctic_shift) archive.

## Reddit's API shutdown

Reddit is ending RSS feeds on 2026-11-13 and closing its public API in March 2027. The README's [Reddit is closing its public API](README.md#reddit-is-closing-its-public-api) section has the dates, sources and what each change means for users.

Open questions:

- **Reads after March 2027.** The OAuth path stops then. Arctic Shift collects its data through Reddit's API, so the archive may stop getting new posts too.
- **Writes after March 2027.** Every write tool uses Reddit's API, and the API closure ends them.

## Not planned

Reddit's [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) rules these out, so the server leaves them out on purpose:

- Voting (upvote/downvote) or any other karma manipulation
- Direct or private messages
- Bulk data export or scraping

## Ideas

- Subscribe and unsubscribe (`/api/subscribe`)
