import {
  RedditClientConfig,
  RedditAuthMode,
  RedditUser,
  RedditPost,
  RedditComment,
  RedditSubreddit,
  RedditApiUserResponse,
  RedditApiSubredditResponse,
  RedditApiListingResponse,
  RedditApiPostData,
} from "../types"

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

  constructor(config: RedditClientConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.userAgent = config.userAgent
    this.username = config.username
    this.password = config.password
    this.authMode = config.authMode || "auto"
    this.hasCredentials = !!(this.clientId && this.clientSecret)
    this.baseUrl = this.determineBaseUrl()
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

      const isUserAuth = !!(this.username && this.password)
      if (isUserAuth) {
        // Authenticating with user credentials
        authData.append("grant_type", "password")
        authData.append("username", this.username!)
        authData.append("password", this.password!)
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

  private validateWriteAccess(): void {
    if (!this.username || !this.password) {
      if (this.authMode === "anonymous") {
        throw new Error(
          "Write operations not available in anonymous mode. " +
            "Set REDDIT_USERNAME, REDDIT_PASSWORD and use 'auto' or 'authenticated' mode.",
        )
      }
      throw new Error("Write operations require REDDIT_USERNAME and REDDIT_PASSWORD")
    }
  }

  async getUser(username: string): Promise<RedditUser> {
    try {
      const response = await this.makeRequest(`/user/${username}/about.json`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiUserResponse
      const data = json.data

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
    try {
      const response = await this.makeRequest(`/r/${subredditName}/about.json`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as RedditApiSubredditResponse
      const data = json.data

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
    try {
      const endpoint = subreddit ? `/r/${subreddit}/top.json` : "/top.json"
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
    try {
      const endpoint = subreddit ? `/r/${subreddit}/comments/${postId}.json` : `/api/info.json?id=t3_${postId}`
      const response = await this.makeRequest(endpoint)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as any

      let post
      if (subreddit) {
        // When using the comments endpoint
        post = json[0].data.children[0].data
      } else {
        // When using the info endpoint
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
        linkFlairText: post.link_flair_text,
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

      const json = (await response.json()) as { data: { children: any[] } }
      return json.data.children.map((child: any) => child.data.display_name)
    } catch {
      // Failed to get trending subreddits
      throw new Error("Failed to get trending subreddits")
    }
  }

  async createPost(subreddit: string, title: string, content: string, isSelf: boolean = true): Promise<RedditPost> {
    this.validateWriteAccess()

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
        const errorText = await response.text()
        console.error(`[Reddit API] Create post failed: ${response.status} ${response.statusText}`)
        console.error(`[Reddit API] Error response: ${errorText}`)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const json = (await response.json()) as any
      console.error(`[Reddit API] Create post response:`, JSON.stringify(json, null, 2))

      // With api_type=json, response has json.data.id or json.errors
      if (json.json?.errors && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e: any) => e.join(": ")).join(", ")
        console.error(`[Reddit API] Post creation errors: ${errors}`)
        throw new Error(`Reddit API errors: ${errors}`)
      }

      // Extract post ID from standard JSON response
      const postId = json.json?.data?.id || json.json?.data?.name?.replace("t3_", "")

      if (!postId) {
        console.error(`[Reddit API] No post ID in response`)
        throw new Error("No post ID returned from Reddit")
      }

      console.error(`[Reddit API] Post created with ID: ${postId}`)
      return await this.getPost(postId, subreddit)
    } catch (error) {
      // Log and re-throw the actual error
      console.error(`[Reddit API] Create post exception:`, error)
      if (error instanceof Error && error.message.includes("HTTP")) {
        throw error
      }
      throw new Error(
        `Failed to create post in ${subreddit}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async checkPostExists(postId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/api/info.json?id=t3_${postId}`)
      if (!response.ok) {
        return false
      }

      const json = (await response.json()) as { data: { children: any[] } }
      return json.data.children.length > 0
    } catch {
      return false
    }
  }

  async replyToPost(postId: string, content: string): Promise<RedditComment> {
    this.validateWriteAccess()

    try {
      if (!(await this.checkPostExists(postId))) {
        throw new Error(`Post with ID ${postId} does not exist or is not accessible`)
      }

      const params = new URLSearchParams()
      params.append("thing_id", `t3_${postId}`)
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
        const errorText = await response.text()
        console.error(`[Reddit API] Reply to post failed: ${response.status} ${response.statusText}`)
        console.error(`[Reddit API] Error response: ${errorText}`)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      // Extract comment data from response
      const json = (await response.json()) as any
      console.error(`[Reddit API] Reply response:`, JSON.stringify(json, null, 2))

      if (json.json && json.json.data && json.json.data.things) {
        const commentData = json.json.data.things[0].data
        return {
          id: commentData.id,
          author: this.username!,
          body: content,
          score: 1,
          controversiality: 0,
          subreddit: commentData.subreddit,
          submissionTitle: commentData.link_title || "",
          createdUtc: Date.now() / 1000,
          edited: false,
          isSubmitter: false,
          permalink: commentData.permalink,
        }
      } else if (json.json && json.json.errors && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e: any) => e.join(": ")).join(", ")
        console.error(`[Reddit API] Reply errors: ${errors}`)
        throw new Error(`Reddit API errors: ${errors}`)
      } else {
        console.error(`[Reddit API] Unexpected reply response format`)
        throw new Error("Failed to parse reply response")
      }
    } catch (error) {
      // Log and re-throw the actual error
      console.error(`[Reddit API] Reply to post exception:`, error)
      if (error instanceof Error && error.message.includes("HTTP")) {
        throw error
      }
      throw new Error(`Failed to reply to post ${postId}: ${error instanceof Error ? error.message : String(error)}`)
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
        const errorText = await response.text()
        console.error(`[Reddit API] Delete failed: ${response.status} ${response.statusText}`)
        console.error(`[Reddit API] Error response: ${errorText}`)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      console.error(`[Reddit API] Successfully deleted ${fullThingId}`)
      return true
    } catch (error) {
      console.error(`[Reddit API] Delete exception:`, error)
      if (error instanceof Error && error.message.includes("HTTP")) {
        throw error
      }
      throw new Error(`Failed to delete content ${thingId}: ${error instanceof Error ? error.message : String(error)}`)
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
        const errorText = await response.text()
        console.error(`[Reddit API] Edit failed: ${response.status} ${response.statusText}`)
        console.error(`[Reddit API] Error response: ${errorText}`)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const json = (await response.json()) as any
      console.error(`[Reddit API] Edit response:`, JSON.stringify(json, null, 2))

      // Check for errors in response
      if (json.json?.errors && json.json.errors.length > 0) {
        const errors = json.json.errors.map((e: any) => e.join(": ")).join(", ")
        console.error(`[Reddit API] Edit errors: ${errors}`)
        throw new Error(`Reddit API errors: ${errors}`)
      }

      console.error(`[Reddit API] Successfully edited ${fullThingId}`)
      return true
    } catch (error) {
      console.error(`[Reddit API] Edit exception:`, error)
      if (error instanceof Error && error.message.includes("HTTP")) {
        throw error
      }
      throw new Error(`Failed to edit content ${thingId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async editComment(thingId: string, newText: string): Promise<boolean> {
    // editComment is just an alias for editPost since /api/editusertext handles both
    // Ensure the thing ID has the correct prefix for comments (t1_)
    const fullThingId = thingId.startsWith("t1_") ? thingId : `t1_${thingId}`
    return this.editPost(fullThingId, newText)
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
    try {
      const { subreddit, sort = "relevance", timeFilter = "all", limit = 25, type = "link" } = options
      const endpoint = subreddit ? `/r/${subreddit}/search.json` : "/search.json"

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

      const json = (await response.json()) as { data: { children: any[] } }

      return json.data.children
        .filter((child: any) => child.kind === "t3") // Only posts
        .map((child: any) => {
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
    try {
      const { sort = "best", limit = 100 } = options
      const params = new URLSearchParams({
        sort,
        limit: limit.toString(),
      })

      const response = await this.makeRequest(`/r/${subreddit}/comments/${postId}.json?${params}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as any[]

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
        linkFlairText: postData.link_flair_text,
        permalink: postData.permalink,
      }

      const comments: RedditComment[] = []
      const parseComments = (commentData: any[], depth: number = 0) => {
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
            if (item.data.replies && item.data.replies.data && item.data.replies.data.children) {
              parseComments(item.data.replies.data.children, depth + 1)
            }
          }
        }
      }

      if (json[1] && json[1].data && json[1].data.children) {
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
    try {
      const { sort = "new", timeFilter = "all", limit = 25 } = options
      const params = new URLSearchParams({
        sort,
        t: timeFilter,
        limit: limit.toString(),
      })

      const response = await this.makeRequest(`/user/${username}/submitted.json?${params}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as { data: { children: any[] } }

      return json.data.children
        .filter((child: any) => child.kind === "t3")
        .map((child: any) => {
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
    try {
      const { sort = "new", timeFilter = "all", limit = 25 } = options
      const params = new URLSearchParams({
        sort,
        t: timeFilter,
        limit: limit.toString(),
      })

      const response = await this.makeRequest(`/user/${username}/comments.json?${params}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as { data: { children: any[] } }

      return json.data.children
        .filter((child: any) => child.kind === "t1")
        .map((child: any) => {
          const comment = child.data
          return {
            id: comment.id,
            author: comment.author,
            body: comment.body,
            score: comment.score,
            controversiality: comment.controversiality,
            subreddit: comment.subreddit,
            submissionTitle: comment.link_title || "",
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
