import crypto from "crypto"
import type { Either } from "functype"
import { Left, Option, Right } from "functype"

import type {
  BotDisclosureConfig,
  ContentRecord,
  RedditApiCommentResponse,
  RedditApiCommentTreeData,
  RedditApiEditResponse,
  RedditApiInfoResponse,
  RedditApiListingResponse,
  RedditApiPopularSubredditsResponse,
  RedditApiPostCommentsResponse,
  RedditApiPostData,
  RedditApiSubmitResponse,
  RedditApiSubredditResponse,
  RedditApiUserResponse,
  RedditAuthMode,
  RedditClientConfig,
  RedditComment,
  RedditPost,
  RedditSubreddit,
  RedditUser,
  SafeModeConfig,
} from "../types"

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
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

  private async makeRequest(path: string, options: RequestInit = {}): Promise<Either<Error, Response>> {
    try {
      const requiresAuth = this.authMode === "authenticated" || (this.authMode === "auto" && this.hasCredentials)

      if (requiresAuth && (Date.now() >= this.tokenExpiry || !this.authenticated)) {
        const authResult = await this.authenticate()
        authResult.orThrow()
      }

      const url = `${this.baseUrl}${path}`
      const headers: Record<string, string> = {
        "User-Agent": this.userAgent,
        ...(options.headers as Record<string, string> | undefined),
      }

      if (requiresAuth && this.accessToken !== undefined) {
        // eslint-disable-next-line functional/immutable-data
        headers["Authorization"] = `Bearer ${this.accessToken}`
      }

      const response = await fetch(url, {
        ...options,
        headers,
      })

      if (response.status === 401 && this.authenticated) {
        const reAuthResult = await this.authenticate()
        reAuthResult.orThrow()
        const retryHeaders = {
          ...headers,
          Authorization: `Bearer ${this.accessToken}`,
        }
        return Right(
          await fetch(url, {
            ...options,
            headers: retryHeaders,
          }),
        )
      }

      return Right(response)
    } catch (error) {
      return Left(toError(error))
    }
  }

  async authenticate(): Promise<Either<Error, void>> {
    if (this.authMode === "anonymous") {
      // eslint-disable-next-line functional/immutable-data
      this.authenticated = false
      return Right(undefined as void)
    }

    if (this.authMode === "authenticated" && !this.hasCredentials) {
      return Left(new Error("Authenticated mode requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET"))
    }

    if (this.authMode === "auto" && !this.hasCredentials) {
      // eslint-disable-next-line functional/immutable-data
      this.authenticated = false
      return Right(undefined as void)
    }

    try {
      const now = Date.now()
      if (this.accessToken !== undefined && now < this.tokenExpiry) {
        return Right(undefined as void)
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
        return Left(new Error(`Authentication failed: ${response.status} ${statusText}`))
      }

      const data = (await response.json()) as { access_token: string; expires_in: number }
      // eslint-disable-next-line functional/immutable-data
      this.accessToken = data.access_token
      // eslint-disable-next-line functional/immutable-data
      this.tokenExpiry = now + data.expires_in * 1000
      // eslint-disable-next-line functional/immutable-data
      this.authenticated = true
      return Right(undefined as void)
    } catch (error) {
      return Left(toError(error))
    }
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
        // eslint-disable-next-line functional/no-throw-statements
        throw new Error(
          "Write operations not available in anonymous mode. " +
            "Set REDDIT_USERNAME, REDDIT_PASSWORD and use 'auto' or 'authenticated' mode.",
        )
      }
      // eslint-disable-next-line functional/no-throw-statements
      throw new Error("Write operations require REDDIT_USERNAME and REDDIT_PASSWORD")
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
    // eslint-disable-next-line functional/immutable-data
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
        // eslint-disable-next-line functional/no-throw-statements
        throw new Error(
          "Cross-subreddit duplicate detected. Reddit's Responsible Builder Policy prohibits " +
            "posting identical or substantially similar content across multiple subreddits. " +
            "Please create unique content for each subreddit.",
        )
      }
      // eslint-disable-next-line functional/no-throw-statements
      throw new Error(
        "Duplicate content detected. Reddit's spam filter may ban your account for posting identical content. " +
          "Please modify your content and try again.",
      )
    }

    // eslint-disable-next-line functional/immutable-data
    this.recentContentRecords.push({
      hash,
      subreddit: subreddit ?? "",
      timestamp: Date.now(),
    })

    // eslint-disable-next-line functional/immutable-data
    this.recentContentRecords = this.recentContentRecords.slice(-this.safeMode.maxRecentHashes)
  }

  private appendBotDisclosure(content: string): string {
    if (!this.botDisclosure.enabled || this.botDisclosure.footer === "") {
      return content
    }
    return `${content}${this.botDisclosure.footer}`
  }

  async getUser(username: string): Promise<Either<Error, RedditUser>> {
    try {
      const response = (await this.makeRequest(`/user/${username}/about.json`)).orThrow()
      if (!response.ok) {
        return Left(new Error(`Failed to get user info for ${username}: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiUserResponse
      const { data } = json

      return Right({
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
      })
    } catch (error) {
      return Left(new Error(`Failed to get user info for ${username}: ${toError(error).message}`))
    }
  }

  async getSubredditInfo(subredditName: string): Promise<Either<Error, RedditSubreddit>> {
    try {
      const response = (await this.makeRequest(`/r/${subredditName}/about.json`)).orThrow()
      if (!response.ok) {
        return Left(new Error(`Failed to get subreddit info for ${subredditName}: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiSubredditResponse
      const { data } = json

      const subreddit: RedditSubreddit = {
        displayName: data.display_name,
        title: data.title,
        description: data.description ?? "",
        publicDescription: data.public_description ?? "",
        subscribers: data.subscribers,
        activeUserCount: data.active_user_count ?? undefined,
        createdUtc: data.created_utc,
        over18: data.over18,
        subredditType: data.subreddit_type,
        url: data.url,
      }

      return Right(subreddit)
    } catch (error) {
      return Left(new Error(`Failed to get subreddit info for ${subredditName}: ${toError(error).message}`))
    }
  }

  async getTopPosts(
    subreddit: string,
    timeFilter: string = "week",
    limit: number = 10,
  ): Promise<Either<Error, readonly RedditPost[]>> {
    const endpoint = subreddit !== "" ? `/r/${subreddit}/top.json` : "/top.json"
    const params = new URLSearchParams({
      t: timeFilter,
      limit: limit.toString(),
    })

    try {
      const response = (await this.makeRequest(`${endpoint}?${params}`)).orThrow()
      if (!response.ok) {
        return Left(new Error(`Failed to get top posts: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>
      const posts: readonly RedditPost[] = json.data.children.map((child) => parsePostData(child.data))
      return Right(posts)
    } catch (error) {
      return Left(
        new Error(`Failed to get top posts for ${subreddit !== "" ? subreddit : "home"}: ${toError(error).message}`),
      )
    }
  }

  async getPost(postId: string, subreddit?: string): Promise<Either<Error, RedditPost>> {
    const endpoint =
      subreddit !== undefined ? `/r/${subreddit}/comments/${postId}.json` : `/api/info.json?id=t3_${postId}`

    try {
      const response = (await this.makeRequest(endpoint)).orThrow()
      if (!response.ok) {
        return Left(new Error(`Failed to get post with ID ${postId}: HTTP ${response.status}`))
      }

      // eslint-disable-next-line functional/no-let
      let post: RedditApiPostData
      if (subreddit !== undefined) {
        const json = (await response.json()) as [RedditApiListingResponse<RedditApiPostData>, unknown]
        post = json[0].data.children[0].data
      } else {
        const json = (await response.json()) as RedditApiInfoResponse
        if (json.data.children.length === 0) {
          return Left(new Error(`Post with ID ${postId} not found`))
        }
        post = json.data.children[0].data
      }

      return Right(parsePostData(post))
    } catch (error) {
      return Left(new Error(`Failed to get post with ID ${postId}: ${toError(error).message}`))
    }
  }

  async getTrendingSubreddits(limit: number = 5): Promise<Either<Error, readonly string[]>> {
    const params = new URLSearchParams({ limit: limit.toString() })

    try {
      const response = (await this.makeRequest(`/subreddits/popular.json?${params}`)).orThrow()
      if (!response.ok) {
        return Left(new Error(`Failed to get trending subreddits: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiPopularSubredditsResponse
      const names: readonly string[] = json.data.children.map((child) => child.data.display_name)
      return Right(names)
    } catch (error) {
      return Left(new Error(`Failed to get trending subreddits: ${toError(error).message}`))
    }
  }

  async createPost(
    subreddit: string,
    title: string,
    content: string,
    isSelf: boolean = true,
  ): Promise<Either<Error, RedditPost>> {
    try {
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
        return Left(new Error(`Failed to create post: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiSubmitResponse

      if (json.json?.errors !== undefined && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e) => e[1] ?? e[0]).join(", ")
        return Left(new Error(`Reddit API errors: ${errors}`))
      }

      const postId = json.json?.data?.id ?? json.json?.data?.name?.replace("t3_", "")

      if (postId === undefined) {
        return Left(new Error("No post ID returned from Reddit"))
      }

      return this.getPost(postId, subreddit)
    } catch (error) {
      return Left(toError(error))
    }
  }

  async checkPostExists(postId: string): Promise<boolean> {
    try {
      const response = (await this.makeRequest(`/api/info.json?id=t3_${postId}`)).orThrow()
      if (!response.ok) {
        return false
      }

      const json = (await response.json()) as RedditApiInfoResponse
      return json.data.children.length > 0
    } catch {
      return false
    }
  }

  async replyToPost(postId: string, content: string): Promise<Either<Error, RedditComment>> {
    try {
      this.validateWriteAccess()
      await this.enforceWriteRateLimit()
      this.checkDuplicateContent(content)

      const finalContent = this.appendBotDisclosure(content)
      const fullThingId = postId.startsWith("t3_") || postId.startsWith("t1_") ? postId : `t3_${postId}`

      if (!postId.startsWith("t1_")) {
        const exists = await this.checkPostExists(postId.replace(/^t3_/, ""))
        if (!exists) {
          return Left(new Error(`Post with ID ${postId} does not exist or is not accessible`))
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
        return Left(new Error(`Failed to reply: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiCommentResponse

      if (json.json?.data?.things !== undefined && json.json.data.things.length > 0) {
        const commentData = json.json.data.things[0].data
        const author = this.username ?? "[unknown]"
        const comment: RedditComment = {
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
        return Right(comment)
      } else if (json.json?.errors !== undefined && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e) => e[1] ?? e[0]).join(", ")
        return Left(new Error(`Reddit API errors: ${errors}`))
      } else {
        return Left(new Error("Failed to parse reply response"))
      }
    } catch (error) {
      return Left(toError(error))
    }
  }

  async deletePost(thingId: string): Promise<Either<Error, boolean>> {
    try {
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
        return Left(new Error(`HTTP ${response.status}: ${errorText}`))
      }

      console.error(`[Reddit API] Successfully deleted ${fullThingId}`)
      return Right(true)
    } catch (error) {
      console.error(`[Reddit API] Delete exception:`, error)
      return Left(toError(error))
    }
  }

  async deleteComment(thingId: string): Promise<Either<Error, boolean>> {
    const fullThingId = thingId.startsWith("t1_") ? thingId : `t1_${thingId}`
    return this.deletePost(fullThingId)
  }

  async editPost(thingId: string, newText: string): Promise<Either<Error, boolean>> {
    try {
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
        return Left(new Error(`Failed to edit: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiEditResponse

      if (json.json?.errors !== undefined && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e) => e[1] ?? e[0]).join(", ")
        return Left(new Error(`Reddit API errors: ${errors}`))
      }

      return Right(true)
    } catch (error) {
      return Left(toError(error))
    }
  }

  async editComment(thingId: string, newText: string): Promise<Either<Error, boolean>> {
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
    } = {},
  ): Promise<Either<Error, readonly RedditPost[]>> {
    const { subreddit, sort = "relevance", timeFilter = "all", limit = 25, type = "link" } = options
    const endpoint = subreddit !== undefined ? `/r/${subreddit}/search.json` : "/search.json"

    const params = new URLSearchParams({
      q: query,
      sort,
      t: timeFilter,
      limit: limit.toString(),
      type,
      ...(subreddit !== undefined ? { restrict_sr: "true" } : {}),
    })

    try {
      const response = (await this.makeRequest(`${endpoint}?${params}`)).orThrow()
      if (!response.ok) {
        return Left(new Error(`Failed to search Reddit: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>

      const posts: readonly RedditPost[] = json.data.children
        .filter((child) => child.kind === "t3")
        .map((child) => parsePostData(child.data))
      return Right(posts)
    } catch (error) {
      return Left(new Error(`Failed to search Reddit for: ${query}: ${toError(error).message}`))
    }
  }

  async getPostComments(
    postId: string,
    subreddit: string,
    options: {
      readonly sort?: string
      readonly limit?: number
    } = {},
  ): Promise<Either<Error, { readonly post: RedditPost; readonly comments: readonly RedditComment[] }>> {
    const { sort = "best", limit = 100 } = options
    const params = new URLSearchParams({
      sort,
      limit: limit.toString(),
    })

    try {
      const response = (await this.makeRequest(`/r/${subreddit}/comments/${postId}.json?${params}`)).orThrow()
      if (!response.ok) {
        return Left(new Error(`Failed to get comments: HTTP ${response.status}`))
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
            replies !== undefined && typeof replies !== "string" && replies.data?.children !== undefined
              ? parseComments(replies.data.children, depth + 1)
              : []

          return [comment, ...childComments]
        })

      const comments: readonly RedditComment[] =
        json[1]?.data?.children !== undefined ? parseComments(json[1].data.children) : []

      return Right({ post, comments })
    } catch (error) {
      return Left(new Error(`Failed to get comments for post ${postId}: ${toError(error).message}`))
    }
  }

  async getUserPosts(
    username: string,
    options: {
      readonly sort?: string
      readonly timeFilter?: string
      readonly limit?: number
    } = {},
  ): Promise<Either<Error, readonly RedditPost[]>> {
    const { sort = "new", timeFilter = "all", limit = 25 } = options
    const params = new URLSearchParams({
      sort,
      t: timeFilter,
      limit: limit.toString(),
    })

    try {
      const response = (await this.makeRequest(`/user/${username}/submitted.json?${params}`)).orThrow()
      if (!response.ok) {
        return Left(new Error(`Failed to get posts for user ${username}: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>

      const posts: readonly RedditPost[] = json.data.children
        .filter((child) => child.kind === "t3")
        .map((child) => parsePostData(child.data))
      return Right(posts)
    } catch (error) {
      return Left(new Error(`Failed to get posts for user ${username}: ${toError(error).message}`))
    }
  }

  async getUserComments(
    username: string,
    options: {
      readonly sort?: string
      readonly timeFilter?: string
      readonly limit?: number
    } = {},
  ): Promise<Either<Error, readonly RedditComment[]>> {
    const { sort = "new", timeFilter = "all", limit = 25 } = options
    const params = new URLSearchParams({
      sort,
      t: timeFilter,
      limit: limit.toString(),
    })

    try {
      const response = (await this.makeRequest(`/user/${username}/comments.json?${params}`)).orThrow()
      if (!response.ok) {
        return Left(new Error(`Failed to get comments for user ${username}: HTTP ${response.status}`))
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiCommentTreeData>

      const comments: readonly RedditComment[] = json.data.children
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

      return Right(comments)
    } catch (error) {
      return Left(new Error(`Failed to get comments for user ${username}: ${toError(error).message}`))
    }
  }
}

// Create and export singleton instance
// eslint-disable-next-line functional/no-let
let clientInstance: Option<RedditClient> = Option.none()

export function initializeRedditClient(config: RedditClientConfig): RedditClient {
  const client = new RedditClient(config)

  clientInstance = Option(client)
  return client
}

export function getRedditClient(): Option<RedditClient> {
  return clientInstance
}
