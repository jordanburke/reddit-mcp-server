import { describe, it, expect } from "vitest"
import {
  formatTimestamp,
  analyzeUserActivity,
  analyzePostEngagement,
  analyzeSubredditHealth,
  getUserRecommendations,
  getBestEngagementTime,
} from "../formatters"

describe("formatters", () => {
  describe("formatTimestamp", () => {
    it("should format Unix timestamp to readable date", () => {
      const timestamp = 1700000000 // Nov 14, 2023 22:13:20 UTC (time zone dependent)
      const result = formatTimestamp(timestamp)
      
      // Just check it returns a reasonable date format
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/)
    })

    it("should handle invalid timestamps gracefully", () => {
      const result = formatTimestamp(NaN)
      
      expect(result).toBe("NaN")
    })

    it("should handle edge case of zero timestamp", () => {
      const result = formatTimestamp(0)
      
      expect(result).toBe("1970-01-01 00:00:00 UTC")
    })
  })

  describe("analyzeUserActivity", () => {
    it("should identify comment-focused users", () => {
      const result = analyzeUserActivity(10, false, 180)
      
      expect(result).toContain("Primarily a commenter")
      expect(result).toContain("highly engaged in discussions")
    })

    it("should identify content creators", () => {
      const result = analyzeUserActivity(0.1, false, 180)
      
      expect(result).toContain("Content creator")
      expect(result).toContain("focuses on sharing posts")
    })

    it("should identify balanced users", () => {
      const result = analyzeUserActivity(1.0, false, 180)
      
      expect(result).toContain("Balanced participation")
      expect(result).toContain("both posting and commenting")
    })

    it("should identify new users", () => {
      const result = analyzeUserActivity(1.0, false, 15)
      
      expect(result).toContain("New user")
      expect(result).toContain("still exploring Reddit")
    })

    it("should identify long-time users", () => {
      const result = analyzeUserActivity(1.0, false, 365 * 6)
      
      expect(result).toContain("Long-time Redditor")
      expect(result).toContain("extensive platform experience")
    })

    it("should identify moderators", () => {
      const result = analyzeUserActivity(1.0, true, 180)
      
      expect(result).toContain("Community leader")
      expect(result).toContain("maintain subreddit quality")
    })

    it("should combine multiple insights", () => {
      const result = analyzeUserActivity(10, true, 15)
      
      expect(result).toContain("Primarily a commenter")
      expect(result).toContain("New user")
      expect(result).toContain("Community leader")
    })
  })

  describe("analyzePostEngagement", () => {
    it("should analyze highly successful posts", () => {
      const result = analyzePostEngagement(1500, 0.96, 200)
      
      expect(result).toContain("Highly successful")
      expect(result).toContain("strong community approval")
      expect(result).toContain("Generated significant discussion")
    })

    it("should analyze well-received posts", () => {
      const result = analyzePostEngagement(500, 0.85, 50)
      
      expect(result).toContain("Well-received post with good engagement")
    })

    it("should analyze controversial posts", () => {
      const result = analyzePostEngagement(100, 0.4, 300)
      
      expect(result).toContain("Controversial post that sparked debate")  
      expect(result).toContain("Generated significant discussion")
    })

    it("should analyze posts with no comments", () => {
      const result = analyzePostEngagement(50, 0.8, 0)
      
      expect(result).toContain("Yet to receive community interaction")
    })

    it("should handle edge cases", () => {
      const result = analyzePostEngagement(0, 0, 0)
      
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
    })
  })

  describe("analyzeSubredditHealth", () => {
    it("should analyze major subreddits", () => {
      const result = analyzeSubredditHealth(2000000, 10000, 365 * 10)
      
      expect(result).toContain("Major subreddit with massive following")
      expect(result).toContain("Mature subreddit with established culture")
    })

    it("should analyze well-established communities", () => {
      const result = analyzeSubredditHealth(500000, 5000, 365 * 3)
      
      expect(result).toContain("Well-established community")
    })

    it("should analyze niche communities", () => {
      const result = analyzeSubredditHealth(500, 50, 30)
      
      expect(result).toContain("Niche community, potential for growth")
      expect(result).toContain("New subreddit still forming its community")
    })

    it("should handle active user analysis", () => {
      const result = analyzeSubredditHealth(10000, 1500, 365)
      
      expect(result).toContain("Highly active community with strong engagement")
    })

    it("should handle low activity analysis", () => {
      const result = analyzeSubredditHealth(100000, 50, 365)
      
      expect(result).toContain("Could benefit from more community engagement initiatives")
    })
  })

  describe("getUserRecommendations", () => {
    it("should recommend posting for comment-heavy users", () => {
      const result = getUserRecommendations(10, false, 180)
      
      expect(result).toContain("Consider creating more posts to share your expertise")
    })

    it("should recommend engaging for post-heavy users", () => {
      const result = getUserRecommendations(0.1, false, 180)
      
      expect(result).toContain("Engage more in discussions to build community connections")
    })

    it("should provide new user guidance", () => {
      const result = getUserRecommendations(1.0, false, 15)
      
      expect(result).toContain("Explore popular subreddits")
      expect(result).toContain("Read community guidelines")
    })

    it("should provide moderator insights", () => {
      const result = getUserRecommendations(1.0, true, 365)
      
      expect(result).toContain("Share moderation insights")
    })

    it("should provide default advice for balanced users", () => {
      const result = getUserRecommendations(1.0, false, 180)
      
      expect(result).toContain("Maintain your balanced engagement")
    })
  })

  describe("getBestEngagementTime", () => {
    it("should return a string result for any timestamp", () => {
      const timestamp = 1700000000
      const result = getBestEngagementTime(timestamp)
      
      expect(typeof result).toBe("string")
      expect(result.length).toBeGreaterThan(0)
    })

    it("should handle different times of day", () => {
      // Test with a few different timestamps
      const timestamps = [1700000000, 1700040000, 1700080000]
      
      timestamps.forEach(timestamp => {
        const result = getBestEngagementTime(timestamp)
        expect(typeof result).toBe("string")
        expect(result.length).toBeGreaterThan(0)
      })
    })

    it("should provide engagement timing advice", () => {
      const timestamp = 1700000000
      const result = getBestEngagementTime(timestamp)
      
      // Should contain timing-related words
      expect(result.toLowerCase()).toMatch(/time|hour|timing|active|engagement|post/)
    })
  })
})