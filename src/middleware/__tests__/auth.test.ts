import { describe, it, expect, vi, beforeEach } from "vitest"
import { createAuthMiddleware, generateRandomToken } from "../auth"
import { Context } from "hono"
import { HTTPException } from "hono/http-exception"

describe("auth middleware", () => {
  let mockContext: Partial<Context>
  let mockNext: () => Promise<void>

  beforeEach(() => {
    vi.clearAllMocks()
    mockNext = vi.fn().mockResolvedValue(undefined)
    mockContext = {
      req: {
        header: vi.fn(),
      } as any,
    }
  })

  describe("createAuthMiddleware", () => {
    it("should allow requests when auth is disabled", async () => {
      const middleware = createAuthMiddleware({ enabled: false })
      
      await middleware(mockContext as Context, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
    })

    it("should allow requests when no token is configured", async () => {
      const middleware = createAuthMiddleware({ enabled: true })
      
      await middleware(mockContext as Context, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
    })

    it("should reject requests without Authorization header when auth is enabled", async () => {
      const middleware = createAuthMiddleware({ 
        enabled: true, 
        token: "test-token" 
      })
      
      mockContext.req!.header = vi.fn().mockReturnValue(undefined)
      
      await expect(middleware(mockContext as Context, mockNext)).rejects.toThrow(
        new HTTPException(401, { message: "Authorization header required" })
      )
      
      expect(mockNext).not.toHaveBeenCalled()
    })

    it("should reject requests with invalid authorization scheme", async () => {
      const middleware = createAuthMiddleware({ 
        enabled: true, 
        token: "test-token" 
      })
      
      mockContext.req!.header = vi.fn().mockReturnValue("Basic invalid-token")
      
      await expect(middleware(mockContext as Context, mockNext)).rejects.toThrow(
        new HTTPException(401, { message: "Invalid authorization scheme. Use 'Bearer <token>'" })
      )
      
      expect(mockNext).not.toHaveBeenCalled()
    })

    it("should reject requests without Bearer token", async () => {
      const middleware = createAuthMiddleware({ 
        enabled: true, 
        token: "test-token" 
      })
      
      mockContext.req!.header = vi.fn().mockReturnValue("Bearer")
      
      await expect(middleware(mockContext as Context, mockNext)).rejects.toThrow(
        new HTTPException(401, { message: "Bearer token required" })
      )
      
      expect(mockNext).not.toHaveBeenCalled()
    })

    it("should reject requests with invalid token", async () => {
      const middleware = createAuthMiddleware({ 
        enabled: true, 
        token: "correct-token" 
      })
      
      mockContext.req!.header = vi.fn().mockReturnValue("Bearer wrong-token")
      
      await expect(middleware(mockContext as Context, mockNext)).rejects.toThrow(
        new HTTPException(403, { message: "Invalid token" })
      )
      
      expect(mockNext).not.toHaveBeenCalled()
    })

    it("should allow requests with correct Bearer token", async () => {
      const middleware = createAuthMiddleware({ 
        enabled: true, 
        token: "correct-token" 
      })
      
      mockContext.req!.header = vi.fn().mockReturnValue("Bearer correct-token")
      
      await middleware(mockContext as Context, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
    })

    it("should handle malformed Authorization header gracefully", async () => {
      const middleware = createAuthMiddleware({ 
        enabled: true, 
        token: "test-token" 
      })
      
      mockContext.req!.header = vi.fn().mockReturnValue("InvalidFormat")
      
      await expect(middleware(mockContext as Context, mockNext)).rejects.toThrow(
        new HTTPException(401, { message: "Invalid authorization scheme. Use 'Bearer <token>'" })
      )
    })

    it("should work with default empty config", async () => {
      const middleware = createAuthMiddleware()
      
      await middleware(mockContext as Context, mockNext)
      
      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe("generateRandomToken", () => {
    it("should generate token with default length of 32", () => {
      const token = generateRandomToken()
      
      expect(token).toHaveLength(32)
      expect(token).toMatch(/^[A-Za-z0-9]+$/)
    })

    it("should generate token with custom length", () => {
      const token = generateRandomToken(16)
      
      expect(token).toHaveLength(16)
      expect(token).toMatch(/^[A-Za-z0-9]+$/)
    })

    it("should generate different tokens on multiple calls", () => {
      const token1 = generateRandomToken()
      const token2 = generateRandomToken()
      
      expect(token1).not.toBe(token2)
    })

    it("should handle edge case of length 1", () => {
      const token = generateRandomToken(1)
      
      expect(token).toHaveLength(1)
      expect(token).toMatch(/^[A-Za-z0-9]$/)
    })

    it("should handle edge case of length 0", () => {
      const token = generateRandomToken(0)
      
      expect(token).toHaveLength(0)
      expect(token).toBe("")
    })
  })
})