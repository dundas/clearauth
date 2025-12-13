import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { MechSqlClient } from "../mech-sql-client.js"
import { ClearAuthConfigError, ClearAuthNetworkError, ClearAuthTimeoutError } from "../errors.js"

describe("MechSqlClient", () => {
  const validUuid = "550e8400-e29b-41d4-a716-446655440000"
  const baseConfig = {
    appId: validUuid,
    apiKey: "test-key",
    baseUrl: "https://storage.mechdna.net",
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("should initialize with explicit config", () => {
      const client = new MechSqlClient(baseConfig)
      expect(client).toBeDefined()
    })

    it("should throw if appId is missing", () => {
      const { appId, ...config } = baseConfig
      expect(() => new MechSqlClient(config as any)).toThrow()
    })

    it("should default appSchemaId to appId when not provided", () => {
      // Should NOT throw - appSchemaId defaults to appId
      const client = new MechSqlClient(baseConfig)
      expect(client).toBeDefined()
    })

    it("should throw if apiKey is missing", () => {
      const { apiKey, ...config } = baseConfig
      expect(() => new MechSqlClient(config as any)).toThrow()
    })

    it("should throw if appId is not a valid UUID", () => {
      expect(() => new MechSqlClient({ ...baseConfig, appId: "not-a-uuid" })).toThrow(ClearAuthConfigError)
    })

    it("should accept config overrides", () => {
      const client = new MechSqlClient({
        baseUrl: "https://custom.example.com",
        appId: validUuid,
        appSchemaId: validUuid,
        apiKey: "custom-key",
        timeout: 5000,
        maxRetries: 1
      })
      expect(client).toBeDefined()
    })
  })

  describe("execute", () => {
    it("should execute a query successfully", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [{ id: 1, name: "test" }],
          rowCount: 1
        })
      })

      const client = new MechSqlClient(baseConfig)
      const result = await client.execute("SELECT * FROM users WHERE id = $1", [1])

      expect(result.rows).toEqual([{ id: 1, name: "test" }])
      expect(result.rowCount).toBe(1)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it("should handle empty result set", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [],
          rowCount: 0
        })
      })

      const client = new MechSqlClient(baseConfig)
      const result = await client.execute("SELECT * FROM users WHERE id = $1", [999])

      expect(result.rows).toEqual([])
      expect(result.rowCount).toBe(0)
    })

    it("should throw on HTTP error", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Server error"
      })

      const client = new MechSqlClient({ ...baseConfig, maxRetries: 0 })
      await expect(client.execute("SELECT *")).rejects.toThrow(ClearAuthNetworkError)
    })

    it("should throw on Mech API error", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid SQL"
          }
        })
      })

      const client = new MechSqlClient(baseConfig)
      await expect(client.execute("INVALID SQL")).rejects.toThrow("Invalid SQL")
    })

    it("should retry on transient failures", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          text: async () => "Temporarily unavailable"
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            rows: [{ id: 1 }],
            rowCount: 1
          })
        })

      const client = new MechSqlClient({ ...baseConfig, maxRetries: 2 })
      const result = await client.execute("SELECT *")

      expect(result.rows).toEqual([{ id: 1 }])
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it("should handle rate limiting", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "Retry-After": "60" }),
        text: async () => "Rate limited"
      })

      const client = new MechSqlClient({ ...baseConfig, maxRetries: 0 })
      await expect(client.execute("SELECT *")).rejects.toThrow("Rate limit exceeded")
    })
  })
})
