import { describe, expect, it } from "vitest"

import { ResponseCache } from "../response-cache"

describe("ResponseCache", () => {
  describe("ttlFor", () => {
    const cache = new ResponseCache({ maxBytes: 1_000_000 })

    it("uses a short TTL for volatile listings", () => {
      expect(cache.ttlFor("https://oauth.reddit.com/r/programming/hot.json?limit=10")).toBe(60_000)
      expect(cache.ttlFor("https://oauth.reddit.com/r/programming/new.json?limit=10")).toBe(60_000)
      expect(cache.ttlFor("https://oauth.reddit.com/r/programming/rising.json?limit=10")).toBe(60_000)
    })

    it("uses a longer TTL for top, controversial, search and about endpoints", () => {
      expect(cache.ttlFor("https://oauth.reddit.com/r/programming/top.json?t=week")).toBe(300_000)
      expect(cache.ttlFor("https://oauth.reddit.com/r/programming/controversial.json?t=week")).toBe(300_000)
      expect(cache.ttlFor("https://oauth.reddit.com/search.json?q=foo")).toBe(300_000)
      expect(cache.ttlFor("https://oauth.reddit.com/r/programming/about.json")).toBe(300_000)
      expect(cache.ttlFor("https://oauth.reddit.com/user/spez/about.json")).toBe(300_000)
    })

    it("uses a short TTL for comment threads and a default otherwise", () => {
      expect(cache.ttlFor("https://oauth.reddit.com/r/programming/comments/abc123.json")).toBe(60_000)
      expect(cache.ttlFor("https://oauth.reddit.com/api/info.json?id=t3_abc")).toBe(120_000)
    })
  })

  describe("get/set", () => {
    it("returns a stored entry before it expires", () => {
      let now = 1_000
      const cache = new ResponseCache({ maxBytes: 1_000_000, now: () => now })

      cache.set("https://oauth.reddit.com/r/x/hot.json", '{"ok":true}', 200)
      now += 59_000 // still under the 60s listing TTL

      const hit = cache.get("https://oauth.reddit.com/r/x/hot.json")
      expect(hit).toEqual({ body: '{"ok":true}', status: 200 })
    })

    it("returns undefined once an entry has expired", () => {
      let now = 1_000
      const cache = new ResponseCache({ maxBytes: 1_000_000, now: () => now })

      cache.set("https://oauth.reddit.com/r/x/hot.json", '{"ok":true}', 200)
      now += 61_000 // past the 60s listing TTL

      expect(cache.get("https://oauth.reddit.com/r/x/hot.json")).toBeUndefined()
    })

    it("returns undefined on a miss", () => {
      const cache = new ResponseCache({ maxBytes: 1_000_000 })
      expect(cache.get("https://oauth.reddit.com/nope.json")).toBeUndefined()
    })
  })

  describe("eviction", () => {
    it("evicts the least-recently-used entry when over the byte budget", () => {
      // Each body is 10 bytes; budget holds two entries.
      const cache = new ResponseCache({ maxBytes: 20 })

      cache.set("a", "0123456789", 200)
      cache.set("b", "0123456789", 200)
      // Touch "a" so "b" becomes least-recently-used.
      expect(cache.get("a")).toBeDefined()
      cache.set("c", "0123456789", 200)

      expect(cache.get("b")).toBeUndefined()
      expect(cache.get("a")).toBeDefined()
      expect(cache.get("c")).toBeDefined()
    })
  })
})
