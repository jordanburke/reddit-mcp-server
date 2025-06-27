import { RedditClientConfig, RedditUser, RedditPost, RedditComment, RedditSubreddit } from "../types"

export class RedditClient {
  private clientId: string
  private clientSecret: string
  private userAgent: string
  private username?: string
  private password?: string
  private accessToken?: string
  private tokenExpiry: number = 0
  private baseUrl: string = "https://oauth.reddit.com"
  private authenticated: boolean = false

  constructor(config: RedditClientConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.userAgent = config.userAgent
    this.username = config.username
    this.password = config.password
  }

  private async makeRequest(path: string, options: RequestInit = {}): Promise<Response> {
    // Check if we need to refresh token
    if (Date.now() >= this.tokenExpiry || !this.authenticated) {
      await this.authenticate()
    }

    const url = `${this.baseUrl}${path}`
    const headers = {
      "User-Agent": this.userAgent,
      Authorization: `Bearer ${this.accessToken}`,
      ...options.headers,
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
    try {
      const now = Date.now()
      if (this.accessToken && now < this.tokenExpiry) {
        return
      }

      const authUrl = "https://www.reddit.com/api/v1/access_token"
      const authData = new URLSearchParams()

      if (this.username && this.password) {
        // Authenticating with user credentials
        authData.append("grant_type", "password")
        authData.append("username", this.username)
        authData.append("password", this.password)
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
        throw new Error(`Authentication failed: ${response.status}`)
      }

      const data = (await response.json()) as { access_token: string; expires_in: number }
      this.accessToken = data.access_token
      this.tokenExpiry = now + data.expires_in * 1000
      this.authenticated = true

      // Successfully authenticated with Reddit API
    } catch {
      // Authentication error occurred
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

  async getUser(username: string): Promise<RedditUser> {
    await this.authenticate()
    try {
      const response = await this.makeRequest(`/user/${username}/about.json`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as { data: any }
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
    await this.authenticate()
    try {
      const response = await this.makeRequest(`/r/${subredditName}/about.json`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as { data: any }
      const data = json.data

      return {
        displayName: data.display_name,
        title: data.title,
        description: data.description || "",
        publicDescription: data.public_description || "",
        subscribers: data.subscribers,
        activeUserCount: data.active_user_count,
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
    await this.authenticate()
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

      const json = (await response.json()) as { data: { children: any[] } }

      return json.data.children.map((child: any) => {
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
          linkFlairText: post.link_flair_text,
          permalink: post.permalink,
        }
      })
    } catch {
      // Failed to get top posts
      throw new Error(`Failed to get top posts for ${subreddit || "home"}`)
    }
  }

  async getPost(postId: string, subreddit?: string): Promise<RedditPost> {
    await this.authenticate()
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
    await this.authenticate()
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
    await this.authenticate()

    if (!this.username || !this.password) {
      throw new Error("User authentication required for posting")
    }

    try {
      const kind = isSelf ? "self" : "link"
      const params = new URLSearchParams()
      params.append("sr", subreddit)
      params.append("kind", kind)
      params.append("title", title)
      params.append(isSelf ? "text" : "url", content)

      const response = await this.makeRequest("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as { success: boolean; data: { id: string } }
      if (json.success) {
        // Get the newly created post
        const postId = json.data.id
        return await this.getPost(postId)
      } else {
        throw new Error("Failed to create post")
      }
    } catch {
      // Failed to create post
      throw new Error(`Failed to create post in ${subreddit}`)
    }
  }

  async checkPostExists(postId: string): Promise<boolean> {
    await this.authenticate()
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
    await this.authenticate()

    if (!this.username || !this.password) {
      throw new Error("User authentication required for posting replies")
    }

    try {
      if (!(await this.checkPostExists(postId))) {
        throw new Error(`Post with ID ${postId} does not exist or is not accessible`)
      }

      const params = new URLSearchParams()
      params.append("thing_id", `t3_${postId}`)
      params.append("text", content)

      const response = await this.makeRequest("/api/comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Extract comment data from response
      const commentData = (await response.json()) as any
      return {
        id: commentData.id,
        author: this.username,
        body: content,
        score: 1,
        controversiality: 0,
        subreddit: commentData.subreddit,
        submissionTitle: commentData.link_title,
        createdUtc: Date.now() / 1000,
        edited: false,
        isSubmitter: false,
        permalink: commentData.permalink,
      }
    } catch {
      // Failed to reply to post
      throw new Error(`Failed to reply to post ${postId}`)
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
    await this.authenticate()
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
            linkFlairText: post.link_flair_text,
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
    await this.authenticate()
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
    await this.authenticate()
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
            linkFlairText: post.link_flair_text,
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
    await this.authenticate()
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
