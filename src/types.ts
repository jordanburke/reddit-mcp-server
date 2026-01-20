export type RedditAuthMode = "auto" | "authenticated" | "anonymous"

export interface RedditClientConfig {
  clientId: string
  clientSecret: string
  userAgent: string
  username?: string
  password?: string
  authMode?: RedditAuthMode
}

export interface RedditUser {
  name: string
  id: string
  commentKarma: number
  linkKarma: number
  totalKarma: number
  isMod: boolean
  isGold: boolean
  isEmployee: boolean
  createdUtc: number
  profileUrl: string
}

export interface RedditPost {
  id: string
  title: string
  author: string
  subreddit: string
  selftext?: string
  url?: string
  score: number
  upvoteRatio: number
  numComments: number
  createdUtc: number
  over18: boolean
  spoiler?: boolean
  edited: boolean
  isSelf: boolean
  linkFlairText?: string
  permalink: string
}

export interface RedditComment {
  id: string
  author: string
  body: string
  score: number
  controversiality: number
  subreddit: string
  submissionTitle: string
  createdUtc: number
  edited: boolean
  isSubmitter: boolean
  permalink: string
  depth?: number
  parentId?: string
}

export interface RedditSubreddit {
  displayName: string
  title: string
  description: string
  publicDescription: string
  subscribers: number
  activeUserCount?: number
  createdUtc: number
  over18: boolean
  subredditType?: string
  url: string
}

export interface FormattedUserInfo {
  username: string
  karma: {
    commentKarma: number
    postKarma: number
    totalKarma: number
  }
  accountStatus: string[]
  accountCreated: string
  profileUrl: string
  activityAnalysis: string
  recommendations: string
}

export interface FormattedPostInfo {
  title: string
  type: string
  content: string
  author: string
  subreddit: string
  stats: {
    score: number
    upvoteRatio: number
    comments: number
  }
  metadata: {
    posted: string
    flags: string[]
    flair: string
  }
  links: {
    fullPost: string
    shortLink: string
  }
  engagementAnalysis: string
  bestTimeToEngage: string
}

export interface FormattedSubredditInfo {
  name: string
  title: string
  stats: {
    subscribers: number
    activeUsers: number | string
  }
  description: {
    short: string
    full: string
  }
  metadata: {
    created: string
    flags: string[]
  }
  links: {
    subreddit: string
    wiki: string
  }
  communityAnalysis: string
  engagementTips: string
}

export interface FormattedCommentInfo {
  author: string
  content: string
  stats: {
    score: number
    controversiality: number | string
  }
  context: {
    subreddit: string
    thread: string
  }
  metadata: {
    posted: string
    flags: string[]
  }
  link: string
  commentAnalysis: string
}

// Reddit API Response Types (Raw API structures)
export interface RedditApiUserResponse {
  data: {
    name: string
    id: string
    comment_karma: number
    link_karma: number
    total_karma?: number // Optional since it may not exist
    is_mod: boolean
    is_gold: boolean
    is_employee: boolean
    created_utc: number
    [key: string]: unknown // Allow additional properties
  }
}

export interface RedditApiSubredditResponse {
  data: {
    display_name: string
    title: string
    description: string
    public_description: string
    subscribers: number
    active_user_count: number | null
    created_utc: number
    over18: boolean
    subreddit_type: string
    url: string
    [key: string]: unknown
  }
}

export interface RedditApiPostData {
  id: string
  title: string
  author: string
  subreddit: string
  selftext: string
  url: string
  score: number
  upvote_ratio: number
  num_comments: number
  created_utc: number
  over_18: boolean
  spoiler: boolean
  edited: boolean | number
  is_self: boolean
  link_flair_text: string | null
  permalink: string
  [key: string]: unknown
}

export interface RedditApiListingResponse<T> {
  data: {
    children: Array<{
      kind: string
      data: T
    }>
    [key: string]: unknown
  }
}

export interface RedditApiCommentData {
  id: string
  author: string
  body: string
  score: number
  controversiality: number
  subreddit: string
  link_title: string
  created_utc: number
  edited: boolean | number
  is_submitter: boolean
  permalink: string
  [key: string]: unknown
}

// Generic Reddit API wrapper
export interface RedditApiResponse<T = unknown> {
  data: T
  [key: string]: unknown
}

// Reddit API Submit Response (for createPost)
export interface RedditApiSubmitResponse {
  json: {
    errors?: Array<[string, string, string?]>
    data?: {
      id?: string
      name?: string
      url?: string
    }
  }
}

// Reddit API Comment Response (for replyToPost)
export interface RedditApiCommentResponse {
  json: {
    errors?: Array<[string, string, string?]>
    data?: {
      things?: Array<{
        kind: string
        data: {
          id: string
          subreddit: string
          link_title?: string
          permalink: string
          [key: string]: unknown
        }
      }>
    }
  }
}

// Reddit API Edit Response (for editPost)
export interface RedditApiEditResponse {
  json: {
    errors?: Array<[string, string, string?]>
    data?: {
      things?: Array<{
        kind: string
        data: {
          id: string
          body?: string
          selftext?: string
          [key: string]: unknown
        }
      }>
    }
  }
}

// Reddit API Popular Subreddits Response
export interface RedditApiPopularSubredditsResponse {
  data: {
    children: Array<{
      kind: string
      data: {
        display_name: string
        [key: string]: unknown
      }
    }>
    [key: string]: unknown
  }
}

// Reddit API Post with Comments Response (array of two listings)
export type RedditApiPostCommentsResponse = [
  RedditApiListingResponse<RedditApiPostData>,
  RedditApiListingResponse<RedditApiCommentTreeData>,
]

// Reddit API Comment Tree Data (includes nested replies)
export interface RedditApiCommentTreeData {
  id: string
  author: string
  body?: string
  score: number
  controversiality: number
  subreddit: string
  created_utc: number
  edited: boolean | number
  is_submitter: boolean
  permalink: string
  parent_id: string
  link_title?: string // Present in user comment listings
  replies?:
    | ""
    | {
        data: {
          children: Array<{
            kind: string
            data: RedditApiCommentTreeData
          }>
        }
      }
  [key: string]: unknown
}

// Reddit API Info/Check Response (for checkPostExists, getPost info endpoint)
export interface RedditApiInfoResponse {
  data: {
    children: Array<{
      kind: string
      data: RedditApiPostData
    }>
    [key: string]: unknown
  }
}
