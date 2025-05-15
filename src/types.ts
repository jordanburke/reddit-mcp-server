export interface RedditClientConfig {
  clientId: string;
  clientSecret: string;
  userAgent: string;
  username?: string;
  password?: string;
}

export interface RedditUser {
  name: string;
  id: string;
  commentKarma: number;
  linkKarma: number;
  totalKarma: number;
  isMod: boolean;
  isGold: boolean;
  isEmployee: boolean;
  createdUtc: number;
  profileUrl: string;
}

export interface RedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  selftext?: string;
  url?: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  createdUtc: number;
  over18: boolean;
  spoiler?: boolean;
  edited: boolean;
  isSelf: boolean;
  linkFlairText?: string;
  permalink: string;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  controversiality: number;
  subreddit: string;
  submissionTitle: string;
  createdUtc: number;
  edited: boolean;
  isSubmitter: boolean;
  permalink: string;
}

export interface RedditSubreddit {
  displayName: string;
  title: string;
  description: string;
  publicDescription: string;
  subscribers: number;
  activeUserCount?: number;
  createdUtc: number;
  over18: boolean;
  subredditType?: string;
  url: string;
}

export interface FormattedUserInfo {
  username: string;
  karma: {
    commentKarma: number;
    postKarma: number;
    totalKarma: number;
  };
  accountStatus: string[];
  accountCreated: string;
  profileUrl: string;
  activityAnalysis: string;
  recommendations: string;
}

export interface FormattedPostInfo {
  title: string;
  type: string;
  content: string;
  author: string;
  subreddit: string;
  stats: {
    score: number;
    upvoteRatio: number;
    comments: number;
  };
  metadata: {
    posted: string;
    flags: string[];
    flair: string;
  };
  links: {
    fullPost: string;
    shortLink: string;
  };
  engagementAnalysis: string;
  bestTimeToEngage: string;
}

export interface FormattedSubredditInfo {
  name: string;
  title: string;
  stats: {
    subscribers: number;
    activeUsers: number | string;
  };
  description: {
    short: string;
    full: string;
  };
  metadata: {
    created: string;
    flags: string[];
  };
  links: {
    subreddit: string;
    wiki: string;
  };
  communityAnalysis: string;
  engagementTips: string;
}

export interface FormattedCommentInfo {
  author: string;
  content: string;
  stats: {
    score: number;
    controversiality: number | string;
  };
  context: {
    subreddit: string;
    thread: string;
  };
  metadata: {
    posted: string;
    flags: string[];
  };
  link: string;
  commentAnalysis: string;
}
