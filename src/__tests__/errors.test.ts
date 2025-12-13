import { describe, it, expect } from "vitest"
import {
  ClearAuthError,
  ClearAuthSqlError,
  ClearAuthConfigError,
  ClearAuthNetworkError,
  ClearAuthTimeoutError,
  ClearAuthRateLimitError
} from "../errors.js"

describe("errors", () => {
  describe("ClearAuthError", () => {
    it("should create error with code and details", () => {
      const err = new ClearAuthError("Test error", "TEST_CODE", { foo: "bar" })
      expect(err.message).toBe("Test error")
      expect(err.code).toBe("TEST_CODE")
      expect(err.details).toEqual({ foo: "bar" })
      expect(err.name).toBe("ClearAuthError")
    })
  })

  describe("ClearAuthSqlError", () => {
    it("should create SQL error", () => {
      const err = new ClearAuthSqlError("SQL failed", { query: "SELECT *" })
      expect(err.message).toBe("SQL failed")
      expect(err.code).toBe("CLEARAUTH_SQL_ERROR")
      expect(err.name).toBe("ClearAuthSqlError")
    })
  })

  describe("ClearAuthConfigError", () => {
    it("should create config error", () => {
      const err = new ClearAuthConfigError("Missing env var", { env: "MECH_APP_ID" })
      expect(err.message).toBe("Missing env var")
      expect(err.code).toBe("CLEARAUTH_CONFIG_ERROR")
      expect(err.name).toBe("ClearAuthConfigError")
    })
  })

  describe("ClearAuthNetworkError", () => {
    it("should create network error with status code", () => {
      const err = new ClearAuthNetworkError("Connection failed", 500, { url: "https://example.com" })
      expect(err.message).toBe("Connection failed")
      expect(err.statusCode).toBe(500)
      expect(err.code).toBe("CLEARAUTH_NETWORK_ERROR")
      expect(err.name).toBe("ClearAuthNetworkError")
    })
  })

  describe("ClearAuthTimeoutError", () => {
    it("should create timeout error", () => {
      const err = new ClearAuthTimeoutError("Timeout", { timeout: 30000 })
      expect(err.message).toBe("Timeout")
      expect(err.code).toBe("CLEARAUTH_TIMEOUT_ERROR")
      expect(err.name).toBe("ClearAuthTimeoutError")
    })
  })

  describe("ClearAuthRateLimitError", () => {
    it("should create rate limit error with retry after", () => {
      const err = new ClearAuthRateLimitError(60000, { endpoint: "/query" })
      expect(err.message).toContain("Rate limit exceeded")
      expect(err.retryAfter).toBe(60000)
      expect(err.code).toBe("CLEARAUTH_RATE_LIMIT_ERROR")
      expect(err.name).toBe("ClearAuthRateLimitError")
    })
  })
})
