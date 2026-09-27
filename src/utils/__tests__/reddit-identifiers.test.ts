import { describe, expect, it } from "vitest"

import { ValidationError } from "../../client/errors"
import { normalizeFullname, normalizeSubreddit, normalizeThingId, normalizeUsername } from "../reddit-identifiers"

describe("normalizeSubreddit", () => {
  it("passes a plain name through", () => {
    expect(normalizeSubreddit("science")).toBe("science")
  })

  it("strips the prefixes people naturally type", () => {
    expect(normalizeSubreddit("r/science")).toBe("science")
    expect(normalizeSubreddit("/r/science")).toBe("science")
    expect(normalizeSubreddit("  R/Science  ")).toBe("Science")
    expect(normalizeSubreddit("science/")).toBe("science")
  })

  it("keeps multireddits joined", () => {
    expect(normalizeSubreddit("science+space")).toBe("science+space")
    expect(normalizeSubreddit("r/science + space")).toBe("science+space")
  })

  it("allows user-profile subreddits", () => {
    expect(normalizeSubreddit("u_spez")).toBe("u_spez")
  })

  it("treats the empty string as the home feed", () => {
    expect(normalizeSubreddit("")).toBe("")
    expect(normalizeSubreddit("   ")).toBe("")
  })

  it("rejects path traversal", () => {
    expect(() => normalizeSubreddit("../../api/v1/me")).toThrow(ValidationError)
    expect(() => normalizeSubreddit("science/../../api/v1/me")).toThrow(ValidationError)
  })

  it("rejects query injection", () => {
    expect(() => normalizeSubreddit("science?limit=100&raw_json=1")).toThrow(ValidationError)
    expect(() => normalizeSubreddit("science#frag")).toThrow(ValidationError)
  })

  it("rejects names outside Reddit's charset or length", () => {
    expect(() => normalizeSubreddit("a")).toThrow(ValidationError)
    expect(() => normalizeSubreddit("sci ence")).toThrow(ValidationError)
    expect(() => normalizeSubreddit("s".repeat(22))).toThrow(ValidationError)
    expect(() => normalizeSubreddit("science+")).toThrow(ValidationError)
  })
})

describe("normalizeUsername", () => {
  it("strips the prefixes people naturally type", () => {
    expect(normalizeUsername("spez")).toBe("spez")
    expect(normalizeUsername("u/spez")).toBe("spez")
    expect(normalizeUsername("/u/spez")).toBe("spez")
    expect(normalizeUsername("/user/spez")).toBe("spez")
  })

  it("allows hyphens and underscores", () => {
    expect(normalizeUsername("some-user_name")).toBe("some-user_name")
  })

  it("rejects traversal and out-of-charset input", () => {
    expect(() => normalizeUsername("../../api/v1/me")).toThrow(ValidationError)
    expect(() => normalizeUsername("spez/about.json")).toThrow(ValidationError)
    expect(() => normalizeUsername("spez?x=1")).toThrow(ValidationError)
    expect(() => normalizeUsername("a")).toThrow(ValidationError)
    expect(() => normalizeUsername("u".repeat(21))).toThrow(ValidationError)
  })
})

describe("normalizeThingId", () => {
  it("returns the bare base36 id", () => {
    expect(normalizeThingId("1abc2de")).toBe("1abc2de")
    expect(normalizeThingId("t3_1abc2de")).toBe("1abc2de")
    expect(normalizeThingId("t1_1abc2de")).toBe("1abc2de")
    expect(normalizeThingId("T3_1ABC2DE")).toBe("1abc2de")
  })

  it("rejects anything that is not base36", () => {
    expect(() => normalizeThingId("../../api/v1/me")).toThrow(ValidationError)
    expect(() => normalizeThingId("1abc2de.json?x=1")).toThrow(ValidationError)
    expect(() => normalizeThingId("")).toThrow(ValidationError)
  })
})

describe("normalizeFullname", () => {
  it("applies the default kind to a bare id", () => {
    expect(normalizeFullname("1abc2de", "t3")).toBe("t3_1abc2de")
    expect(normalizeFullname("1abc2de", "t1")).toBe("t1_1abc2de")
  })

  it("preserves an explicit kind over the default", () => {
    expect(normalizeFullname("t1_1abc2de", "t3")).toBe("t1_1abc2de")
    expect(normalizeFullname("t3_1abc2de", "t1")).toBe("t3_1abc2de")
  })

  it("rejects an invalid id", () => {
    expect(() => normalizeFullname("t3_../../api/v1/me", "t3")).toThrow(ValidationError)
  })
})
