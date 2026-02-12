import crypto from "crypto"

import type {
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

// Validate and encode a path segment to prevent path traversal
const SAFE_PATH_SEGMENT = /^[\w][\w.-]{0,99}$/

function sanitizePathSegment(value: string, label: string): string {
  if (!SAFE_PATH_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label}: contains disallowed characters`)
  }
  return encodeURIComponent(value)
}

export class RedditClient {
  private clientId: string
  private clientSecret: string
  private userAgent: string
  private username?: string
  private password?: string
  private accessToken?: string
  private tokenExpiry: number = 0
  private baseUrl: string
  private authenticated: boolean = false
  private authMode: RedditAuthMode
  private hasCredentials: boolean

  // Safe mode properties
  private safeMode: SafeModeConfig
  private lastWriteTime: number = 0
  private recentContentHashes: Set<string> = new Set()

  constructor(config: RedditClientConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.userAgent = config.userAgent
    this.username = config.username
    this.password = config.password
    this.authMode = config.authMode || "auto"
    this.hasCredentials = !!(this.clientId && this.clientSecret)
    this.baseUrl = this.determineBaseUrl()

    // Initialize safe mode config with defaults
    this.safeMode = config.safeMode || {
      enabled: false,
      mode: "off",
      writeDelayMs: 0,
      duplicateCheck: false,
      maxRecentHashes: 10,
    }
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

  private async makeRequest(path: string, options: RequestInit = {}): Promise<Response> {
    const requiresAuth = this.authMode === "authenticated" || (this.authMode === "auto" && this.hasCredentials)

    // Authenticate only if required
    if (requiresAuth && (Date.now() >= this.tokenExpiry || !this.authenticated)) {
      await this.authenticate()
    }

    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      ...(options.headers as Record<string, string>),
    }

    // Add Bearer token only if authenticated
    if (requiresAuth && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    // If unauthorized, try to refresh token and retry once
    if (response.status === 401 && this.authenticated) {
      await this.authenticate()
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${this.accessToken}`,
      }
      return fetch(url, {
        ...options,
        headers: retryHeaders,
      })
    }

    return response
  }

  async authenticate(): Promise<void> {
    // Skip in anonymous mode
    if (this.authMode === "anonymous") {
      this.authenticated = false
      return
    }

    // Require credentials in authenticated mode
    if (this.authMode === "authenticated" && !this.hasCredentials) {
      throw new Error("Authenticated mode requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET")
    }

    // Skip if auto mode without credentials
    if (this.authMode === "auto" && !this.hasCredentials) {
      this.authenticated = false
      return
    }

    try {
      const now = Date.now()
      if (this.accessToken && now < this.tokenExpiry) {
        return
      }

      const authUrl = "https://www.reddit.com/api/v1/access_token"
      const authData = new URLSearchParams()

      const { username } = this
      const { password } = this
      const isUserAuth = !!(username && password)
      if (isUserAuth) {
        // Authenticating with user credentials
        authData.append("grant_type", "password")
        authData.append("username", username)
        authData.append("password", password)
      } else {
        // Authenticating with client credentials (read-only)
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
        const statusText = response.statusText || "Unknown Error"
        throw new Error(`Authentication failed: ${response.status} ${statusText}`)
      }

      const data = (await response.json()) as { access_token: string; expires_in: number }
      this.accessToken = data.access_token
      this.tokenExpiry = now + data.expires_in * 1000
      this.authenticated = true
    } catch (error) {
      // Re-throw with more specific error message
      if (error instanceof Error) {
        throw error
      }
      throw new Error("Failed to authenticate with Reddit API")
    }
  }

  async checkAuthentication(): Promise<boolean> {
    if (!this.authenticated) {
      try {
        await this.authenticate()
        return true
      } catch {
        return false
      }
    }
    return true
  }

  hasWriteCredentials(): boolean {
    return !!(this.username && this.password)
  }

  getAuthenticatedUsername(): string | undefined {
    return this.username
  }

  private validateWriteAccess(): void {
    if (!this.username || !this.password) {
      if (this.authMode === "anonymous") {
        throw new Error(
          "Write operations not available in anonymous mode. " +
            "Set username and configure credentials provider (or REDDIT_PASSWORD in env mode), then use 'auto' or 'authenticated' mode.",
        )
      }
      throw new Error("Write operations require username plus configured credentials provider")
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

  private checkDuplicateContent(content: string): void {
    if (!this.safeMode.enabled || !this.safeMode.duplicateCheck) {
      return
    }

    const hash = this.hashContent(content)
    if (this.recentContentHashes.has(hash)) {
      throw new Error(
        "Duplicate content detected. Reddit's spam filter may ban your account for posting identical content. " +
          "Please modify your content and try again.",
      )
    }

    // Add to recent hashes
    this.recentContentHashes.add(hash)

    // Remove oldest hash if over limit
    if (this.recentContentHashes.size > this.safeMode.maxRecentHashes) {
      const first = this.recentContentHashes.values().next().value
      if (first) {
        this.recentContentHashes.delete(first)
      }
    }
  }

  async getUser(username: string): Promise<RedditUser> {
    const safeUsername = sanitizePathSegment(username, "username")
    try {
      const response = await this.makeRequest(`/user/${safeUsername}/about.json`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiUserResponse
      const { data } = json

      return {
        name: data.name,
        id: data.id,
        commentKarma: data.comment_karma,
        linkKarma: data.link_karma,
        totalKarma: data.total_karma || data.comment_karma + data.link_karma,
        isMod: data.is_mod,
        isGold: data.is_gold,
        isEmployee: data.is_employee,
        createdUtc: data.created_utc,
        profileUrl: `https://reddit.com/user/${data.name}`,
      }
    } catch {
      // Failed to get user info
      throw new Error(`Failed to get user info for ${username}`)
    }
  }

  async getSubredditInfo(subredditName: string): Promise<RedditSubreddit> {
    const safeName = sanitizePathSegment(subredditName, "subreddit")
    try {
      const response = await this.makeRequest(`/r/${safeName}/about.json`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiSubredditResponse
      const { data } = json

      return {
        displayName: data.display_name,
        title: data.title,
        description: data.description || "",
        publicDescription: data.public_description || "",
        subscribers: data.subscribers,
        activeUserCount: data.active_user_count ?? undefined,
        createdUtc: data.created_utc,
        over18: data.over18,
        subredditType: data.subreddit_type,
        url: data.url,
      }
    } catch {
      // Failed to get subreddit info
      throw new Error(`Failed to get subreddit info for ${subredditName}`)
    }
  }

  async getTopPosts(subreddit: string, timeFilter: string = "week", limit: number = 10): Promise<RedditPost[]> {
    const safeSubreddit = subreddit ? sanitizePathSegment(subreddit, "subreddit") : ""
    try {
      const endpoint = safeSubreddit ? `/r/${safeSubreddit}/top.json` : "/top.json"
      const params = new URLSearchParams({
        t: timeFilter,
        limit: limit.toString(),
      })

      const response = await this.makeRequest(`${endpoint}?${params}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>

      return json.data.children.map((child) => {
        const post = child.data
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
          edited: !!post.edited,
          isSelf: post.is_self,
          linkFlairText: post.link_flair_text ?? undefined,
          permalink: post.permalink,
        }
      })
    } catch {
      // Failed to get top posts
      throw new Error(`Failed to get top posts for ${subreddit || "home"}`)
    }
  }

  async getPost(postId: string, subreddit?: string): Promise<RedditPost> {
    const safePostId = sanitizePathSegment(postId, "post_id")
    const safeSubreddit = subreddit ? sanitizePathSegment(subreddit, "subreddit") : undefined
    try {
      const endpoint = safeSubreddit
        ? `/r/${safeSubreddit}/comments/${safePostId}.json`
        : `/api/info.json?id=t3_${safePostId}`
      const response = await this.makeRequest(endpoint)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      let post: RedditApiPostData
      if (subreddit) {
        // When using the comments endpoint - returns array [postListing, commentsListing]
        const json = (await response.json()) as [RedditApiListingResponse<RedditApiPostData>, unknown]
        post = json[0].data.children[0].data
      } else {
        // When using the info endpoint
        const json = (await response.json()) as RedditApiInfoResponse
        if (!json.data.children.length) {
          throw new Error(`Post with ID ${postId} not found`)
        }
        post = json.data.children[0].data
      }

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
        edited: !!post.edited,
        isSelf: post.is_self,
        linkFlairText: post.link_flair_text ?? undefined,
        permalink: post.permalink,
      }
    } catch {
      // Failed to get post
      throw new Error(`Failed to get post with ID ${postId}`)
    }
  }

  async getTrendingSubreddits(limit: number = 5): Promise<string[]> {
    try {
      const params = new URLSearchParams({ limit: limit.toString() })
      const response = await this.makeRequest(`/subreddits/popular.json?${params}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiPopularSubredditsResponse
      return json.data.children.map((child) => child.data.display_name)
    } catch {
      // Failed to get trending subreddits
      throw new Error("Failed to get trending subreddits")
    }
  }

  async createPost(subreddit: string, title: string, content: string, isSelf: boolean = true): Promise<RedditPost> {
    this.validateWriteAccess()

    // Safe mode checks
    await this.enforceWriteRateLimit()
    this.checkDuplicateContent(title + content)

    try {
      const kind = isSelf ? "self" : "link"
      const params = new URLSearchParams()
      params.append("sr", subreddit)
      params.append("kind", kind)
      params.append("title", title)
      params.append(isSelf ? "text" : "url", content)
      params.append("api_type", "json") // Request standard JSON response format

      const response = await this.makeRequest("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })

      if (!response.ok) {
        console.error(`[Reddit API] Create post failed: ${response.status}`)
        throw new Error(`Failed to create post: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiSubmitResponse

      // With api_type=json, response has json.data.id or json.errors
      if (json.json?.errors && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e) => e[1] || e[0]).join(", ")
        throw new Error(`Reddit API errors: ${errors}`)
      }

      // Extract post ID from standard JSON response
      const postId = json.json?.data?.id || json.json?.data?.name?.replace("t3_", "")

      if (!postId) {
        throw new Error("No post ID returned from Reddit")
      }

      console.error(`[Reddit API] Post created with ID: ${postId}`)
      return await this.getPost(postId, subreddit)
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Failed to create post in ${subreddit}`)
    }
  }

  async checkPostExists(postId: string): Promise<boolean> {
    const safePostId = sanitizePathSegment(postId, "post_id")
    try {
      const response = await this.makeRequest(`/api/info.json?id=t3_${safePostId}`)
      if (!response.ok) {
        return false
      }

      const json = (await response.json()) as RedditApiInfoResponse
      return json.data.children.length > 0
    } catch {
      return false
    }
  }

  async replyToPost(postId: string, content: string): Promise<RedditComment> {
    this.validateWriteAccess()

    // Safe mode checks
    await this.enforceWriteRateLimit()
    this.checkDuplicateContent(content)

    try {
      // Determine the full thing_id, preserving existing prefixes (t3_ for posts, t1_ for comments)
      const fullThingId = postId.startsWith("t3_") || postId.startsWith("t1_") ? postId : `t3_${postId}`

      // Only check existence for posts (t3_), not comments (t1_)
      if (fullThingId.startsWith("t3_")) {
        const bareId = fullThingId.slice(3)
        if (!(await this.checkPostExists(bareId))) {
          throw new Error(`Post with ID ${bareId} does not exist or is not accessible`)
        }
      }

      const params = new URLSearchParams()
      params.append("thing_id", fullThingId)
      params.append("text", content)
      params.append("api_type", "json") // Request standard JSON response format

      const response = await this.makeRequest("/api/comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })

      if (!response.ok) {
        console.error(`[Reddit API] Reply to post failed: ${response.status}`)
        throw new Error(`Failed to reply: HTTP ${response.status}`)
      }

      // Extract comment data from response
      const json = (await response.json()) as RedditApiCommentResponse

      if (json.json?.data?.things && json.json.data.things.length > 0) {
        const commentData = json.json.data.things[0].data
        // username is guaranteed to be defined because validateWriteAccess() was called above
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
      } else if (json.json?.errors && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e) => e[1] || e[0]).join(", ")
        throw new Error(`Reddit API errors: ${errors}`)
      } else {
        throw new Error("Failed to parse reply response")
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Failed to reply to post ${postId}`)
    }
  }

  async deletePost(thingId: string): Promise<boolean> {
    this.validateWriteAccess()

    try {
      // Ensure thing ID has the correct prefix (t3_ for posts, t1_ for comments)
      const fullThingId = thingId.startsWith("t3_") || thingId.startsWith("t1_") ? thingId : `t3_${thingId}`

      const params = new URLSearchParams()
      params.append("id", fullThingId)

      const response = await this.makeRequest("/api/del", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })

      if (!response.ok) {
        console.error(`[Reddit API] Delete failed: ${response.status}`)
        throw new Error(`Failed to delete: HTTP ${response.status}`)
      }

      console.error(`[Reddit API] Successfully deleted ${fullThingId}`)
      return true
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Failed to delete content ${thingId}`)
    }
  }

  async deleteComment(thingId: string): Promise<boolean> {
    // deleteComment is just an alias for deletePost since /api/del handles both
    // Ensure the thing ID has the correct prefix for comments (t1_)
    const fullThingId = thingId.startsWith("t1_") ? thingId : `t1_${thingId}`
    return this.deletePost(fullThingId)
  }

  async editPost(thingId: string, newText: string): Promise<boolean> {
    this.validateWriteAccess()

    // Safe mode checks
    await this.enforceWriteRateLimit()
    this.checkDuplicateContent(newText)

    try {
      // Ensure thing ID has the correct prefix (t3_ for posts, t1_ for comments)
      const fullThingId = thingId.startsWith("t3_") || thingId.startsWith("t1_") ? thingId : `t3_${thingId}`

      const params = new URLSearchParams()
      params.append("thing_id", fullThingId)
      params.append("text", newText)
      params.append("api_type", "json")

      const response = await this.makeRequest("/api/editusertext", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })

      if (!response.ok) {
        console.error(`[Reddit API] Edit failed: ${response.status}`)
        throw new Error(`Failed to edit: HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiEditResponse

      // Check for errors in response
      if (json.json?.errors && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e) => e[1] || e[0]).join(", ")
        throw new Error(`Reddit API errors: ${errors}`)
      }

      console.error(`[Reddit API] Successfully edited ${fullThingId}`)
      return true
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Failed to edit content ${thingId}`)
    }
  }

  async editComment(thingId: string, newText: string): Promise<boolean> {
    // editComment is just an alias for editPost since /api/editusertext handles both
    // Ensure the thing ID has the correct prefix for comments (t1_)
    const fullThingId = thingId.startsWith("t1_") ? thingId : `t1_${thingId}`
    return this.editPost(fullThingId, newText)
  }

  async vote(thingId: string, direction: -1 | 0 | 1 = 1): Promise<boolean> {
    this.validateWriteAccess()
    await this.enforceWriteRateLimit()

    try {
      const fullThingId = thingId.startsWith("t3_") || thingId.startsWith("t1_") ? thingId : `t3_${thingId}`
      const params = new URLSearchParams()
      params.append("id", fullThingId)
      params.append("dir", String(direction))

      const response = await this.makeRequest("/api/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })

      if (!response.ok) {
        throw new Error(`Failed to vote: HTTP ${response.status}`)
      }

      return true
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Failed to vote on ${thingId}`)
    }
  }

  async searchReddit(
    query: string,
    options: {
      subreddit?: string
      sort?: string
      timeFilter?: string
      limit?: number
      type?: string
    } = {},
  ): Promise<RedditPost[]> {
    const { subreddit, sort = "relevance", timeFilter = "all", limit = 25, type = "link" } = options
    const safeSubreddit = subreddit ? sanitizePathSegment(subreddit, "subreddit") : undefined
    try {
      const endpoint = safeSubreddit ? `/r/${safeSubreddit}/search.json` : "/search.json"

      const params = new URLSearchParams({
        q: query,
        sort,
        t: timeFilter,
        limit: limit.toString(),
        type,
        ...(subreddit && { restrict_sr: "true" }),
      })

      const response = await this.makeRequest(`${endpoint}?${params}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>

      return json.data.children
        .filter((child) => child.kind === "t3") // Only posts
        .map((child) => {
          const post = child.data
          return {
            id: post.id,
            title: post.title,
            author: post.author,
            subreddit: post.subreddit,
            selftext: post.selftext || "",
            url: post.url,
            score: post.score,
            upvoteRatio: post.upvote_ratio,
            numComments: post.num_comments,
            createdUtc: post.created_utc,
            over18: post.over_18,
            spoiler: post.spoiler,
            edited: !!post.edited,
            isSelf: post.is_self,
            linkFlairText: post.link_flair_text ?? undefined,
            permalink: post.permalink,
          }
        })
    } catch {
      throw new Error(`Failed to search Reddit for: ${query}`)
    }
  }

  async getPostComments(
    postId: string,
    subreddit: string,
    options: {
      sort?: string
      limit?: number
    } = {},
  ): Promise<{ post: RedditPost; comments: RedditComment[] }> {
    const safeSub = sanitizePathSegment(subreddit, "subreddit")
    const safePostId = sanitizePathSegment(postId, "post_id")
    try {
      const { sort = "best", limit = 100 } = options
      const params = new URLSearchParams({
        sort,
        limit: limit.toString(),
      })
      const response = await this.makeRequest(`/r/${safeSub}/comments/${safePostId}.json?${params}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiPostCommentsResponse

      // First element is the post, second is the comments
      const postData = json[0].data.children[0].data
      const post: RedditPost = {
        id: postData.id,
        title: postData.title,
        author: postData.author,
        subreddit: postData.subreddit,
        selftext: postData.selftext || "",
        url: postData.url,
        score: postData.score,
        upvoteRatio: postData.upvote_ratio,
        numComments: postData.num_comments,
        createdUtc: postData.created_utc,
        over18: postData.over_18,
        spoiler: postData.spoiler,
        edited: !!postData.edited,
        isSelf: postData.is_self,
        linkFlairText: postData.link_flair_text ?? undefined,
        permalink: postData.permalink,
      }

      const comments: RedditComment[] = []
      const parseComments = (
        commentData: Array<{ kind: string; data: RedditApiCommentTreeData }>,
        depth: number = 0,
      ) => {
        for (const item of commentData) {
          if (item.kind === "t1" && item.data.body) {
            comments.push({
              id: item.data.id,
              author: item.data.author,
              body: item.data.body,
              score: item.data.score,
              controversiality: item.data.controversiality,
              subreddit: item.data.subreddit,
              submissionTitle: post.title,
              createdUtc: item.data.created_utc,
              edited: !!item.data.edited,
              isSubmitter: item.data.is_submitter,
              permalink: item.data.permalink,
              depth,
              parentId: item.data.parent_id,
            })

            // Parse replies recursively
            const { replies } = item.data
            if (replies && typeof replies !== "string" && replies.data?.children) {
              parseComments(replies.data.children, depth + 1)
            }
          }
        }
      }

      if (json[1]?.data?.children) {
        parseComments(json[1].data.children)
      }

      return { post, comments }
    } catch {
      throw new Error(`Failed to get comments for post ${postId}`)
    }
  }

  async getUserPosts(
    username: string,
    options: {
      sort?: string
      timeFilter?: string
      limit?: number
    } = {},
  ): Promise<RedditPost[]> {
    const safeUsername = sanitizePathSegment(username, "username")
    try {
      const { sort = "new", timeFilter = "all", limit = 25 } = options
      const params = new URLSearchParams({
        sort,
        t: timeFilter,
        limit: limit.toString(),
      })

      const response = await this.makeRequest(`/user/${safeUsername}/submitted.json?${params}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiPostData>

      return json.data.children
        .filter((child) => child.kind === "t3")
        .map((child) => {
          const post = child.data
          return {
            id: post.id,
            title: post.title,
            author: post.author,
            subreddit: post.subreddit,
            selftext: post.selftext || "",
            url: post.url,
            score: post.score,
            upvoteRatio: post.upvote_ratio,
            numComments: post.num_comments,
            createdUtc: post.created_utc,
            over18: post.over_18,
            spoiler: post.spoiler,
            edited: !!post.edited,
            isSelf: post.is_self,
            linkFlairText: post.link_flair_text ?? undefined,
            permalink: post.permalink,
          }
        })
    } catch {
      throw new Error(`Failed to get posts for user ${username}`)
    }
  }

  async getUserComments(
    username: string,
    options: {
      sort?: string
      timeFilter?: string
      limit?: number
    } = {},
  ): Promise<RedditComment[]> {
    const safeUsername = sanitizePathSegment(username, "username")
    try {
      const { sort = "new", timeFilter = "all", limit = 25 } = options
      const params = new URLSearchParams({
        sort,
        t: timeFilter,
        limit: limit.toString(),
      })
      const response = await this.makeRequest(`/user/${safeUsername}/comments.json?${params}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiListingResponse<RedditApiCommentTreeData>

      return json.data.children
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
            edited: !!comment.edited,
            isSubmitter: comment.is_submitter,
            permalink: comment.permalink,
          }
        })
    } catch {
      throw new Error(`Failed to get comments for user ${username}`)
    }
  }
}

// Create and export singleton instance
let redditClient: RedditClient | null = null

export function initializeRedditClient(config: RedditClientConfig): RedditClient {
  redditClient = new RedditClient(config)
  return redditClient
}

export function getRedditClient(): RedditClient | null {
  return redditClient
}
