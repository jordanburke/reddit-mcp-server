import axios, { AxiosInstance } from "axios"
import { RedditClientConfig, RedditUser, RedditPost, RedditComment, RedditSubreddit } from "../types"

export class RedditClient {
  private clientId: string
  private clientSecret: string
  private userAgent: string
  private username?: string
  private password?: string
  private accessToken?: string
  private tokenExpiry: number = 0
  private api: AxiosInstance
  private authenticated: boolean = false

  constructor(config: RedditClientConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.userAgent = config.userAgent
    this.username = config.username
    this.password = config.password

    this.api = axios.create({
      baseURL: "https://oauth.reddit.com",
      headers: {
        "User-Agent": this.userAgent,
      },
    })

    // Add response interceptor to handle token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.authenticated) {
          await this.authenticate()
          const originalRequest = error.config
          originalRequest.headers["Authorization"] = `Bearer ${this.accessToken}`
          return this.api(originalRequest)
        }
        return Promise.reject(error)
      },
    )
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

      const response = await axios.post(authUrl, authData, {
        auth: {
          username: this.clientId,
          password: this.clientSecret,
        },
        headers: {
          "User-Agent": this.userAgent,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })

      this.accessToken = response.data.access_token
      this.tokenExpiry = now + response.data.expires_in * 1000
      this.authenticated = true
      this.api.defaults.headers.common["Authorization"] = `Bearer ${this.accessToken}`

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
      const response = await this.api.get(`/user/${username}/about.json`)
      const data = response.data.data

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
      const response = await this.api.get(`/r/${subredditName}/about.json`)
      const data = response.data.data

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
      const response = await this.api.get(endpoint, {
        params: {
          t: timeFilter,
          limit,
        },
      })

      return response.data.data.children.map((child: any) => {
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

      const response = await this.api.get(endpoint)

      let post
      if (subreddit) {
        // When using the comments endpoint
        post = response.data[0].data.children[0].data
      } else {
        // When using the info endpoint
        if (!response.data.data.children.length) {
          throw new Error(`Post with ID ${postId} not found`)
        }
        post = response.data.data.children[0].data
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
      const response = await this.api.get("/subreddits/popular.json", {
        params: { limit },
      })

      return response.data.data.children.map((child: any) => child.data.display_name)
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

      const response = await this.api.post("/api/submit", params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })

      if (response.data.success) {
        // Get the newly created post
        const postId = response.data.data.id
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
      const response = await this.api.get(`/api/info.json?id=t3_${postId}`)
      return response.data.data.children.length > 0
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

      const response = await this.api.post("/api/comment", params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })

      // Extract comment data from response
      const commentData = response.data
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
