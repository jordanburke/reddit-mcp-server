/* eslint-disable functype/prefer-functype-map, functype/prefer-option, functype/no-imperative-loops --
 * This module is a deliberately imperative performance primitive: a mutable, byte-bounded
 * LRU cache. A functype immutable Map cannot express LRU access-order reordering or running
 * byte accounting without rebuilding the whole structure on every operation, and the eviction
 * loop and undefined "miss" sentinel are the clearest expression of that stateful contract.
 * Mirrors the imperative-boundary convention used in reddit-client.ts.
 */

/**
 * In-memory cache for read-only Reddit GET responses.
 *
 * Reddit's rate limits are tight (~10 req/min anonymous, 60-100 authenticated),
 * so caching identical reads for a short window meaningfully reduces request
 * pressure. TTLs are adaptive: volatile listings expire quickly while relatively
 * stable resources (top/controversial, search, user/subreddit "about") live longer.
 *
 * Eviction is LRU bounded by a byte budget, so the cache can never grow unbounded.
 */

type CacheEntry = {
  readonly body: string
  readonly status: number
  readonly expiresAt: number
  readonly bytes: number
}

export type CachedResponse = {
  readonly body: string
  readonly status: number
}

const SECOND = 1_000

export class ResponseCache {
  private readonly maxBytes: number
  private readonly now: () => number
  // Map iteration order is insertion order, which we use as the LRU ordering:
  // the first key is the least-recently-used entry.
  private readonly entries = new Map<string, CacheEntry>()
  private currentBytes = 0

  constructor(options: { readonly maxBytes: number; readonly now?: () => number }) {
    this.maxBytes = options.maxBytes
    this.now = options.now ?? Date.now
  }

  /** Adaptive TTL (in milliseconds) for a given request URL. */
  ttlFor(url: string): number {
    if (/\/(hot|new|rising)\.json/.test(url)) {
      return 60 * SECOND
    }
    if (/\/(top|controversial)\.json/.test(url) || /\/search\.json/.test(url) || /\/about\.json/.test(url)) {
      return 300 * SECOND
    }
    if (/\/comments\//.test(url)) {
      return 60 * SECOND
    }
    return 120 * SECOND
  }

  get(url: string): CachedResponse | undefined {
    const entry = this.entries.get(url)
    if (entry === undefined) {
      return undefined
    }
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(url)
      this.currentBytes -= entry.bytes
      return undefined
    }
    // Mark as most-recently-used by reinserting at the end.
    this.entries.delete(url)
    this.entries.set(url, entry)
    return { body: entry.body, status: entry.status }
  }

  set(url: string, body: string, status: number): void {
    const bytes = Buffer.byteLength(body, "utf8")
    // A single oversized body is simply not cached.
    if (bytes > this.maxBytes) {
      return
    }

    const existing = this.entries.get(url)
    if (existing !== undefined) {
      this.entries.delete(url)
      this.currentBytes -= existing.bytes
    }

    this.entries.set(url, {
      body,
      status,
      expiresAt: this.now() + this.ttlFor(url),
      bytes,
    })
    this.currentBytes += bytes

    this.evictUntilWithinBudget()
  }

  private evictUntilWithinBudget(): void {
    while (this.currentBytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) {
        return
      }
      const oldest = this.entries.get(oldestKey)
      this.entries.delete(oldestKey)
      if (oldest !== undefined) {
        this.currentBytes -= oldest.bytes
      }
    }
  }
}
