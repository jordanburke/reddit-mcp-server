import { Option } from "functype"

/**
 * Typed error channel for the Reddit client.
 *
 * The client's methods are the imperative-to-functional boundary: each captures throws
 * (network, HTTP, JSON parsing, validation, deliberate domain errors) inside a `Try` and
 * converts to a typed `Either<RedditError, T>`. Modelling the error as a discriminated ADT
 * — rather than a bare `Error` — makes the failure contract explicit at the type level, so
 * callers can reason about (and branch on) what actually went wrong without string-matching.
 *
 * `classifyRedditError` is TOTAL and never re-throws — every captured `Error` maps to a
 * variant — which is what makes the migration behavior-preserving: an error that was a
 * graceful `Left` before is still a graceful `Left` after, just with a richer type.
 *
 * Two-tier behavior, to preserve the exact messages of the original try/catch code:
 *  - A *deliberate* typed throw (HttpError, NotFoundError, …) already carries its final
 *    message, so it passes through unchanged.
 *  - An *unexpected* generic error (fetch/JSON/orThrow) is wrapped as UnknownError, with the
 *    optional `context` prefix — present for read methods (which prefixed in their catch),
 *    absent for write methods (which returned the raw message).
 */

abstract class RedditErrorBase extends Error {}

/** A non-ok HTTP response from the Reddit API. Carries the status for caller branching. */
export class HttpError extends RedditErrorBase {
  readonly _tag = "HttpError" as const
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "HttpError"
  }
}

/** A write operation was attempted without the required user credentials / in a wrong mode. */
export class NotAuthenticatedError extends RedditErrorBase {
  readonly _tag = "NotAuthenticatedError" as const
  constructor(message: string) {
    super(message)
    this.name = "NotAuthenticatedError"
  }
}

/** Reddit accepted the request but returned errors in its JSON envelope (or an unusable body). */
export class ApiError extends RedditErrorBase {
  readonly _tag = "ApiError" as const
  constructor(message: string) {
    super(message)
    this.name = "ApiError"
  }
}

/** The requested post/entity does not exist or is not accessible. */
export class NotFoundError extends RedditErrorBase {
  readonly _tag = "NotFoundError" as const
  constructor(message: string) {
    super(message)
    this.name = "NotFoundError"
  }
}

/** Client-side input or safety-policy rejection (invalid sort, duplicate-content guard). */
export class ValidationError extends RedditErrorBase {
  readonly _tag = "ValidationError" as const
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

/** Any failure that is not a recognized category: network, JSON parsing, unexpected throws. */
export class UnknownError extends RedditErrorBase {
  readonly _tag = "UnknownError" as const
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = "UnknownError"
  }
}

export type RedditError = HttpError | NotAuthenticatedError | ApiError | NotFoundError | ValidationError | UnknownError

export function isRedditError(error: unknown): error is RedditError {
  return error instanceof RedditErrorBase
}

/**
 * Total classifier from a captured `Error` to a `RedditError`. Deliberate typed throws pass
 * through unchanged; everything else becomes an `UnknownError`, prefixed with `context` when
 * provided so the observable message text matches the previous try/catch-based wrapping.
 */
export function classifyRedditError(error: Error, context?: string): RedditError {
  if (isRedditError(error)) {
    return error
  }
  const message = Option(context).fold(
    () => error.message,
    (ctx) => `${ctx}: ${error.message}`,
  )
  return new UnknownError(message, error)
}
