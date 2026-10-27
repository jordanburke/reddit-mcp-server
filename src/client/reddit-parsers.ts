// Parsers from Reddit's JSON wire shapes to the client's domain types. Shared by RedditClient
// and ArcticShiftClient: Arctic Shift serves the same t3/t1/t5 objects Reddit's API does.
import type {
  RedditApiCommentTreeData,
  RedditApiPostData,
  RedditApiRulesResponse,
  RedditApiSubredditResponse,
  RedditApiUserResponse,
  RedditComment,
  RedditPost,
  RedditRule,
  RedditSubreddit,
} from "../types"

type CommentChild = { readonly kind: string; readonly data: RedditApiCommentTreeData }

export function parsePostData(post: RedditApiPostData): RedditPost {
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

// A single t1 comment. `submissionTitle` falls back to the comment's own link_title, which
// listing endpoints include and comment-tree endpoints omit.
export function parseCommentData(
  comment: RedditApiCommentTreeData,
  submissionTitle?: string,
  depth?: number,
): RedditComment {
  return {
    id: comment.id,
    author: comment.author,
    body: comment.body ?? "",
    score: comment.score,
    controversiality: comment.controversiality,
    subreddit: comment.subreddit,
    submissionTitle: submissionTitle ?? comment.link_title ?? "",
    createdUtc: comment.created_utc,
    edited: Boolean(comment.edited),
    isSubmitter: comment.is_submitter,
    permalink: comment.permalink,
    ...(depth !== undefined ? { depth } : {}),
    parentId: comment.parent_id,
  }
}

// Flatten a nested comment tree depth-first, recording each comment's depth. "more" stubs and
// bodiless entries are skipped.
export function parseCommentTree(
  children: ReadonlyArray<CommentChild>,
  submissionTitle: string,
  depth: number = 0,
): readonly RedditComment[] {
  return children.flatMap((item) => {
    if (item.kind !== "t1" || item.data.body === undefined) return []
    const { replies } = item.data
    const childComments =
      replies !== undefined && typeof replies !== "string"
        ? parseCommentTree(replies.data.children, submissionTitle, depth + 1)
        : []
    return [parseCommentData(item.data, submissionTitle, depth), ...childComments]
  })
}

// Ids of comments collapsed into "more" stubs anywhere in the tree, for get_more_comments.
// Reddit's "continue this thread" stubs carry the placeholder id "_", which is skipped.
export function collectMoreIds(children: ReadonlyArray<CommentChild>): readonly string[] {
  return children.flatMap((item) => {
    if (item.kind === "more") {
      const ids = item.data.children
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && id !== "_") : []
    }
    const { replies } = item.data
    return replies !== undefined && typeof replies !== "string" ? collectMoreIds(replies.data.children) : []
  })
}

export function parseSubredditData(data: RedditApiSubredditResponse["data"]): RedditSubreddit {
  return {
    displayName: data.display_name,
    title: data.title,
    description: data.description,
    publicDescription: data.public_description,
    subscribers: data.subscribers,
    activeUserCount: data.active_user_count ?? undefined,
    createdUtc: data.created_utc,
    over18: data.over18,
    subredditType: data.subreddit_type,
    url: data.url,
  }
}

export function parseRuleData(rule: RedditApiRulesResponse["rules"][number]): RedditRule {
  return {
    shortName: rule.short_name,
    description: rule.description,
    kind: rule.kind,
    violationReason: rule.violation_reason,
    priority: rule.priority,
    createdUtc: rule.created_utc,
  }
}

// /search.json?type=sr and type=user return t5 (subreddit) and t2 (account) children rather than
// t3 posts. Surface them through the RedditPost shape searchReddit already returns, so the search
// formatter renders them without a breaking change; score carries subscribers/karma respectively.
export function parseSubredditSearchData(sub: RedditApiSubredditResponse["data"]): RedditPost {
  return {
    id: String(sub.id ?? sub.display_name),
    title: `r/${sub.display_name} (${sub.subscribers.toLocaleString("en-US")} subscribers)${sub.title ? ` — ${sub.title}` : ""}`,
    author: "",
    subreddit: sub.display_name,
    selftext: sub.public_description,
    url: `https://reddit.com${sub.url}`,
    score: sub.subscribers,
    upvoteRatio: 1,
    numComments: 0,
    createdUtc: sub.created_utc,
    over18: sub.over18,
    edited: false,
    isSelf: false,
    permalink: sub.url,
  }
}

export function parseUserSearchData(user: RedditApiUserResponse["data"]): RedditPost {
  const karma = user.total_karma ?? user.link_karma + user.comment_karma
  return {
    id: user.id,
    title: `u/${user.name} (${karma.toLocaleString("en-US")} karma)`,
    author: user.name,
    subreddit: "",
    url: `https://reddit.com/user/${user.name}`,
    score: karma,
    upvoteRatio: 1,
    numComments: 0,
    createdUtc: user.created_utc,
    over18: false,
    edited: false,
    isSelf: false,
    permalink: `/user/${user.name}`,
  }
}
