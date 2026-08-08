/* eslint-disable functype/prefer-either, functype/prefer-fold --
 * These validators are called from inside the `Try` bodies in reddit-client.ts, which can only
 * signal failure by throwing; the throw is captured there and converted to
 * `Either<RedditError, T>` by `classifyRedditError`. Returning Either here would force every
 * call site to unwrap mid-path-construction for no added safety. Same rationale as the
 * file-level disable in reddit-client.ts. The ternary flagged by prefer-fold is a native
 * `undefined` check, not an Option.
 */

/**
 * Validation and normalization for Reddit identifiers that get interpolated into API paths.
 *
 * Every identifier reaching the client is model- or user-supplied. Interpolating one raw is a
 * path-injection hole: URL parsing resolves dot segments, so a `subreddit` of `../../api/v1/me`
 * escapes `/r/{sub}/about.json` and steers the OAuth bearer token to a different endpoint, and an
 * embedded `?` or `&` injects query parameters into the request we build.
 *
 * So each identifier is normalized (stripping the `r/`, `/u/`, `t3_` prefixes people naturally
 * type) and then checked against Reddit's own charset. Every value returned from this module
 * matches `[A-Za-z0-9_+-]+`, which is already URL-path-safe — no percent-encoding is applied,
 * because encoding the `+` in a multireddit (`r/science+space`) would break it.
 */
import { ValidationError } from "../client/errors"

// Reddit subreddit names: 3-21 chars, letters/digits/underscore. The `u_` prefix denotes a user
// profile "subreddit" (r/u_spez), which the listing endpoints accept.
const SUBREDDIT_PATTERN = /^(u_)?[A-Za-z0-9][A-Za-z0-9_]{1,20}$/

// Reddit usernames: 3-20 chars, letters/digits/underscore/hyphen.
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/

// Thing IDs are base36. Reddit mints them lowercase; we accept either case and normalize down.
const THING_ID_PATTERN = /^[a-z0-9]{1,13}$/

const stripLeading = (value: string, prefixes: readonly string[]): string => {
  const lower = value.toLowerCase()
  const matched = prefixes.find((prefix) => lower.startsWith(prefix))
  return matched === undefined ? value : value.slice(matched.length)
}

const bare = (value: string, prefixes: readonly string[]): string =>
  stripLeading(stripLeading(value.trim(), ["/"]), prefixes).replace(/\/+$/, "")

/**
 * Normalize a subreddit name for use in a path segment.
 *
 * Accepts `science`, `r/science`, `/r/science`, and `+`-joined multireddits (`science+space`).
 * The empty string passes through unchanged — callers use it to mean "the home feed".
 */
export function normalizeSubreddit(input: string): string {
  const trimmed = input.trim()
  if (trimmed === "") {
    return ""
  }

  const segments = bare(trimmed, ["r/"])
    .split("+")
    .map((segment) => segment.trim())

  const invalid = segments.find((segment) => !SUBREDDIT_PATTERN.test(segment))
  if (invalid !== undefined) {
    throw new ValidationError(
      `Invalid subreddit name "${input}". Expected 2-21 characters of letters, digits, or underscores (e.g. "science").`,
    )
  }

  return segments.join("+")
}

/** Normalize a username for use in a path segment. Accepts `spez`, `u/spez`, `/user/spez`. */
export function normalizeUsername(input: string): string {
  const name = bare(input, ["user/", "u/"])

  if (!USERNAME_PATTERN.test(name)) {
    throw new ValidationError(
      `Invalid Reddit username "${input}". Expected 2-20 characters of letters, digits, underscores, or hyphens (e.g. "spez").`,
    )
  }

  return name
}

/**
 * Normalize a post or comment ID to its bare base36 form, dropping any `t1_`/`t3_` fullname
 * prefix. Use this wherever the ID lands in a path segment or query value.
 */
export function normalizeThingId(input: string): string {
  const id = bare(input, ["t1_", "t3_", "t4_", "t5_"]).toLowerCase()

  if (!THING_ID_PATTERN.test(id)) {
    throw new ValidationError(
      `Invalid Reddit ID "${input}". Expected a base36 id such as "1abc2de", optionally prefixed with t1_ or t3_.`,
    )
  }

  return id
}

/**
 * Normalize an ID to a Reddit fullname (`t3_1abc2de`), preserving an explicit `t1_`/`t3_` prefix
 * and falling back to `defaultKind` when the caller passed a bare ID.
 */
export function normalizeFullname(input: string, defaultKind: "t1" | "t3"): string {
  const trimmed = input.trim().toLowerCase()
  const kind = trimmed.startsWith("t1_") ? "t1" : trimmed.startsWith("t3_") ? "t3" : defaultKind
  return `${kind}_${normalizeThingId(input)}`
}
