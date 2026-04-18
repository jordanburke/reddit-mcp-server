export type RedditAuthMode = "auto" | "authenticated" | "anonymous"

export type RedditSafeMode = "off" | "standard" | "strict"

export type BotDisclosureMode = "auto" | "off"

export type BotDisclosureConfig = {
  readonly enabled: boolean
  readonly footer: string
}

export type ContentRecord = {
  readonly hash: string
  readonly subreddit: string
  readonly timestamp: number
}

export type SafeModeConfig = {
  readonly enabled: boolean
  readonly mode: RedditSafeMode
  readonly writeDelayMs: number
  readonly duplicateCheck: boolean
  readonly maxRecentHashes: number
}

export type RedditClientConfig = {
  readonly clientId: string
  readonly clientSecret: string
  readonly userAgent: string
  readonly username?: string
  readonly password?: string
  readonly authMode?: RedditAuthMode
  readonly safeMode?: SafeModeConfig
  readonly botDisclosure?: BotDisclosureConfig
}

export type RedditUser = {
  readonly name: string
  readonly id: string
  readonly commentKarma: number
  readonly linkKarma: number
  readonly totalKarma: number
  readonly isMod: boolean
  readonly isGold: boolean
  readonly isEmployee: boolean
  readonly createdUtc: number
  readonly profileUrl: string
}

export type RedditPost = {
  readonly id: string
  readonly title: string
  readonly author: string
  readonly subreddit: string
  readonly selftext?: string
  readonly url?: string
  readonly score: number
  readonly upvoteRatio: number
  readonly numComments: number
  readonly createdUtc: number
  readonly over18: boolean
  readonly spoiler?: boolean
  readonly edited: boolean
  readonly isSelf: boolean
  readonly linkFlairText?: string
  readonly permalink: string
}

export type RedditComment = {
  readonly id: string
  readonly author: string
  readonly body: string
  readonly score: number
  readonly controversiality: number
  readonly subreddit: string
  readonly submissionTitle: string
  readonly createdUtc: number
  readonly edited: boolean
  readonly isSubmitter: boolean
  readonly permalink: string
  readonly depth?: number
  readonly parentId?: string
}

export type RedditSubreddit = {
  readonly displayName: string
  readonly title: string
  readonly description: string
  readonly publicDescription: string
  readonly subscribers: number
  readonly activeUserCount?: number
  readonly createdUtc: number
  readonly over18: boolean
  readonly subredditType?: string
  readonly url: string
}

export type FormattedUserInfo = {
  readonly username: string
  readonly karma: {
    readonly commentKarma: number
    readonly postKarma: number
    readonly totalKarma: number
  }
  readonly accountStatus: readonly string[]
  readonly accountCreated: string
  readonly profileUrl: string
  readonly activityAnalysis: string
  readonly recommendations: string
}

export type FormattedPostInfo = {
  readonly title: string
  readonly type: string
  readonly content: string
  readonly author: string
  readonly subreddit: string
  readonly stats: {
    readonly score: number
    readonly upvoteRatio: number
    readonly comments: number
  }
  readonly metadata: {
    readonly posted: string
    readonly flags: readonly string[]
    readonly flair: string
  }
  readonly links: {
    readonly fullPost: string
    readonly shortLink: string
  }
  readonly engagementAnalysis: string
  readonly bestTimeToEngage: string
}

export type FormattedSubredditInfo = {
  readonly name: string
  readonly title: string
  readonly stats: {
    readonly subscribers: number
    readonly activeUsers: number | string
  }
  readonly description: {
    readonly short: string
    readonly full: string
  }
  readonly metadata: {
    readonly created: string
    readonly flags: readonly string[]
  }
  readonly links: {
    readonly subreddit: string
    readonly wiki: string
  }
  readonly communityAnalysis: string
  readonly engagementTips: string
}

export type FormattedCommentInfo = {
  readonly author: string
  readonly content: string
  readonly stats: {
    readonly score: number
    readonly controversiality: number | string
  }
  readonly context: {
    readonly subreddit: string
    readonly thread: string
  }
  readonly metadata: {
    readonly posted: string
    readonly flags: readonly string[]
  }
  readonly link: string
  readonly commentAnalysis: string
}

// Reddit API Response Types (Raw API structures)
export type RedditApiUserResponse = {
  readonly data: {
    readonly name: string
    readonly id: string
    readonly comment_karma: number
    readonly link_karma: number
    readonly total_karma?: number
    readonly is_mod: boolean
    readonly is_gold: boolean
    readonly is_employee: boolean
    readonly created_utc: number
    readonly [key: string]: unknown
  }
}

export type RedditApiSubredditResponse = {
  readonly data: {
    readonly display_name: string
    readonly title: string
    readonly description: string
    readonly public_description: string
    readonly subscribers: number
    // eslint-disable-next-line functype/prefer-option -- wire format: Reddit's JSON API returns literal null here
    readonly active_user_count: number | null
    readonly created_utc: number
    readonly over18: boolean
    readonly subreddit_type: string
    readonly url: string
    readonly [key: string]: unknown
  }
}

export type RedditApiPostData = {
  readonly id: string
  readonly title: string
  readonly author: string
  readonly subreddit: string
  readonly selftext: string
  readonly url: string
  readonly score: number
  readonly upvote_ratio: number
  readonly num_comments: number
  readonly created_utc: number
  readonly over_18: boolean
  readonly spoiler: boolean
  readonly edited: boolean | number
  readonly is_self: boolean
  // eslint-disable-next-line functype/prefer-option -- wire format: Reddit's JSON API returns literal null here
  readonly link_flair_text: string | null
  readonly permalink: string
  readonly [key: string]: unknown
}

export type RedditApiListingResponse<T> = {
  readonly data: {
    readonly children: ReadonlyArray<{
      readonly kind: string
      readonly data: T
    }>
    readonly [key: string]: unknown
  }
}

export type RedditApiCommentData = {
  readonly id: string
  readonly author: string
  readonly body: string
  readonly score: number
  readonly controversiality: number
  readonly subreddit: string
  readonly link_title: string
  readonly created_utc: number
  readonly edited: boolean | number
  readonly is_submitter: boolean
  readonly permalink: string
  readonly [key: string]: unknown
}

// Generic Reddit API wrapper
export type RedditApiResponse<T = unknown> = {
  readonly data: T
  readonly [key: string]: unknown
}

// Reddit API Submit Response (for createPost)
export type RedditApiSubmitResponse = {
  readonly json: {
    readonly errors?: ReadonlyArray<readonly [string, string, string?]>
    readonly data?: {
      readonly id?: string
      readonly name?: string
      readonly url?: string
    }
  }
}

// Reddit API Comment Response (for replyToPost)
export type RedditApiCommentResponse = {
  readonly json: {
    readonly errors?: ReadonlyArray<readonly [string, string, string?]>
    readonly data?: {
      readonly things?: ReadonlyArray<{
        readonly kind: string
        readonly data: {
          readonly id: string
          readonly subreddit: string
          readonly link_title?: string
          readonly permalink: string
          readonly [key: string]: unknown
        }
      }>
    }
  }
}

// Reddit API Edit Response (for editPost)
export type RedditApiEditResponse = {
  readonly json: {
    readonly errors?: ReadonlyArray<readonly [string, string, string?]>
    readonly data?: {
      readonly things?: ReadonlyArray<{
        readonly kind: string
        readonly data: {
          readonly id: string
          readonly body?: string
          readonly selftext?: string
          readonly [key: string]: unknown
        }
      }>
    }
  }
}

// Reddit API Popular Subreddits Response
export type RedditApiPopularSubredditsResponse = {
  readonly data: {
    readonly children: ReadonlyArray<{
      readonly kind: string
      readonly data: {
        readonly display_name: string
        readonly [key: string]: unknown
      }
    }>
    readonly [key: string]: unknown
  }
}

// Reddit API Post with Comments Response (array of two listings)
export type RedditApiPostCommentsResponse = readonly [
  RedditApiListingResponse<RedditApiPostData>,
  RedditApiListingResponse<RedditApiCommentTreeData>,
]

// Reddit API Comment Tree Data (includes nested replies)
export type RedditApiCommentTreeData = {
  readonly id: string
  readonly author: string
  readonly body?: string
  readonly score: number
  readonly controversiality: number
  readonly subreddit: string
  readonly created_utc: number
  readonly edited: boolean | number
  readonly is_submitter: boolean
  readonly permalink: string
  readonly parent_id: string
  readonly link_title?: string
  readonly replies?:
    | ""
    | {
        readonly data: {
          readonly children: ReadonlyArray<{
            readonly kind: string
            readonly data: RedditApiCommentTreeData
          }>
        }
      }
  readonly [key: string]: unknown
}

// Reddit API Info/Check Response (for checkPostExists, getPost info endpoint)
export type RedditApiInfoResponse = {
  readonly data: {
    readonly children: ReadonlyArray<{
      readonly kind: string
      readonly data: RedditApiPostData
    }>
    readonly [key: string]: unknown
  }
}
