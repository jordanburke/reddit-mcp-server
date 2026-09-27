import { Option, Try } from "functype"

import type {
  FormattedCommentInfo,
  FormattedPostInfo,
  FormattedSubredditInfo,
  FormattedUserInfo,
  RedditComment,
  RedditPost,
  RedditSubreddit,
  RedditUser,
} from "../types"

export function formatTimestamp(timestamp: number): string {
  return Try(() => {
    const date = new Date(timestamp * 1000)
    return date
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, " UTC")
  }).orElse(String(timestamp))
}

export function analyzeUserActivity(karmaRatio: number, isMod: boolean, accountAgeDays: number): string {
  const insights: readonly string[] = [
    ...(karmaRatio > 5
      ? ["Primarily a commenter, highly engaged in discussions"]
      : karmaRatio < 0.2
        ? ["Content creator, focuses on sharing posts"]
        : ["Balanced participation in both posting and commenting"]),
    ...(accountAgeDays < 30
      ? ["New user, still exploring Reddit"]
      : accountAgeDays > 365 * 5
        ? ["Long-time Redditor with extensive platform experience"]
        : []),
    ...(isMod ? ["Community leader who helps maintain subreddit quality"] : []),
  ]

  return insights.join("\n  - ")
}

export function analyzePostEngagement(score: number, ratio: number, numComments: number): string {
  const insights: readonly string[] = [
    ...(score > 1000 && ratio > 0.95
      ? ["Highly successful post with strong community approval"]
      : score > 100 && ratio > 0.8
        ? ["Well-received post with good engagement"]
        : ratio < 0.5
          ? ["Controversial post that sparked debate"]
          : []),
    ...(numComments > 100
      ? ["Generated significant discussion"]
      : numComments > score * 0.5
        ? ["Highly discussable content with active comment section"]
        : numComments === 0
          ? ["Yet to receive community interaction"]
          : []),
  ]

  return insights.join("\n  - ")
}

export function analyzeSubredditHealth(subscribers: number, activeUsers: Option<number>, ageDays: number): string {
  const sizeInsights: readonly string[] =
    subscribers > 1000000
      ? ["Major subreddit with massive following"]
      : subscribers > 100000
        ? ["Well-established community"]
        : subscribers < 1000
          ? ["Niche community, potential for growth"]
          : []

  const activityInsights: readonly string[] = activeUsers
    .map((active) => active / subscribers)
    .fold(
      () => [] as readonly string[],
      (activityRatio) =>
        activityRatio > 0.1
          ? ["Highly active community with strong engagement"]
          : activityRatio < 0.01
            ? ["Could benefit from more community engagement initiatives"]
            : [],
    )

  const ageInsights: readonly string[] =
    ageDays > 365 * 5
      ? ["Mature subreddit with established culture"]
      : ageDays < 90
        ? ["New subreddit still forming its community"]
        : []

  return [...sizeInsights, ...activityInsights, ...ageInsights].join("\n  - ")
}

export function getUserRecommendations(karmaRatio: number, isMod: boolean, accountAgeDays: number): string {
  const recommendations: readonly string[] = [
    ...(karmaRatio > 5
      ? ["Consider creating more posts to share your expertise"]
      : karmaRatio < 0.2
        ? ["Engage more in discussions to build community connections"]
        : []),
    ...(accountAgeDays < 30
      ? ["Explore popular subreddits in your areas of interest", "Read community guidelines before posting"]
      : []),
    ...(isMod ? ["Share moderation insights with other community leaders"] : []),
  ]

  return recommendations.length > 0 ? recommendations.join("\n  - ") : "Maintain your balanced engagement across Reddit"
}

export function getBestEngagementTime(createdUtc: number): string {
  const postHour = new Date(createdUtc * 1000).getHours()

  if (14 <= postHour && postHour <= 18) {
    return "Posted during peak engagement hours (2 PM - 6 PM), good timing!"
  } else if (23 <= postHour || postHour <= 5) {
    return "Consider posting during more active hours (morning to evening)"
  } else {
    return "Posted during moderate activity hours, timing could be optimized"
  }
}

export function getSubredditEngagementTips(subreddit: RedditSubreddit): string {
  const sizeTips: readonly string[] =
    subreddit.subscribers > 1000000
      ? ["Post during peak hours for maximum visibility", "Ensure content is highly polished due to high competition"]
      : subreddit.subscribers < 1000
        ? ["Engage actively to help grow the community", "Consider cross-posting to related larger subreddits"]
        : []

  const activityTips: readonly string[] = Option(subreddit.activeUserCount)
    .map((active) => active / subreddit.subscribers)
    .fold(
      () => [] as readonly string[],
      (activityRatio) =>
        activityRatio > 0.1 ? ["Quick responses recommended due to high activity"] : ([] as readonly string[]),
    )

  const allTips = [...sizeTips, ...activityTips]
  return allTips.length > 0 ? allTips.join("\n  - ") : "Regular engagement recommended to maintain community presence"
}

export function analyzeCommentImpact(score: number, isEdited: boolean, isOp: boolean): string {
  const insights: readonly string[] = [
    ...(score > 100
      ? ["Highly upvoted comment with significant community agreement"]
      : score < 0
        ? ["Controversial or contested viewpoint"]
        : []),
    ...(isEdited ? ["Refined for clarity or accuracy"] : []),
    ...(isOp ? ["Author's perspective adds context to original post"] : []),
  ]

  return insights.length > 0 ? insights.join("\n  - ") : "Standard engagement with discussion"
}

export function formatUserInfo(user: RedditUser): FormattedUserInfo {
  const accountAgeDays = (Date.now() / 1000 - user.createdUtc) / (24 * 3600)
  const karmaRatio = user.commentKarma / (user.linkKarma === 0 ? 1 : user.linkKarma)

  const status: readonly string[] = [
    ...(user.isMod ? ["Moderator"] : []),
    ...(user.isGold ? ["Reddit Gold Member"] : []),
    ...(user.isEmployee ? ["Reddit Employee"] : []),
  ]

  return {
    username: user.name,
    karma: {
      commentKarma: user.commentKarma,
      postKarma: user.linkKarma,
      totalKarma: user.totalKarma,
    },
    accountStatus: status.length > 0 ? status : ["Regular User"],
    accountCreated: formatTimestamp(user.createdUtc),
    profileUrl: user.profileUrl,
    activityAnalysis: analyzeUserActivity(karmaRatio, user.isMod, accountAgeDays),
    recommendations: getUserRecommendations(karmaRatio, user.isMod, accountAgeDays),
  }
}

const POST_CONTENT_MAX_LENGTH = 10000
const COMMENT_CONTENT_MAX_LENGTH = 5000

// Cut text to at most maxLength characters, ending in "..." when cut.
export function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.substring(0, maxLength - 3)}...` : text
}

// Link posts can carry body text too (e.g. an image post with a description), so show both.
// The URL goes last and is never truncated.
function postContent(post: RedditPost): string {
  const body = truncateText(post.selftext ?? "", POST_CONTENT_MAX_LENGTH)
  if (post.isSelf) return body
  return [body, post.url ?? ""].filter((part) => part.length > 0).join("\n\n")
}

export function formatPostInfo(post: RedditPost): FormattedPostInfo {
  const contentType = post.isSelf ? "Text Post" : "Link Post"

  const flags: readonly string[] = [
    ...(post.over18 ? ["NSFW"] : []),
    ...(post.spoiler === true ? ["Spoiler"] : []),
    ...(post.edited ? ["Edited"] : []),
  ]

  return {
    title: post.title,
    type: contentType,
    content: postContent(post),
    author: post.author,
    subreddit: post.subreddit,
    stats: {
      score: post.score,
      upvoteRatio: post.upvoteRatio,
      comments: post.numComments,
    },
    metadata: {
      posted: formatTimestamp(post.createdUtc),
      flags,
      flair: post.linkFlairText ?? "None",
    },
    links: {
      fullPost: `https://reddit.com${post.permalink}`,
      shortLink: `https://redd.it/${post.id}`,
    },
    engagementAnalysis: analyzePostEngagement(post.score, post.upvoteRatio, post.numComments),
    bestTimeToEngage: getBestEngagementTime(post.createdUtc),
  }
}

export function formatSubredditInfo(subreddit: RedditSubreddit): FormattedSubredditInfo {
  const flags: readonly string[] = [
    ...(subreddit.over18 ? ["NSFW"] : []),
    ...Option(subreddit.subredditType).fold(
      () => [] as readonly string[],
      (type) => [`Type: ${type}`] as readonly string[],
    ),
  ]

  const ageDays = (Date.now() / 1000 - subreddit.createdUtc) / (24 * 3600)

  return {
    name: subreddit.displayName,
    title: subreddit.title,
    stats: {
      subscribers: subreddit.subscribers,
      activeUsers: Option(subreddit.activeUserCount).fold(
        () => "Unknown" as number | string,
        (count) => count as number | string,
      ),
    },
    description: {
      short: subreddit.publicDescription,
      full:
        subreddit.description.length > 300 ? `${subreddit.description.substring(0, 297)}...` : subreddit.description,
    },
    metadata: {
      created: formatTimestamp(subreddit.createdUtc),
      flags: flags.length > 0 ? flags : ["None"],
    },
    links: {
      subreddit: `https://reddit.com${subreddit.url}`,
      wiki: `https://reddit.com/r/${subreddit.displayName}/wiki`,
    },
    communityAnalysis: analyzeSubredditHealth(subreddit.subscribers, Option(subreddit.activeUserCount), ageDays),
    engagementTips: getSubredditEngagementTips(subreddit),
  }
}

export function formatCommentInfo(
  comment: RedditComment,
  maxLength: number = COMMENT_CONTENT_MAX_LENGTH,
): FormattedCommentInfo {
  const flags: readonly string[] = [...(comment.edited ? ["Edited"] : []), ...(comment.isSubmitter ? ["OP"] : [])]

  return {
    author: comment.author,
    content: truncateText(comment.body, maxLength),
    stats: {
      score: comment.score,
      controversiality: comment.controversiality,
    },
    context: {
      subreddit: comment.subreddit,
      thread: comment.submissionTitle,
    },
    metadata: {
      posted: formatTimestamp(comment.createdUtc),
      flags: flags.length > 0 ? flags : ["None"],
    },
    link: `https://reddit.com${comment.permalink}`,
    commentAnalysis: analyzeCommentImpact(comment.score, comment.edited, comment.isSubmitter),
  }
}

// Simple formatter for posts (used in search and comment tools)
export function formatPost(post: RedditPost) {
  return {
    title: post.title,
    author: post.author,
    subreddit: post.subreddit,
    score: post.score,
    upvoteRatio: Math.round(post.upvoteRatio * 100),
    numComments: post.numComments,
    createdAt: formatTimestamp(post.createdUtc),
    selftext: post.selftext,
    permalink: post.permalink,
    nsfw: post.over18,
    spoiler: post.spoiler,
  }
}
