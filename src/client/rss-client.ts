import { XMLParser } from "fast-xml-parser"
import type { Either } from "functype"
import { Try } from "functype"

import type { Page, RedditPost } from "../types"
import { normalizeSubreddit } from "../utils/reddit-identifiers"
import type { RedditError } from "./errors"
import { classifyRedditError, HttpError } from "./errors"

type AtomContent = string | { readonly "#text"?: string; readonly "@_type"?: string }

type AtomEntry = {
  readonly author?: { readonly name?: string; readonly uri?: string }
  readonly category?: { readonly "@_term"?: string; readonly "@_label"?: string }
  readonly content?: AtomContent
  readonly id?: string
  readonly link?: { readonly "@_href"?: string }
  readonly updated?: string
  readonly published?: string
  readonly title?: string
}

function contentText(content: AtomContent | undefined): string {
  if (content === undefined) return ""
  if (typeof content === "string") return content
  return content["#text"] ?? ""
}

type AtomFeed = {
  readonly feed?: {
    readonly entry?: AtomEntry | readonly AtomEntry[]
    readonly subtitle?: string
    readonly title?: string
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
})

export function parseAtomFeed(xml: string): readonly AtomEntry[] {
  const result = parser.parse(xml) as AtomFeed
  const entries = result.feed?.entry
  if (!entries) return []
  return (Array.isArray(entries) ? entries : [entries]) as readonly AtomEntry[]
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#32;/g, " ")
    .replace(/&amp;/g, "&")
}

function extractLinkUrl(contentHtml: string): string | undefined {
  const match = contentHtml.match(/href="([^"]+)">\[link\]/)
  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined
}

function extractSelfText(contentHtml: string): string {
  const match = contentHtml.match(/<!-- SC_OFF -->(.*?)<!-- SC_ON -->/s)
  if (!match) return ""
  return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "")).trim()
}

export function atomEntryToRedditPost(entry: AtomEntry): RedditPost {
  const permalink = entry.link?.["@_href"] ?? ""
  const contentHtml = contentText(entry.content)
  const externalUrl = extractLinkUrl(contentHtml)
  const isSelf = !externalUrl || externalUrl.includes("/comments/")
  const author = (entry.author?.name ?? "").replace(/^\/u\//, "")
  const subreddit = entry.category?.["@_term"] ?? ""
  const thingId = entry.id ?? ""
  const postId = thingId.replace(/^t3_/, "")

  return {
    id: postId,
    title: entry.title ?? "",
    author,
    subreddit,
    selftext: extractSelfText(contentHtml),
    url: isSelf ? permalink : (externalUrl ?? permalink),
    score: 0,
    upvoteRatio: 0,
    numComments: 0,
    createdUtc: Math.floor(new Date(entry.published ?? entry.updated ?? "").getTime() / 1000),
    over18: false,
    edited: false,
    isSelf,
    permalink: permalink.replace("https://www.reddit.com", ""),
  }
}

type CacheEntry = { readonly page: Page<RedditPost>; readonly expiresAt: number }

const RSS_CACHE_TTL_MS = 60_000

export class RssClient {
  private readonly userAgent: string
  private readonly cache = new Map<string, CacheEntry>()

  constructor(userAgent: string) {
    this.userAgent = userAgent
  }

  async fetchSubredditPosts(
    subreddit: string,
    sort: string,
    timeFilter?: string,
    limit?: number,
    after?: string,
  ): Promise<Either<RedditError, Page<RedditPost>>> {
    const attempt = await Try.async(async (): Promise<Page<RedditPost>> => {
      const sub = normalizeSubreddit(subreddit)
      const basePath = sub === "" ? "" : `/r/${sub}`
      const sortPath = sort === "hot" ? "" : `/${sort}`
      const params = new URLSearchParams()
      if (timeFilter && (sort === "top" || sort === "controversial")) {
        params.set("t", timeFilter)
      }
      if (limit !== undefined) {
        params.set("limit", String(limit))
      }
      if (after !== undefined) {
        params.set("after", after)
      }
      const qs = params.size > 0 ? `?${params}` : ""
      const url = `https://www.reddit.com${basePath}${sortPath}/.rss${qs}`

      const cached = this.cache.get(url)
      if (cached && Date.now() < cached.expiresAt) {
        return cached.page
      }

      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent },
      })

      if (response.status === 429) {
        throw new HttpError(429, "RSS rate limit exceeded (~1 req/min for unauthenticated feeds). Try again shortly.")
      }

      if (!response.ok) {
        throw new HttpError(response.status, `RSS feed request failed: ${response.status} ${response.statusText}`)
      }

      const xml = await response.text()
      const entries = parseAtomFeed(xml)
      const allItems = entries.map(atomEntryToRedditPost)
      const cap = limit ?? 25
      const items = allItems.length > cap ? allItems.slice(0, cap) : allItems
      const hasMore = allItems.length > items.length
      const afterCursor = hasMore ? `t3_${items[items.length - 1]!.id}` : undefined
      const page: Page<RedditPost> = { items, source: "rss" as const, ...(afterCursor ? { after: afterCursor } : {}) }

      this.cache.set(url, { page, expiresAt: Date.now() + RSS_CACHE_TTL_MS })
      return page
    })

    return attempt.toEither((error) => classifyRedditError(error, "RSS fetch"))
  }
}
