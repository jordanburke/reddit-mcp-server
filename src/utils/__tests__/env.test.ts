import { describe, expect, it } from "vitest"

import { hasUserCredentials, readEnv } from "../env"

describe("readEnv", () => {
  it("returns a set value as written", () => {
    expect(readEnv("TOKEN", { TOKEN: "abc" }).orUndefined()).toBe("abc")
  })

  it("keeps surrounding spaces in a non-blank value", () => {
    expect(readEnv("PASSWORD", { PASSWORD: " pass word " }).orUndefined()).toBe(" pass word ")
  })

  it.each([
    ["missing", {}],
    ["empty, as dotenv parses `KEY=`", { TOKEN: "" }],
    ["whitespace only", { TOKEN: "   " }],
  ])("treats a %s value as unset", (_label, env: NodeJS.ProcessEnv) => {
    expect(readEnv("TOKEN", env).isNone()).toBe(true)
  })

  it("falls back to a default for an empty value", () => {
    expect(readEnv("PORT", { PORT: "" }).orElse("3000")).toBe("3000")
  })
})

describe("hasUserCredentials", () => {
  it("is true when both are set", () => {
    expect(hasUserCredentials({ REDDIT_USERNAME: "me", REDDIT_PASSWORD: "pw" })).toBe(true)
  })

  it.each([
    ["no password", { REDDIT_USERNAME: "me" }],
    ["an empty password", { REDDIT_USERNAME: "me", REDDIT_PASSWORD: "" }],
    ["an empty username", { REDDIT_USERNAME: "", REDDIT_PASSWORD: "pw" }],
    ["both empty, as in a copied .env.example", { REDDIT_USERNAME: "", REDDIT_PASSWORD: "" }],
  ])("is false with %s", (_label, env: NodeJS.ProcessEnv) => {
    expect(hasUserCredentials(env)).toBe(false)
  })
})
