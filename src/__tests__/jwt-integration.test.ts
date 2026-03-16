/**
 * JWT Integration Tests
 *
 * Tests for JWT auto-issuance wired into the ClearAuth login/register/handler flows.
 */

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest"
import { generateKeyPair, exportPKCS8, exportSPKI } from "jose"
import { handleClearAuthRequest } from "../handler.js"
import { createClearAuth } from "../createMechAuth.js"
import { createPbkdf2PasswordHasher } from "../password-hasher.js"
import type { JwtConfig } from "../jwt/types.js"

const TEST_APP_ID = "550e8400-e29b-41d4-a716-446655440001"
const TEST_API_KEY = "test-api-key-jwt"
const TEST_SECRET = "test-secret-key-at-least-32-chars-long"
const expectedMechUrl = `https://storage.mechdna.net/api/apps/${TEST_APP_ID}/postgresql/query`

const hasher = createPbkdf2PasswordHasher()

let jwtConfig: JwtConfig

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true })
  const privateKeyPem = await exportPKCS8(privateKey)
  const publicKeyPem = await exportSPKI(publicKey)
  jwtConfig = {
    privateKey: privateKeyPem,
    publicKey: publicKeyPem,
    issuer: "test",
    audience: "test",
  }
})

describe("JWT Integration: createClearAuth with jwt config", () => {
  it("passes jwt config through to the resulting config object", () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    expect(config.jwt).toBeDefined()
    expect(config.jwt?.issuer).toBe("test")
    expect(config.jwt?.audience).toBe("test")
    expect(config.jwt?.privateKey).toBe(jwtConfig.privateKey)
    expect(config.jwt?.publicKey).toBe(jwtConfig.publicKey)
  })

  it("works without jwt config (backwards compat)", () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
    })

    expect(config.jwt).toBeUndefined()
  })
})

describe("JWT Integration: POST /auth/login with jwt config", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    vi.clearAllMocks()
    global.fetch = originalFetch
  })

  it("returns tokens in response body when jwt config is present", async () => {
    const email = "loginuser@example.com"
    const password = "Password123!"
    const userId = "user-uuid-login-jwt"
    const passwordHash = await hasher.hash(password)
    const refreshTokenId = "refresh-token-uuid-001"

    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    fetchMock
      .mockResolvedValueOnce({
        // Look up user by email
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: userId,
              email,
              password_hash: passwordHash,
              email_verified: true,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })
      .mockResolvedValueOnce({
        // Insert session
        ok: true,
        status: 200,
        json: async () => ({ success: true, rowCount: 1 }),
      })
      .mockResolvedValueOnce({
        // Insert refresh token (createRefreshToken)
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: refreshTokenId,
              user_id: userId,
              token_hash: "hashed",
              name: null,
              expires_at: new Date(Date.now() + 2592000 * 1000).toISOString(),
              revoked_at: null,
              last_used_at: null,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })

    const req = new Request("https://example.com/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.user).toBeDefined()
    expect(data.sessionId).toBeDefined()
    expect(data.tokens).toBeDefined()
    expect(data.tokens.accessToken).toBeDefined()
    expect(typeof data.tokens.accessToken).toBe("string")
    expect(data.tokens.accessToken).toMatch(/^eyJ/)
    expect(data.tokens.refreshToken).toBeDefined()
    expect(typeof data.tokens.refreshToken).toBe("string")
    expect(data.tokens.tokenType).toBe("Bearer")
    expect(data.tokens.expiresIn).toBe(900)
    expect(data.tokens.refreshTokenId).toBe(refreshTokenId)
  }, 15000)

  it("does NOT include tokens in response when jwt config is absent", async () => {
    const email = "loginuser2@example.com"
    const password = "Password123!"
    const userId = "user-uuid-login-nojwt"
    const passwordHash = await hasher.hash(password)

    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
    })

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: userId,
              email,
              password_hash: passwordHash,
              email_verified: true,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, rowCount: 1 }),
      })

    const req = new Request("https://example.com/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.sessionId).toBeDefined()
    expect(data.tokens).toBeUndefined()
  }, 15000)
})

describe("JWT Integration: POST /auth/register with jwt config", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    vi.clearAllMocks()
    global.fetch = originalFetch
  })

  it("returns tokens in response body when jwt config is present", async () => {
    const email = "registeruser@example.com"
    const password = "Password123!"
    const userId = "user-uuid-register-jwt"
    const refreshTokenId = "refresh-token-uuid-002"

    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    fetchMock
      .mockResolvedValueOnce({
        // Check if user exists (none)
        ok: true,
        status: 200,
        json: async () => ({ success: true, rows: [], rowCount: 0 }),
      })
      .mockResolvedValueOnce({
        // Insert user
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: userId,
              email,
              email_verified: false,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })
      .mockResolvedValueOnce({
        // Insert verification token
        ok: true,
        status: 200,
        json: async () => ({ success: true, rowCount: 1 }),
      })
      .mockResolvedValueOnce({
        // Insert session
        ok: true,
        status: 200,
        json: async () => ({ success: true, rowCount: 1 }),
      })
      .mockResolvedValueOnce({
        // Insert refresh token (createRefreshToken)
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: refreshTokenId,
              user_id: userId,
              token_hash: "hashed",
              name: null,
              expires_at: new Date(Date.now() + 2592000 * 1000).toISOString(),
              revoked_at: null,
              last_used_at: null,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })

    const req = new Request("https://example.com/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(201)

    const data = await res.json()
    expect(data.user).toBeDefined()
    expect(data.sessionId).toBeDefined()
    expect(data.tokens).toBeDefined()
    expect(data.tokens.accessToken).toMatch(/^eyJ/)
    expect(data.tokens.refreshToken).toBeDefined()
    expect(data.tokens.tokenType).toBe("Bearer")
    expect(data.tokens.expiresIn).toBe(900)
    expect(data.tokens.refreshTokenId).toBe(refreshTokenId)
  }, 15000)
})

describe("JWT Integration: /auth/token, /auth/refresh routes", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    vi.clearAllMocks()
    global.fetch = originalFetch
  })

  it("routes POST /auth/token to JWT handler when jwt config is present", async () => {
    const userId = "user-uuid-token-route"
    const email = "tokenroute@example.com"
    const refreshTokenId = "refresh-token-uuid-003"

    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    fetchMock.mockResolvedValueOnce({
      // Insert refresh token
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        rows: [
          {
            id: refreshTokenId,
            user_id: userId,
            token_hash: "hashed",
            name: null,
            expires_at: new Date(Date.now() + 2592000 * 1000).toISOString(),
            revoked_at: null,
            last_used_at: null,
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      }),
    })

    const req = new Request("https://example.com/auth/token", {
      method: "POST",
      body: JSON.stringify({ userId, email }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.accessToken).toMatch(/^eyJ/)
    expect(data.refreshToken).toBeDefined()
    expect(data.tokenType).toBe("Bearer")
    expect(data.expiresIn).toBe(900)
    expect(data.refreshTokenId).toBe(refreshTokenId)
  }, 15000)

  it("routes POST /auth/refresh to JWT handler when jwt config is present", async () => {
    const userId = "user-uuid-refresh-route"
    const email = "refreshroute@example.com"
    const oldRefreshTokenId = "old-refresh-token-uuid"
    const newRefreshTokenId = "new-refresh-token-uuid"

    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const fakeToken = "fake-refresh-token-value"
    const futureExpiry = new Date(Date.now() + 2592000 * 1000).toISOString()

    fetchMock
      .mockResolvedValueOnce({
        // getRefreshToken: SELECT by token_hash
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: oldRefreshTokenId,
              user_id: userId,
              token_hash: "hashed",
              name: null,
              expires_at: futureExpiry,
              revoked_at: null,
              last_used_at: null,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })
      .mockResolvedValueOnce({
        // SELECT user for access token payload
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: userId,
              email,
              email_verified: true,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })
      .mockResolvedValueOnce({
        // getRefreshToken again (inside rotateRefreshToken)
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: oldRefreshTokenId,
              user_id: userId,
              token_hash: "hashed",
              name: null,
              expires_at: futureExpiry,
              revoked_at: null,
              last_used_at: null,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })
      .mockResolvedValueOnce({
        // Insert new refresh token
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: newRefreshTokenId,
              user_id: userId,
              token_hash: "hashed-new",
              name: null,
              expires_at: futureExpiry,
              revoked_at: null,
              last_used_at: null,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })
      .mockResolvedValueOnce({
        // Revoke old refresh token
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: oldRefreshTokenId,
              user_id: userId,
              token_hash: "hashed",
              name: null,
              expires_at: futureExpiry,
              revoked_at: new Date().toISOString(),
              last_used_at: null,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })

    const req = new Request("https://example.com/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: fakeToken }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.accessToken).toMatch(/^eyJ/)
    expect(data.refreshToken).toBeDefined()
    expect(data.tokenType).toBe("Bearer")
    expect(data.refreshTokenId).toBe(newRefreshTokenId)
  }, 15000)

  it("returns 404 when /auth/token is called without jwt config", async () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
    })

    const req = new Request("https://example.com/auth/token", {
      method: "POST",
      body: JSON.stringify({ userId: "u1", email: "u@e.com" }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(404)

    const data = await res.json()
    expect(data.error).toBeDefined()
  })
})
