import { Option } from "functype"

/**
 * Read an environment variable, treating an empty or whitespace-only value as unset.
 *
 * dotenv turns a `KEY=` line into an empty string, so a copied `.env.example` would
 * otherwise read as configured: `OAUTH_TOKEN=` locked out every HTTP client, and
 * `REDDIT_AUTH_MODE=authenticated` with blank credentials started keyless instead of failing.
 * The value is returned as written; it is not trimmed, so a password may contain spaces.
 */
export function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): Option<string> {
  return Option(env[name]).filter((value) => value.trim() !== "")
}

/** True when both `REDDIT_USERNAME` and `REDDIT_PASSWORD` are set to non-blank values. */
export function hasUserCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return readEnv("REDDIT_USERNAME", env).isSome() && readEnv("REDDIT_PASSWORD", env).isSome()
}
