/* eslint-disable functype/prefer-either --
 * Same imperative-to-functional boundary as reddit-client.ts: each public method runs its
 * failure-producing region inside a `Try` and converts it to `Either<RedditError, T>`. The
 * `throw`s are local control flow captured by that `Try` and never escape the method.
 */
import type { Either } from "functype"
import { Option, Try } from "functype"

import type {
  Page,
  PostComments,
  RedditApiCommentTreeData,
  RedditApiPostData,
  RedditApiRulesResponse,
  RedditApiSubredditResponse,
  RedditComment,
  RedditPost,
  RedditRule,
  RedditSubreddit,
  RedditUser,
} from "../types"
import { normalizeSubreddit, normalizeThingId, normalizeUsername } from "../utils/reddit-identifiers"
import type { RedditError } from "./errors"
import { ApiError, classifyRedditError, HttpError, NotFoundError, ValidationError } from "./errors"
import {
  collectMoreIds,
  parseCommentData,
  parseCommentTree,
  parsePostData,
  parseRuleData,
  parseSubredditData,
  parseSubredditSearchData,
} from "./reddit-parsers"
import type { ResponseCache } from "./response-cache"

/**
 * Keyless read backend over the Arctic Shift archive (https://github.com/ArthurHeitmann/arctic_shift),
 * a free third-party Reddit archive. It is not Reddit's API:
 * - It sorts only by creation date, so there is no hot/top/rising ranking and no home feed.
 * - Scores and comment counts are captured at ingest and lag (often 0 or 1 on recent posts).
 * - Coverage can be incomplete, especially for comments on recent posts.
 * - Keyword search needs a subreddit or author; multireddits (`a+b`) are not supported.
 * Pagination walks backward in time: the `after` cursor is the created_utc of the last item.
 */
const BASE_URL = "https://arctic-shift.photon-reddit.com/api"
const MAX_LIMIT = 100
const MAX_COMMENT_TREE_LIMIT = 500
const ERROR_TEXT_MAX_LENGTH = 200
const CURSOR_PATTERN = /^\d{9,10}$/
// Arctic answers 429, or "Timeout. Maybe slow down a bit", when it is throttling (keyword
// search especially). Its X-RateLimit-Reset header gives seconds until the window resets, but
// the limit is load-based and a retry usually succeeds well before that, so the wait is capped.
export type ThrottleDelays = { readonly fallbackMs: number; readonly maxWaitMs: number }
const THROTTLE_DELAYS: ThrottleDelays = { fallbackMs: 3_000, maxWaitMs: 10_000 }

// How long to wait before the one retry: the header's reset time, capped; else the fallback.
export function throttleWaitMs(resetSeconds: Option<number>, delays: ThrottleDelays): number {
  return resetSeconds.fold(
    () => delays.fallbackMs,
    (seconds) => Math.min(seconds * 1000, delays.maxWaitMs),
  )
}

// The reset header rides on every response and only marks the next minute boundary, so it is
// advice for a real 429. A query timeout usually clears in seconds.
function throttleMessage(status: number, resetSeconds: Option<number>): string {
  if (status !== 429) {
    return "Arctic Shift timed out on this query, which it does under load. Wait a few seconds and retry; keyword searches on large subreddits are slowest."
  }
  return resetSeconds.fold(
    () => "Arctic Shift's rate limit was reached. It is a free service; wait a minute and retry.",
    (seconds) => `Arctic Shift's rate limit was reached. It resets in ${seconds} seconds; retry after that.`,
  )
}

// X-RateLimit-Reset is whole seconds until the limit resets; absent or malformed means unknown.
function resetSecondsOf(headers: Headers): Option<number> {
  return Option(headers.get("x-ratelimit-reset"))
    .filter((raw) => raw.trim() !== "")
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0)
}

type ArcticResponse<T> = {
  // eslint-disable-next-line functype/prefer-option -- wire format: Arctic Shift returns literal null on error
  readonly data: T | null
  readonly error?: string
}

type ArcticSubreddit = RedditApiSubredditResponse["data"]

type ArcticUser = {
  readonly author: string
  readonly id?: string
  readonly _meta?: {
    readonly earliest_post_at?: number
    readonly earliest_comment_at?: number
    readonly post_karma?: number
    readonly comment_karma?: number
    readonly total_karma?: number
  }
}

type ArcticCommentNode = { readonly kind: string; readonly data: RedditApiCommentTreeData }

type ArcticRules = { readonly subreddit: string; readonly rules: RedditApiRulesResponse["rules"] }

function clampLimit(limit: number, max: number = MAX_LIMIT): number {
  return Math.min(Math.max(Math.trunc(limit), 1), max)
}

// Arctic Shift has no home feed and no multireddits; require exactly one named subreddit.
function singleSubreddit(subreddit: string): string {
  const name = normalizeSubreddit(subreddit)
  if (name === "") {
    throw new ValidationError(
      "The Arctic Shift archive has no home feed. Name a subreddit, or set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.",
    )
  }
  if (name.includes("+")) {
    throw new ValidationError(
      `The Arctic Shift archive does not support multireddits ("${name}"). Query one at a time.`,
    )
  }
  return name
}

// True for a cursor this client issued (a created_utc in seconds), false for e.g. an RSS fullname.
export function isArchiveCursor(after: string): boolean {
  return CURSOR_PATTERN.test(after)
}

// Arctic's `after` accepts offsets from now, so Reddit's time filters map directly.
const TIME_FILTER_OFFSETS: Readonly<Record<string, string>> = {
  hour: "1hour",
  day: "1d",
  week: "7d",
  month: "30d",
  year: "365d",
}

function cursorParam(after?: string): Record<string, string> {
  if (after === undefined) return {}
  if (!isArchiveCursor(after)) {
    throw new ValidationError(
      `Invalid pagination cursor "${after}". In keyless mode, pass the \`after\` value from a previous keyless call.`,
    )
  }
  return { before: after }
}

// A full page means there may be more; the cursor is the oldest item's timestamp. Arctic's
// `before` is exclusive, so the next page starts just past it.
function pageOf<T extends { readonly createdUtc: number }>(items: readonly T[], limit: number): Page<T> {
  const last = items.at(-1)
  const after = items.length >= limit && last !== undefined ? { after: String(last.createdUtc) } : {}
  return { items, source: "arctic", ...after }
}

export class ArcticShiftClient {
  private readonly userAgent: string
  private readonly cache?: ResponseCache
  private readonly throttleDelays: ThrottleDelays

  constructor(userAgent: string, cache?: ResponseCache, throttleDelays: ThrottleDelays = THROTTLE_DELAYS) {
    this.userAgent = userAgent
    this.cache = cache
    this.throttleDelays = throttleDelays
  }

  // GET an Arctic Shift endpoint and return its `data`. Throws a typed RedditError on failure.
  private async request<T>(path: string, params: Record<string, string>, retried: boolean = false): Promise<T> {
    const url = `${BASE_URL}${path}?${new URLSearchParams(params)}`
    const cached = this.cache?.get(url)
    // Only successes are cached, so a cached entry never needs its rate-limit headers.
    const { status, body, resetSeconds } =
      cached !== undefined ? { ...cached, resetSeconds: Option.none<number>() } : await this.fetchBody(url)

    const json = Try(() => JSON.parse(body) as ArcticResponse<T>).orElse({ data: null, error: `HTTP ${status}` })
    if (status < 200 || status >= 300 || json.error !== undefined || json.data === null) {
      const detail = (json.error ?? `HTTP ${status}`).slice(0, ERROR_TEXT_MAX_LENGTH)
      if (status === 429 || /timeout|timed out/i.test(detail)) {
        if (!retried) {
          await new Promise((resolve) => setTimeout(resolve, throttleWaitMs(resetSeconds, this.throttleDelays)))
          return this.request<T>(path, params, true)
        }
        throw new HttpError(status, throttleMessage(status, resetSeconds))
      }
      throw status >= 400
        ? new HttpError(status, `Arctic Shift error: ${detail}`)
        : new ApiError(`Arctic Shift error: ${detail}`)
    }

    if (cached === undefined) this.cache?.set(url, body, status)
    return json.data
  }

  private async fetchBody(
    url: string,
  ): Promise<{ readonly status: number; readonly body: string; readonly resetSeconds: Option<number> }> {
    const response = await fetch(url, { headers: { "User-Agent": this.userAgent, Accept: "application/json" } })
    return { status: response.status, body: await response.text(), resetSeconds: resetSecondsOf(response.headers) }
  }

  async listSubredditPosts(
    subreddit: string,
    limit: number = 25,
    after?: string,
  ): Promise<Either<RedditError, Page<RedditPost>>> {
    const context = `Failed to list r/${subreddit} from the Arctic Shift archive`
    const attempt = await Try.async(async (): Promise<Page<RedditPost>> => {
      const size = clampLimit(limit)
      const posts = await this.request<readonly RedditApiPostData[]>("/posts/search", {
        subreddit: singleSubreddit(subreddit),
        sort: "desc",
        limit: String(size),
        ...cursorParam(after),
      })
      return pageOf(posts.map(parsePostData), size)
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async searchPosts(
    query: string,
    options: {
      readonly subreddit?: string
      readonly limit?: number
      readonly after?: string
      readonly timeFilter?: string
    } = {},
  ): Promise<Either<RedditError, Page<RedditPost>>> {
    const { subreddit, limit = 25, after, timeFilter } = options
    const since = timeFilter !== undefined ? TIME_FILTER_OFFSETS[timeFilter] : undefined
    const context = `Failed to search the Arctic Shift archive for: ${query}`
    const attempt = await Try.async(async (): Promise<Page<RedditPost>> => {
      if (subreddit === undefined) {
        throw new ValidationError(
          "Keyless search needs a subreddit: the Arctic Shift archive cannot search all of Reddit. Pass `subreddit`.",
        )
      }
      const size = clampLimit(limit)
      const posts = await this.request<readonly RedditApiPostData[]>("/posts/search", {
        subreddit: singleSubreddit(subreddit),
        query,
        ...(since !== undefined ? { after: since } : {}),
        sort: "desc",
        limit: String(size),
        ...cursorParam(after),
      })
      return pageOf(posts.map(parsePostData), size)
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  // Subreddit search by name prefix (Arctic has no description search). Ordered by subscribers.
  async searchSubreddits(query: string, limit: number = 25): Promise<Either<RedditError, Page<RedditPost>>> {
    const context = `Failed to search subreddits in the Arctic Shift archive for: ${query}`
    const attempt = await Try.async(async (): Promise<Page<RedditPost>> => {
      const prefix = query.trim().replace(/^\/?r\//i, "")
      if (!/^[A-Za-z0-9_]+$/.test(prefix)) {
        throw new ValidationError(
          "Keyless subreddit search matches name prefixes only. Use one word of letters, digits, or underscores.",
        )
      }
      const subs = await this.request<readonly ArcticSubreddit[]>("/subreddits/search", {
        subreddit_prefix: prefix,
        limit: String(clampLimit(limit)),
      })
      return { items: subs.map(parseSubredditSearchData), source: "arctic" }
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getPost(postId: string): Promise<Either<RedditError, RedditPost>> {
    const context = `Failed to get post ${postId} from the Arctic Shift archive`
    const attempt = await Try.async(async (): Promise<RedditPost> => this.fetchPost(postId))
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  private async fetchPost(postId: string): Promise<RedditPost> {
    const posts = await this.request<readonly RedditApiPostData[]>("/posts/ids", { ids: normalizeThingId(postId) })
    const post = posts.at(0)
    if (post === undefined) {
      throw new NotFoundError(`Post ${postId} is not in the Arctic Shift archive`)
    }
    return parsePostData(post)
  }

  async getPostComments(postId: string, limit: number = 100): Promise<Either<RedditError, PostComments>> {
    const context = `Failed to get comments for post ${postId} from the Arctic Shift archive`
    const attempt = await Try.async(async () => {
      const post = await this.fetchPost(postId)
      const tree = await this.request<readonly ArcticCommentNode[]>("/comments/tree", {
        link_id: `t3_${post.id}`,
        limit: String(clampLimit(limit, MAX_COMMENT_TREE_LIMIT)),
      })
      return { post, comments: parseCommentTree(tree, post.title), moreIds: collectMoreIds(tree) }
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  // Expand "load more" stubs by fetching the collapsed comments directly by id.
  async getComments(commentIds: readonly string[]): Promise<Either<RedditError, readonly RedditComment[]>> {
    const context = "Failed to expand comments from the Arctic Shift archive"
    const attempt = await Try.async(async (): Promise<readonly RedditComment[]> => {
      const comments = await this.request<readonly RedditApiCommentTreeData[]>("/comments/ids", {
        ids: commentIds.map((id) => normalizeThingId(id)).join(","),
      })
      return comments.map((comment) => parseCommentData(comment))
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  // Arctic keeps aggregate stats only: karma and first-seen activity. Account creation date and
  // mod/gold/employee flags are unknown, so createdUtc is the earliest archived post or comment.
  async getUser(username: string): Promise<Either<RedditError, RedditUser>> {
    const context = `Failed to get user ${username} from the Arctic Shift archive`
    const attempt = await Try.async(async (): Promise<RedditUser> => {
      const users = await this.request<readonly ArcticUser[]>("/users/search", { author: normalizeUsername(username) })
      const user = users.at(0)
      if (user === undefined) {
        throw new NotFoundError(`User ${username} is not in the Arctic Shift archive`)
      }
      const meta = user._meta ?? {}
      const linkKarma = meta.post_karma ?? 0
      const commentKarma = meta.comment_karma ?? 0
      const firstSeen = [meta.earliest_post_at, meta.earliest_comment_at].filter(
        (value): value is number => typeof value === "number",
      )
      return {
        name: user.author,
        id: user.id ?? "",
        commentKarma,
        linkKarma,
        totalKarma: meta.total_karma ?? linkKarma + commentKarma,
        isMod: false,
        isGold: false,
        isEmployee: false,
        createdUtc: firstSeen.length > 0 ? Math.min(...firstSeen) : 0,
        profileUrl: `https://reddit.com/user/${user.author}`,
      }
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getUserPosts(
    username: string,
    limit: number = 25,
    after?: string,
  ): Promise<Either<RedditError, Page<RedditPost>>> {
    const context = `Failed to get posts for user ${username} from the Arctic Shift archive`
    const attempt = await Try.async(async (): Promise<Page<RedditPost>> => {
      const size = clampLimit(limit)
      const posts = await this.request<readonly RedditApiPostData[]>("/posts/search", {
        author: normalizeUsername(username),
        sort: "desc",
        limit: String(size),
        ...cursorParam(after),
      })
      return pageOf(posts.map(parsePostData), size)
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getUserComments(
    username: string,
    limit: number = 25,
    after?: string,
  ): Promise<Either<RedditError, Page<RedditComment>>> {
    const context = `Failed to get comments for user ${username} from the Arctic Shift archive`
    const attempt = await Try.async(async (): Promise<Page<RedditComment>> => {
      const size = clampLimit(limit)
      const comments = await this.request<readonly RedditApiCommentTreeData[]>("/comments/search", {
        author: normalizeUsername(username),
        sort: "desc",
        limit: String(size),
        ...cursorParam(after),
      })
      return pageOf(
        comments.map((comment) => parseCommentData(comment)),
        size,
      )
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getSubredditInfo(subreddit: string): Promise<Either<RedditError, RedditSubreddit>> {
    const context = `Failed to get r/${subreddit} from the Arctic Shift archive`
    const attempt = await Try.async(async (): Promise<RedditSubreddit> => {
      const subs = await this.request<readonly ArcticSubreddit[]>("/subreddits/search", {
        subreddit: singleSubreddit(subreddit),
      })
      const sub = subs.at(0)
      if (sub === undefined) {
        throw new NotFoundError(`r/${subreddit} is not in the Arctic Shift archive`)
      }
      return parseSubredditData(sub)
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getSubredditRules(subreddit: string): Promise<Either<RedditError, readonly RedditRule[]>> {
    const context = `Failed to get rules for r/${subreddit} from the Arctic Shift archive`
    const attempt = await Try.async(async (): Promise<readonly RedditRule[]> => {
      const entries = await this.request<readonly ArcticRules[]>("/subreddits/rules", {
        subreddits: singleSubreddit(subreddit),
      })
      const entry = entries.at(0)
      if (entry === undefined) {
        throw new NotFoundError(`No rules for r/${subreddit} in the Arctic Shift archive`)
      }
      return entry.rules.map(parseRuleData)
    })
    return attempt.toEither((error) => classifyRedditError(error, context))
  }
}
