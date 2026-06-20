/* eslint-disable functype/prefer-either --
 * This module is the imperative-to-functional boundary for the Reddit HTTP client.
 * Each public method runs its failure-producing region inside a `Try` and converts the
 * result to `Either<RedditError, T>` via the total `classifyRedditError`. Because the body
 * of `Try.async(() => Promise<T>)` can only signal failure by throwing, the `throw`s here
 * (HTTP/validation/domain errors, and the validateWriteAccess/checkDuplicateContent helpers
 * they call) are local control-flow captured by that `Try` — they never escape the method
 * boundary. prefer-either's "return Either.left" suggestion does not apply inside a Try body.
 */
import crypto from "crypto"
import type { Either } from "functype"
import { Left, Option, Right, Try } from "functype"

import type {
  BotDisclosureConfig,
  ContentRecord,
  Page,
  RedditApiCommentResponse,
  RedditApiCommentTreeData,
  RedditApiEditResponse,
  RedditApiInfoResponse,
  RedditApiLinkFlairResponse,
  RedditApiListingResponse,
  RedditApiMeResponse,
  RedditApiMoreChildrenResponse,
  RedditApiPopularSubredditsResponse,
  RedditApiPostCommentsResponse,
  RedditApiPostData,
  RedditApiRulesResponse,
  RedditApiSubmitResponse,
  RedditApiSubredditResponse,
  RedditApiUserResponse,
  RedditAuthMode,
  RedditClientConfig,
  RedditComment,
  RedditFlair,
  RedditPost,
  RedditRule,
  RedditSubreddit,
  RedditUser,
  RetryConfig,
  SafeModeConfig,
} from "../types"
import type { RedditError } from "./errors"
import {
  ApiError,
  classifyRedditError,
  HttpError,
  isRedditError,
  NotAuthenticatedError,
  NotFoundError,
  ValidationError,
} from "./errors"
import { ResponseCache } from "./response-cache"

// Extract Reddit's pagination cursors from a listing's `data`. Reddit returns `after`/`before`
// as a fullname string or null; we surface only present string cursors (no undefined keys, so
// this is safe under exactOptionalPropertyTypes).
function listingCursor(data: { readonly [key: string]: unknown }): Pick<Page<unknown>, "after" | "before"> {
  const after = typeof data.after === "string" ? { after: data.after } : {}
  const before = typeof data.before === "string" ? { before: data.before } : {}
  return { ...after, ...before }
}

function parsePostData(post: RedditApiPostData): RedditPost {
  return {
    id: post.id,
    title: post.title,
    author: post.author,
    subreddit: post.subreddit,
    selftext: post.selftext,
    url: post.url,
    score: post.score,
    upvoteRatio: post.upvote_ratio,
    numComments: post.num_comments,
    createdUtc: post.created_utc,
    over18: post.over_18,
    spoiler: post.spoiler,
    edited: Boolean(post.edited),
    isSelf: post.is_self,
    linkFlairText: post.link_flair_text ?? undefined,
    permalink: post.permalink,
  }
}

export class RedditClient {
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly userAgent: string
  private readonly username?: string
  private readonly password?: string
  private readonly baseUrl: string
  private readonly authMode: RedditAuthMode
  private readonly hasCredentials: boolean
  private readonly safeMode: SafeModeConfig
  private readonly botDisclosure: BotDisclosureConfig
  private readonly cache?: ResponseCache
  private readonly retry: RetryConfig

  // Mutable state — inherent to a stateful HTTP client with token refresh

  private accessToken?: string

  private tokenExpiry: number = 0

  private authenticated: boolean = false

  private lastWriteTime: number = 0

  private recentContentRecords: ContentRecord[] = []

  constructor(config: RedditClientConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.userAgent = config.userAgent
    this.username = config.username
    this.password = config.password
    this.authMode = config.authMode ?? "auto"
    this.hasCredentials = Boolean(this.clientId && this.clientSecret)
    this.baseUrl = this.determineBaseUrl()

    this.safeMode = config.safeMode ?? {
      enabled: false,
      mode: "off",
      writeDelayMs: 0,
      duplicateCheck: false,
      maxRecentHashes: 10,
    }

    this.botDisclosure = config.botDisclosure ?? { enabled: false, footer: "" }

    this.cache = config.cache?.enabled === true ? new ResponseCache({ maxBytes: config.cache.maxBytes }) : undefined

    this.retry = config.retry ?? { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 60000 }
  }

  private determineBaseUrl(): string {
    switch (this.authMode) {
      case "authenticated":
        return "https://oauth.reddit.com"
      case "anonymous":
        return "https://www.reddit.com"
      case "auto":
        return this.hasCredentials ? "https://oauth.reddit.com" : "https://www.reddit.com"
    }
  }

  // Low-level HTTP boundary. Returns Either<Error, Response>: a Right even for non-ok HTTP
  // statuses (callers inspect response.ok); only thrown failures (network, auth) become Left.
  private async makeRequest(path: string, options: RequestInit = {}): Promise<Either<Error, Response>> {
    const attempt = await Try.async(async (): Promise<Response> => {
      const url = `${this.baseUrl}${path}`
      const method = (options.method ?? "GET").toUpperCase()
      const cacheable = this.cache !== undefined && method === "GET"

      if (cacheable) {
        const cached = this.cache!.get(url)
        if (cached !== undefined) {
          return new Response(cached.body, { status: cached.status })
        }
      }

      const requiresAuth = this.authMode === "authenticated" || (this.authMode === "auto" && this.hasCredentials)

      if (requiresAuth && (Date.now() >= this.tokenExpiry || !this.authenticated)) {
        const authResult = await this.authenticate()
        authResult.orThrow()
      }

      const headers: Record<string, string> = {
        "User-Agent": this.userAgent,

        ...(options.headers as Record<string, string> | undefined),
      }

      if (requiresAuth && this.accessToken !== undefined) {
        headers["Authorization"] = `Bearer ${this.accessToken}`
      }

      const first = await this.fetchWithRetry(url, options, headers, path, 0)

      // 401 once-off re-auth, then retry the request (which itself honors 429 backoff).
      const response =
        first.status === 401 && this.authenticated
          ? await this.fetchWithRetry(url, options, { ...headers, Authorization: await this.reauthorize() }, path, 0)
          : first

      // Cache successful read responses and return a fresh, readable Response.
      // (A fetch Response body can only be consumed once, so we re-wrap the text.)
      if (cacheable && response.ok) {
        const text = await response.text()
        this.cache!.set(url, text, response.status)
        return new Response(text, { status: response.status })
      }

      return response
    })

    return attempt.toEither((error) => error)
  }

  async authenticate(): Promise<Either<Error, void>> {
    if (this.authMode === "anonymous") {
      this.authenticated = false
      return Right(undefined as void)
    }

    if (this.authMode === "authenticated" && !this.hasCredentials) {
      return Left(new Error("Authenticated mode requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET"))
    }

    if (this.authMode === "auto" && !this.hasCredentials) {
      this.authenticated = false
      return Right(undefined as void)
    }

    const attempt = await Try.async(async (): Promise<void> => {
      const now = Date.now()
      if (this.accessToken !== undefined && now < this.tokenExpiry) {
        return
      }

      const authUrl = "https://www.reddit.com/api/v1/access_token"
      const authData = new URLSearchParams()

      const { username } = this
      const { password } = this
      const isUserAuth = Boolean(username && password)
      if (isUserAuth && username !== undefined && password !== undefined) {
        authData.append("grant_type", "password")
        authData.append("username", username)
        authData.append("password", password)
      } else {
        authData.append("grant_type", "client_credentials")
      }

      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")
      const response = await fetch(authUrl, {
        method: "POST",
        headers: {
          "User-Agent": this.userAgent,
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: authData.toString(),
      })

      if (!response.ok) {
        const statusText = response.statusText !== "" ? response.statusText : "Unknown Error"
        throw new Error(`Authentication failed: ${response.status} ${statusText}`)
      }

      const data = (await response.json()) as { access_token: string; expires_in: number }
      this.accessToken = data.access_token
      this.tokenExpiry = now + data.expires_in * 1000
      this.authenticated = true
    })

    return attempt.toEither((error) => error)
  }

  async checkAuthentication(): Promise<boolean> {
    if (!this.authenticated) {
      const result = await this.authenticate()
      return result.isRight()
    }
    return true
  }

  private validateWriteAccess(): void {
    if (this.username === undefined || this.password === undefined) {
      if (this.authMode === "anonymous") {
        throw new NotAuthenticatedError(
          "Write operations not available in anonymous mode. " +
            "Set REDDIT_USERNAME, REDDIT_PASSWORD and use 'auto' or 'authenticated' mode.",
        )
      }
      throw new NotAuthenticatedError("Write operations require REDDIT_USERNAME and REDDIT_PASSWORD")
    }
  }

  private async enforceWriteRateLimit(): Promise<void> {
    if (!this.safeMode.enabled || this.safeMode.writeDelayMs <= 0) {
      return
    }

    const now = Date.now()
    const elapsed = now - this.lastWriteTime
    if (elapsed < this.safeMode.writeDelayMs) {
      const waitTime = this.safeMode.writeDelayMs - elapsed
      console.error(`[SafeMode] Rate limit: waiting ${waitTime}ms before write operation`)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
    this.lastWriteTime = Date.now()
  }

  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content.trim().toLowerCase()).digest("hex")
  }

  private checkDuplicateContent(content: string, subreddit?: string): void {
    if (!this.safeMode.enabled || !this.safeMode.duplicateCheck) {
      return
    }

    const hash = this.hashContent(content)

    const duplicate = this.recentContentRecords.find((record) => record.hash === hash)
    if (duplicate !== undefined) {
      if (subreddit !== undefined && duplicate.subreddit !== "" && subreddit !== duplicate.subreddit) {
        throw new ValidationError(
          "Cross-subreddit duplicate detected. Reddit's Responsible Builder Policy prohibits " +
            "posting identical or substantially similar content across multiple subreddits. " +
            "Please create unique content for each subreddit.",
        )
      }
      throw new ValidationError(
        "Duplicate content detected. Reddit's spam filter may ban your account for posting identical content. " +
          "Please modify your content and try again.",
      )
    }

    this.recentContentRecords.push({
      hash,
      subreddit: subreddit ?? "",
      timestamp: Date.now(),
    })

    this.recentContentRecords = this.recentContentRecords.slice(-this.safeMode.maxRecentHashes)
  }

  // Re-authenticate and return a fresh Bearer header value (throws via orThrow on failure).
  private async reauthorize(): Promise<string> {
    const result = await this.authenticate()
    result.orThrow()
    return `Bearer ${this.accessToken}`
  }

  // Fetch with transparent retry on HTTP 429. Honors Retry-After / x-ratelimit-reset, else
  // exponential backoff; surfaces the 429 once retries are exhausted or the required wait
  // exceeds the cap. Recursive (not a loop) to satisfy the functional style.
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    headers: Record<string, string>,
    path: string,
    attempt: number,
  ): Promise<Response> {
    const response = await fetch(url, { ...options, headers })
    if (response.status !== 429 || attempt >= this.retry.maxRetries) {
      return response
    }

    const wait = this.retryAfterMs(response).fold(
      () => Math.min(this.retry.baseDelayMs * 2 ** attempt, this.retry.maxDelayMs),
      (ms) => ms,
    )
    if (wait > this.retry.maxDelayMs) {
      return response
    }

    console.error(`[RateLimit] 429 from ${path} — retry ${attempt + 1}/${this.retry.maxRetries} in ${wait}ms`)
    await new Promise((resolve) => setTimeout(resolve, wait))
    return this.fetchWithRetry(url, options, headers, path, attempt + 1)
  }

  // Parse a retry delay (ms) from a 429 response: prefer Retry-After (delta-seconds or
  // HTTP-date), then x-ratelimit-reset (seconds). None when no usable header is present,
  // signalling the caller to fall back to exponential backoff.
  private retryAfterMs(response: Response): Option<number> {
    const { headers } = response

    const retryAfter = headers.get("retry-after")
    if (retryAfter !== null && retryAfter !== "") {
      const seconds = Number(retryAfter)
      if (!Number.isNaN(seconds)) {
        return Option(seconds * 1000)
      }
      const when = Date.parse(retryAfter)
      if (!Number.isNaN(when)) {
        return Option(Math.max(0, when - Date.now()))
      }
    }

    const reset = headers.get("x-ratelimit-reset")
    if (reset !== null && reset !== "") {
      const seconds = Number(reset)
      if (!Number.isNaN(seconds)) {
        return Option(seconds * 1000)
      }
    }

    return Option.none()
  }

  private appendBotDisclosure(content: string): string {
    if (!this.botDisclosure.enabled || this.botDisclosure.footer === "") {
      return content
    }
    return `${content}${this.botDisclosure.footer}`
  }

  async getUser(username: string): Promise<Either<RedditError, RedditUser>> {
    const context = `Failed to get user info for ${username}`
    const attempt = await Try.async(async (): Promise<RedditUser> => {
      const response = (await this.makeRequest(`/user/${username}/about.json`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiUserResponse
      const { data } = json

      return {
        name: data.name,
        id: data.id,
        commentKarma: data.comment_karma,
        linkKarma: data.link_karma,
        totalKarma: data.total_karma ?? data.comment_karma + data.link_karma,
        isMod: data.is_mod,
        isGold: data.is_gold,
        isEmployee: data.is_employee,
        createdUtc: data.created_utc,
        profileUrl: `https://reddit.com/user/${data.name}`,
      }
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  // The authenticated user's own account (requires user credentials — /api/v1/me needs identity).
  async getMe(): Promise<Either<RedditError, RedditUser>> {
    const context = "Failed to get authenticated user info"
    const attempt = await Try.async(async (): Promise<RedditUser> => {
      const response = (await this.makeRequest("/api/v1/me")).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      const data = (await response.json()) as RedditApiMeResponse
      return {
        name: data.name,
        id: data.id,
        commentKarma: data.comment_karma,
        linkKarma: data.link_karma,
        totalKarma: data.total_karma ?? data.comment_karma + data.link_karma,
        isMod: data.is_mod,
        isGold: data.is_gold,
        isEmployee: data.is_employee,
        createdUtc: data.created_utc,
        profileUrl: `https://reddit.com/user/${data.name}`,
      }
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getSubredditInfo(subredditName: string): Promise<Either<RedditError, RedditSubreddit>> {
    const context = `Failed to get subreddit info for ${subredditName}`
    const attempt = await Try.async(async (): Promise<RedditSubreddit> => {
      const response = (await this.makeRequest(`/r/${subredditName}/about.json`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiSubredditResponse
      const { data } = json

      return {
        displayName: data.display_name,
        title: data.title,
        description: data.description,
        publicDescription: data.public_description,
        subscribers: data.subscribers,
        activeUserCount: data.active_user_count ?? undefined,
        createdUtc: data.created_utc,
        over18: data.over18,
        subredditType: data.subreddit_type,
        url: data.url,
      }
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getSubredditRules(subreddit: string): Promise<Either<RedditError, readonly RedditRule[]>> {
    const context = `Failed to get rules for r/${subreddit}`
    const attempt = await Try.async(async (): Promise<readonly RedditRule[]> => {
      const response = (await this.makeRequest(`/r/${subreddit}/about/rules.json`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiRulesResponse
      return json.rules.map((rule) => ({
        shortName: rule.short_name,
        description: rule.description,
        kind: rule.kind,
        violationReason: rule.violation_reason,
        priority: rule.priority,
        createdUtc: rule.created_utc,
      }))
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getPostFlairs(subreddit: string): Promise<Either<RedditError, readonly RedditFlair[]>> {
    const context = `Failed to get post flairs for r/${subreddit}`
    const attempt = await Try.async(async (): Promise<readonly RedditFlair[]> => {
      const response = (await this.makeRequest(`/r/${subreddit}/api/link_flair_v2.json`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiLinkFlairResponse
      return json.map((flair) => ({
        id: flair.id,
        text: flair.text,
        type: flair.type,
        textEditable: flair.text_editable,
      }))
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getTopPosts(
    subreddit: string,
    timeFilter: string = "week",
    limit: number = 10,
    after?: string,
  ): Promise<Either<RedditError, Page<RedditPost>>> {
    const endpoint = subreddit !== "" ? `/r/${subreddit}/top.json` : "/top.json"
    const params = new URLSearchParams({
      t: timeFilter,
      limit: limit.toString(),
    })
    if (after !== undefined) {
      params.set("after", after)
    }
    const context = `Failed to get top posts for ${subreddit !== "" ? subreddit : "home"}`

    const attempt = await Try.async(async (): Promise<Page<RedditPost>> => {
      const response = (await this.makeRequest(`${endpoint}?${params}`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `Failed to get top posts: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>
      const items = json.data.children.map((child) => parsePostData(child.data))
      return { items, ...listingCursor(json.data) }
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async browseSubreddit(
    subreddit: string,
    sort: string = "hot",
    timeFilter: string = "week",
    limit: number = 10,
    after?: string,
  ): Promise<Either<RedditError, Page<RedditPost>>> {
    const validSorts = ["hot", "new", "top", "rising", "controversial"]
    if (!validSorts.includes(sort)) {
      return Left(new ValidationError(`Invalid sort "${sort}". Valid options are: ${validSorts.join(", ")}`))
    }

    const endpoint = subreddit !== "" ? `/r/${subreddit}/${sort}.json` : `/${sort}.json`
    const params = new URLSearchParams({ limit: limit.toString() })
    // The time filter only applies to top/controversial listings.
    if (sort === "top" || sort === "controversial") {
      params.set("t", timeFilter)
    }
    if (after !== undefined) {
      params.set("after", after)
    }
    const home = subreddit !== "" ? subreddit : "home"
    const context = `Failed to browse r/${home} (${sort})`

    const attempt = await Try.async(async (): Promise<Page<RedditPost>> => {
      const response = (await this.makeRequest(`${endpoint}?${params}`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `Failed to browse r/${home}: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>
      const items = json.data.children.map((child) => parsePostData(child.data))
      return { items, ...listingCursor(json.data) }
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getPost(postId: string, subreddit?: string): Promise<Either<RedditError, RedditPost>> {
    const endpoint = Option(subreddit).fold(
      () => `/api/info.json?id=t3_${postId}`,
      (sr) => `/r/${sr}/comments/${postId}.json`,
    )
    const context = `Failed to get post with ID ${postId}`

    const attempt = await Try.async(async (): Promise<RedditPost> => {
      const response = (await this.makeRequest(endpoint)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      if (subreddit !== undefined) {
        const json = (await response.json()) as [RedditApiListingResponse<RedditApiPostData>, unknown]
        return parsePostData(json[0].data.children[0].data)
      }

      const json = (await response.json()) as RedditApiInfoResponse
      if (json.data.children.length === 0) {
        throw new NotFoundError(`Post with ID ${postId} not found`)
      }
      return parsePostData(json.data.children[0].data)
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getTrendingSubreddits(limit: number = 5): Promise<Either<RedditError, readonly string[]>> {
    const params = new URLSearchParams({ limit: limit.toString() })
    const context = `Failed to get trending subreddits`

    const attempt = await Try.async(async (): Promise<readonly string[]> => {
      const response = (await this.makeRequest(`/subreddits/popular.json?${params}`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiPopularSubredditsResponse
      return json.data.children.map((child) => child.data.display_name)
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async createPost(
    subreddit: string,
    title: string,
    content: string,
    isSelf: boolean = true,
    flairId?: string,
    flairText?: string,
  ): Promise<Either<RedditError, RedditPost>> {
    const attempt = await Try.async(async (): Promise<RedditPost> => {
      this.validateWriteAccess()
      await this.enforceWriteRateLimit()
      this.checkDuplicateContent(title + content, subreddit)

      const finalContent = isSelf ? this.appendBotDisclosure(content) : content
      const kind = isSelf ? "self" : "link"
      const params = new URLSearchParams()
      params.append("sr", subreddit)
      params.append("kind", kind)
      params.append("title", title)
      params.append(isSelf ? "text" : "url", finalContent)
      params.append("api_type", "json")
      if (flairId !== undefined) {
        params.append("flair_id", flairId)
      }
      if (flairText !== undefined) {
        params.append("flair_text", flairText)
      }

      const response = (
        await this.makeRequest("/api/submit", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        })
      ).orThrow()

      if (!response.ok) {
        throw new HttpError(response.status, `Failed to create post: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiSubmitResponse

      if (json.json.errors !== undefined && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e) => e[1]).join(", ")
        throw new ApiError(`Reddit API errors: ${errors}`)
      }

      const postId = json.json.data?.id ?? json.json.data?.name?.replace("t3_", "")

      if (postId === undefined) {
        throw new ApiError("No post ID returned from Reddit")
      }

      return (await this.getPost(postId, subreddit)).orThrow()
    })

    return attempt.toEither((error) => classifyRedditError(error))
  }

  async checkPostExists(postId: string): Promise<boolean> {
    const attempt = await Try.async(async (): Promise<boolean> => {
      const response = (await this.makeRequest(`/api/info.json?id=t3_${postId}`)).orThrow()
      if (!response.ok) {
        return false
      }

      const json = (await response.json()) as RedditApiInfoResponse
      return json.data.children.length > 0
    })

    return attempt.orElse(false)
  }

  async replyToPost(postId: string, content: string): Promise<Either<RedditError, RedditComment>> {
    const attempt = await Try.async(async (): Promise<RedditComment> => {
      this.validateWriteAccess()
      await this.enforceWriteRateLimit()
      this.checkDuplicateContent(content)

      const finalContent = this.appendBotDisclosure(content)
      const fullThingId = postId.startsWith("t3_") || postId.startsWith("t1_") ? postId : `t3_${postId}`

      if (!postId.startsWith("t1_")) {
        const exists = await this.checkPostExists(postId.replace(/^t3_/, ""))
        if (!exists) {
          throw new NotFoundError(`Post with ID ${postId} does not exist or is not accessible`)
        }
      }

      const params = new URLSearchParams()
      params.append("thing_id", fullThingId)
      params.append("text", finalContent)
      params.append("api_type", "json")

      const response = (
        await this.makeRequest("/api/comment", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        })
      ).orThrow()

      if (!response.ok) {
        throw new HttpError(response.status, `Failed to reply: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiCommentResponse

      if (json.json.data?.things !== undefined && json.json.data.things.length > 0) {
        const commentData = json.json.data.things[0].data
        const author = this.username ?? "[unknown]"
        return {
          id: commentData.id,
          author,
          body: content,
          score: 1,
          controversiality: 0,
          subreddit: commentData.subreddit,
          submissionTitle: commentData.link_title ?? "",
          createdUtc: Date.now() / 1000,
          edited: false,
          isSubmitter: false,
          permalink: commentData.permalink,
        }
      } else if (json.json.errors !== undefined && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e) => e[1]).join(", ")
        throw new ApiError(`Reddit API errors: ${errors}`)
      } else {
        throw new ApiError("Failed to parse reply response")
      }
    })

    return attempt.toEither((error) => classifyRedditError(error))
  }

  async deletePost(thingId: string): Promise<Either<RedditError, boolean>> {
    const attempt = await Try.async(async (): Promise<boolean> => {
      this.validateWriteAccess()

      const fullThingId = thingId.startsWith("t3_") || thingId.startsWith("t1_") ? thingId : `t3_${thingId}`

      const params = new URLSearchParams()
      params.append("id", fullThingId)

      const response = (
        await this.makeRequest("/api/del", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        })
      ).orThrow()

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Reddit API] Delete failed: ${response.status} ${response.statusText}`)
        console.error(`[Reddit API] Error response: ${errorText}`)
        throw new HttpError(response.status, `HTTP ${response.status}: ${errorText}`)
      }

      console.error(`[Reddit API] Successfully deleted ${fullThingId}`)
      return true
    })

    return attempt.toEither((error) => {
      if (!isRedditError(error)) {
        console.error(`[Reddit API] Delete exception:`, error)
      }
      return classifyRedditError(error)
    })
  }

  async deleteComment(thingId: string): Promise<Either<RedditError, boolean>> {
    const fullThingId = thingId.startsWith("t1_") ? thingId : `t1_${thingId}`
    return this.deletePost(fullThingId)
  }

  async editPost(thingId: string, newText: string): Promise<Either<RedditError, boolean>> {
    const attempt = await Try.async(async (): Promise<boolean> => {
      this.validateWriteAccess()
      await this.enforceWriteRateLimit()
      this.checkDuplicateContent(newText)

      const finalText = this.appendBotDisclosure(newText)
      const fullThingId = thingId.startsWith("t3_") || thingId.startsWith("t1_") ? thingId : `t3_${thingId}`

      const params = new URLSearchParams()
      params.append("thing_id", fullThingId)
      params.append("text", finalText)
      params.append("api_type", "json")

      const response = (
        await this.makeRequest("/api/editusertext", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        })
      ).orThrow()

      if (!response.ok) {
        throw new HttpError(response.status, `Failed to edit: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiEditResponse

      if (json.json.errors !== undefined && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e) => e[1]).join(", ")
        throw new ApiError(`Reddit API errors: ${errors}`)
      }

      return true
    })

    return attempt.toEither((error) => classifyRedditError(error))
  }

  async editComment(thingId: string, newText: string): Promise<Either<RedditError, boolean>> {
    const fullThingId = thingId.startsWith("t1_") ? thingId : `t1_${thingId}`
    return this.editPost(fullThingId, newText)
  }

  async searchReddit(
    query: string,
    options: {
      readonly subreddit?: string
      readonly sort?: string
      readonly timeFilter?: string
      readonly limit?: number
      readonly type?: string
      readonly after?: string
      readonly before?: string
    } = {},
  ): Promise<Either<RedditError, Page<RedditPost>>> {
    const { subreddit, sort = "relevance", timeFilter = "all", limit = 25, type = "link", after, before } = options
    const endpoint = Option(subreddit).fold(
      () => "/search.json",
      (sr) => `/r/${sr}/search.json`,
    )

    const params = new URLSearchParams({
      q: query,
      sort,
      t: timeFilter,
      limit: limit.toString(),
      type,
      // eslint-disable-next-line functype/prefer-fold -- conditional spread of native string | undefined into URLSearchParams init
      ...(subreddit !== undefined ? { restrict_sr: "true" } : {}),
      // eslint-disable-next-line functype/prefer-fold -- conditional spread of cursors into URLSearchParams init
      ...(after !== undefined ? { after } : {}),
      // eslint-disable-next-line functype/prefer-fold -- conditional spread of cursors into URLSearchParams init
      ...(before !== undefined ? { before } : {}),
    })
    const context = `Failed to search Reddit for: ${query}`

    const attempt = await Try.async(async (): Promise<Page<RedditPost>> => {
      const response = (await this.makeRequest(`${endpoint}?${params}`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `Failed to search Reddit: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>

      const items = json.data.children.filter((child) => child.kind === "t3").map((child) => parsePostData(child.data))
      return { items, ...listingCursor(json.data) }
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getPostComments(
    postId: string,
    subreddit: string,
    options: {
      readonly sort?: string
      readonly limit?: number
    } = {},
  ): Promise<Either<RedditError, { readonly post: RedditPost; readonly comments: readonly RedditComment[] }>> {
    const { sort = "best", limit = 100 } = options
    const params = new URLSearchParams({
      sort,
      limit: limit.toString(),
    })
    const context = `Failed to get comments for post ${postId}`

    const attempt = await Try.async(
      async (): Promise<{ readonly post: RedditPost; readonly comments: readonly RedditComment[] }> => {
        const response = (await this.makeRequest(`/r/${subreddit}/comments/${postId}.json?${params}`)).orThrow()
        if (!response.ok) {
          throw new HttpError(response.status, `Failed to get comments: HTTP ${response.status}`)
        }

        const json = (await response.json()) as RedditApiPostCommentsResponse

        const postData = json[0].data.children[0].data
        const post = parsePostData(postData)

        const parseComments = (
          commentData: ReadonlyArray<{ readonly kind: string; readonly data: RedditApiCommentTreeData }>,
          depth: number = 0,
        ): readonly RedditComment[] =>
          commentData.flatMap((item) => {
            if (item.kind !== "t1" || item.data.body === undefined) return []

            const comment: RedditComment = {
              id: item.data.id,
              author: item.data.author,
              body: item.data.body,
              score: item.data.score,
              controversiality: item.data.controversiality,
              subreddit: item.data.subreddit,
              submissionTitle: post.title,
              createdUtc: item.data.created_utc,
              edited: Boolean(item.data.edited),
              isSubmitter: item.data.is_submitter,
              permalink: item.data.permalink,
              depth,
              parentId: item.data.parent_id,
            }

            const { replies } = item.data
            const childComments =
              replies !== undefined && typeof replies !== "string"
                ? parseComments(replies.data.children, depth + 1)
                : []

            return [comment, ...childComments]
          })

        const comments: readonly RedditComment[] = parseComments(json[1].data.children)

        return { post, comments }
      },
    )

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  // Expand "load more" comment stubs via /api/morechildren. `commentIds` are the ids from a
  // `more` node returned by getPostComments. Returns a flat list of the expanded comments.
  async getMoreComments(
    linkId: string,
    commentIds: readonly string[],
  ): Promise<Either<RedditError, readonly RedditComment[]>> {
    const fullLinkId = linkId.startsWith("t3_") ? linkId : `t3_${linkId}`
    const context = `Failed to expand comments for ${fullLinkId}`
    const params = new URLSearchParams({
      api_type: "json",
      link_id: fullLinkId,
      children: commentIds.join(","),
    })

    const attempt = await Try.async(async (): Promise<readonly RedditComment[]> => {
      const response = (await this.makeRequest(`/api/morechildren?${params}`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiMoreChildrenResponse
      const things = json.json.data?.things ?? []
      return things
        .filter((thing) => thing.kind === "t1" && thing.data.body !== undefined)
        .map((thing) => {
          const comment = thing.data
          return {
            id: comment.id,
            author: comment.author,
            body: comment.body ?? "",
            score: comment.score,
            controversiality: comment.controversiality,
            subreddit: comment.subreddit,
            submissionTitle: comment.link_title ?? "",
            createdUtc: comment.created_utc,
            edited: Boolean(comment.edited),
            isSubmitter: comment.is_submitter,
            permalink: comment.permalink,
            parentId: comment.parent_id,
          }
        })
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getUserPosts(
    username: string,
    options: {
      readonly sort?: string
      readonly timeFilter?: string
      readonly limit?: number
      readonly after?: string
    } = {},
  ): Promise<Either<RedditError, Page<RedditPost>>> {
    const { sort = "new", timeFilter = "all", limit = 25, after } = options
    const params = new URLSearchParams({
      sort,
      t: timeFilter,
      limit: limit.toString(),
    })
    if (after !== undefined) {
      params.set("after", after)
    }
    const context = `Failed to get posts for user ${username}`

    const attempt = await Try.async(async (): Promise<Page<RedditPost>> => {
      const response = (await this.makeRequest(`/user/${username}/submitted.json?${params}`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>

      const items = json.data.children.filter((child) => child.kind === "t3").map((child) => parsePostData(child.data))
      return { items, ...listingCursor(json.data) }
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }

  async getUserComments(
    username: string,
    options: {
      readonly sort?: string
      readonly timeFilter?: string
      readonly limit?: number
      readonly after?: string
    } = {},
  ): Promise<Either<RedditError, Page<RedditComment>>> {
    const { sort = "new", timeFilter = "all", limit = 25, after } = options
    const params = new URLSearchParams({
      sort,
      t: timeFilter,
      limit: limit.toString(),
    })
    if (after !== undefined) {
      params.set("after", after)
    }
    const context = `Failed to get comments for user ${username}`

    const attempt = await Try.async(async (): Promise<Page<RedditComment>> => {
      const response = (await this.makeRequest(`/user/${username}/comments.json?${params}`)).orThrow()
      if (!response.ok) {
        throw new HttpError(response.status, `${context}: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiCommentTreeData>

      const items = json.data.children
        .filter((child) => child.kind === "t1")
        .map((child) => {
          const comment = child.data
          return {
            id: comment.id,
            author: comment.author,
            body: comment.body ?? "",
            score: comment.score,
            controversiality: comment.controversiality,
            subreddit: comment.subreddit,
            submissionTitle: comment.link_title ?? "",
            createdUtc: comment.created_utc,
            edited: Boolean(comment.edited),
            isSubmitter: comment.is_submitter,
            permalink: comment.permalink,
          }
        })
      return { items, ...listingCursor(json.data) }
    })

    return attempt.toEither((error) => classifyRedditError(error, context))
  }
}

// Create and export singleton instance
const clientHolder: { instance: Option<RedditClient> } = { instance: Option.none() }

export function initializeRedditClient(config: RedditClientConfig): RedditClient {
  const client = new RedditClient(config)

  clientHolder.instance = Option(client)
  return client
}

export function getRedditClient(): Option<RedditClient> {
  return clientHolder.instance
}
