import {
  RedditUser,
  RedditPost,
  RedditSubreddit,
  RedditComment,
  FormattedUserInfo,
  FormattedPostInfo,
  FormattedSubredditInfo,
  FormattedCommentInfo,
} from "../types";

export function formatTimestamp(timestamp: number): string {
  try {
    const date = new Date(timestamp * 1000);
    return date
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, " UTC");
  } catch {
    return String(timestamp);
  }
}

export function analyzeUserActivity(
  karmaRatio: number,
  isMod: boolean,
  accountAgeDays: number
): string {
  const insights: string[] = [];

  // Analyze karma ratio
  if (karmaRatio > 5) {
    insights.push("Primarily a commenter, highly engaged in discussions");
  } else if (karmaRatio < 0.2) {
    insights.push("Content creator, focuses on sharing posts");
  } else {
    insights.push("Balanced participation in both posting and commenting");
  }

  // Analyze account age and status
  if (accountAgeDays < 30) {
    insights.push("New user, still exploring Reddit");
  } else if (accountAgeDays > 365 * 5) {
    insights.push("Long-time Redditor with extensive platform experience");
  }

  if (isMod) {
    insights.push("Community leader who helps maintain subreddit quality");
  }

  return insights.join("\n  - ");
}

export function analyzePostEngagement(
  score: number,
  ratio: number,
  numComments: number
): string {
  const insights: string[] = [];

  // Analyze score and ratio
  if (score > 1000 && ratio > 0.95) {
    insights.push("Highly successful post with strong community approval");
  } else if (score > 100 && ratio > 0.8) {
    insights.push("Well-received post with good engagement");
  } else if (ratio < 0.5) {
    insights.push("Controversial post that sparked debate");
  }

  // Analyze comment activity
  if (numComments > 100) {
    insights.push("Generated significant discussion");
  } else if (numComments > score * 0.5) {
    insights.push("Highly discussable content with active comment section");
  } else if (numComments === 0) {
    insights.push("Yet to receive community interaction");
  }

  return insights.join("\n  - ");
}

export function analyzeSubredditHealth(
  subscribers: number,
  activeUsers: number | undefined,
  ageDays: number
): string {
  const insights: string[] = [];

  // Analyze size and activity
  if (subscribers > 1000000) {
    insights.push("Major subreddit with massive following");
  } else if (subscribers > 100000) {
    insights.push("Well-established community");
  } else if (subscribers < 1000) {
    insights.push("Niche community, potential for growth");
  }

  if (activeUsers) {
    // If we have active users data
    const activityRatio = activeUsers / subscribers;
    if (activityRatio > 0.1) {
      insights.push("Highly active community with strong engagement");
    } else if (activityRatio < 0.01) {
      insights.push("Could benefit from more community engagement initiatives");
    }
  }

  // Analyze age and maturity
  if (ageDays > 365 * 5) {
    insights.push("Mature subreddit with established culture");
  } else if (ageDays < 90) {
    insights.push("New subreddit still forming its community");
  }

  return insights.join("\n  - ");
}

export function getUserRecommendations(
  karmaRatio: number,
  isMod: boolean,
  accountAgeDays: number
): string {
  const recommendations: string[] = [];

  if (karmaRatio > 5) {
    recommendations.push(
      "Consider creating more posts to share your expertise"
    );
  } else if (karmaRatio < 0.2) {
    recommendations.push(
      "Engage more in discussions to build community connections"
    );
  }

  if (accountAgeDays < 30) {
    recommendations.push(
      "Explore popular subreddits in your areas of interest"
    );
    recommendations.push("Read community guidelines before posting");
  }

  if (isMod) {
    recommendations.push(
      "Share moderation insights with other community leaders"
    );
  }

  if (!recommendations.length) {
    recommendations.push("Maintain your balanced engagement across Reddit");
  }

  return recommendations.join("\n  - ");
}

export function getBestEngagementTime(createdUtc: number): string {
  const postHour = new Date(createdUtc * 1000).getHours();

  // Simple time zone analysis
  if (14 <= postHour && postHour <= 18) {
    // Peak Reddit hours
    return "Posted during peak engagement hours (2 PM - 6 PM), good timing!";
  } else if (23 <= postHour || postHour <= 5) {
    return "Consider posting during more active hours (morning to evening)";
  } else {
    return "Posted during moderate activity hours, timing could be optimized";
  }
}

export function getSubredditEngagementTips(subreddit: RedditSubreddit): string {
  const tips: string[] = [];

  if (subreddit.subscribers > 1000000) {
    tips.push("Post during peak hours for maximum visibility");
    tips.push("Ensure content is highly polished due to high competition");
  } else if (subreddit.subscribers < 1000) {
    tips.push("Engage actively to help grow the community");
    tips.push("Consider cross-posting to related larger subreddits");
  }

  if (subreddit.activeUserCount) {
    const activityRatio = subreddit.activeUserCount / subreddit.subscribers;
    if (activityRatio > 0.1) {
      tips.push("Quick responses recommended due to high activity");
    }
  }

  return tips.length
    ? tips.join("\n  - ")
    : "Regular engagement recommended to maintain community presence";
}

export function analyzeCommentImpact(
  score: number,
  isEdited: boolean,
  isOp: boolean
): string {
  const insights: string[] = [];

  if (score > 100) {
    insights.push(
      "Highly upvoted comment with significant community agreement"
    );
  } else if (score < 0) {
    insights.push("Controversial or contested viewpoint");
  }

  if (isEdited) {
    insights.push("Refined for clarity or accuracy");
  }

  if (isOp) {
    insights.push("Author's perspective adds context to original post");
  }

  return insights.length
    ? insights.join("\n  - ")
    : "Standard engagement with discussion";
}

export function formatUserInfo(user: RedditUser): FormattedUserInfo {
  const status: string[] = [];
  if (user.isMod) status.push("Moderator");
  if (user.isGold) status.push("Reddit Gold Member");
  if (user.isEmployee) status.push("Reddit Employee");

  const accountAgeDays = (Date.now() / 1000 - user.createdUtc) / (24 * 3600); // age in days
  const karmaRatio = user.commentKarma / (user.linkKarma || 1);

  return {
    username: user.name,
    karma: {
      commentKarma: user.commentKarma,
      postKarma: user.linkKarma,
      totalKarma: user.totalKarma,
    },
    accountStatus: status.length ? status : ["Regular User"],
    accountCreated: formatTimestamp(user.createdUtc),
    profileUrl: user.profileUrl,
    activityAnalysis: analyzeUserActivity(
      karmaRatio,
      user.isMod,
      accountAgeDays
    ),
    recommendations: getUserRecommendations(
      karmaRatio,
      user.isMod,
      accountAgeDays
    ),
  };
}

export function formatPostInfo(post: RedditPost): FormattedPostInfo {
  const contentType = post.isSelf ? "Text Post" : "Link Post";
  const content = post.isSelf ? post.selftext || "" : post.url || "";

  const flags: string[] = [];
  if (post.over18) flags.push("NSFW");
  if (post.spoiler) flags.push("Spoiler");
  if (post.edited) flags.push("Edited");

  return {
    title: post.title,
    type: contentType,
    content: content.length > 300 ? content.substring(0, 297) + "..." : content,
    author: post.author,
    subreddit: post.subreddit,
    stats: {
      score: post.score,
      upvoteRatio: post.upvoteRatio,
      comments: post.numComments,
    },
    metadata: {
      posted: formatTimestamp(post.createdUtc),
      flags: flags,
      flair: post.linkFlairText || "None",
    },
    links: {
      fullPost: `https://reddit.com${post.permalink}`,
      shortLink: `https://redd.it/${post.id}`,
    },
    engagementAnalysis: analyzePostEngagement(
      post.score,
      post.upvoteRatio,
      post.numComments
    ),
    bestTimeToEngage: getBestEngagementTime(post.createdUtc),
  };
}

export function formatSubredditInfo(
  subreddit: RedditSubreddit
): FormattedSubredditInfo {
  const flags: string[] = [];
  if (subreddit.over18) flags.push("NSFW");
  if (subreddit.subredditType) flags.push(`Type: ${subreddit.subredditType}`);

  const ageDays = (Date.now() / 1000 - subreddit.createdUtc) / (24 * 3600);

  return {
    name: subreddit.displayName,
    title: subreddit.title,
    stats: {
      subscribers: subreddit.subscribers,
      activeUsers:
        subreddit.activeUserCount !== undefined
          ? subreddit.activeUserCount
          : "Unknown",
    },
    description: {
      short: subreddit.publicDescription,
      full:
        subreddit.description.length > 300
          ? subreddit.description.substring(0, 297) + "..."
          : subreddit.description,
    },
    metadata: {
      created: formatTimestamp(subreddit.createdUtc),
      flags: flags.length ? flags : ["None"],
    },
    links: {
      subreddit: `https://reddit.com${subreddit.url}`,
      wiki: `https://reddit.com/r/${subreddit.displayName}/wiki`,
    },
    communityAnalysis: analyzeSubredditHealth(
      subreddit.subscribers,
      subreddit.activeUserCount,
      ageDays
    ),
    engagementTips: getSubredditEngagementTips(subreddit),
  };
}

export function formatCommentInfo(
  comment: RedditComment
): FormattedCommentInfo {
  const flags: string[] = [];
  if (comment.edited) flags.push("Edited");
  if (comment.isSubmitter) flags.push("OP");

  return {
    author: comment.author,
    content:
      comment.body.length > 300
        ? comment.body.substring(0, 297) + "..."
        : comment.body,
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
      flags: flags.length ? flags : ["None"],
    },
    link: `https://reddit.com${comment.permalink}`,
    commentAnalysis: analyzeCommentImpact(
      comment.score,
      comment.edited,
      comment.isSubmitter
    ),
  };
}
