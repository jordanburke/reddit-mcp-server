import { Context, Next } from "hono"
import { HTTPException } from "hono/http-exception"

export interface AuthConfig {
  token?: string
  enabled?: boolean
}

export function createAuthMiddleware(config: AuthConfig = {}) {
  return async (c: Context, next: Next) => {
    // Skip auth if disabled or no token configured
    if (!config.enabled || !config.token) {
      return next()
    }

    const authHeader = c.req.header("Authorization")

    if (!authHeader) {
      throw new HTTPException(401, {
        message: "Authorization header required",
      })
    }

    const [scheme, token] = authHeader.split(" ")

    if (scheme !== "Bearer") {
      throw new HTTPException(401, {
        message: "Invalid authorization scheme. Use 'Bearer <token>'",
      })
    }

    if (!token) {
      throw new HTTPException(401, {
        message: "Bearer token required",
      })
    }

    if (token !== config.token) {
      throw new HTTPException(403, {
        message: "Invalid token",
      })
    }

    return next()
  }
}

export function generateRandomToken(length: number = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
