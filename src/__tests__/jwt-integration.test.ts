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
import * as arcticProviders from "../oauth/arctic-providers.js"

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

  it("routes POST /auth/token to JWT handler when jwt config is present (with valid session cookie)", async () => {
    const userId = "user-uuid-token-route"
    const email = "tokenroute@example.com"
    const sessionId = "valid-session-token-route"
    const refreshTokenId = "refresh-token-uuid-003"

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
        // validateSession: SELECT users JOIN sessions
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
        // createRefreshToken INSERT
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
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${sessionId}`,
      },
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

  it("returns 401 when POST /auth/token is called without a session cookie", async () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const req = new Request("https://example.com/auth/token", {
      method: "POST",
      body: JSON.stringify({ userId: "u1", email: "u@e.com" }),
      headers: { "Content-Type": "application/json" },
      // No Cookie header
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(401)

    const data = await res.json()
    expect(data.error).toBe("unauthorized")
  })

  it("returns 401 when POST /auth/token has an invalid/expired session cookie", async () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    // validateSession returns empty rows → no valid session
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, rows: [], rowCount: 0 }),
    })

    const req = new Request("https://example.com/auth/token", {
      method: "POST",
      body: JSON.stringify({ userId: "u1", email: "u@e.com" }),
      headers: {
        "Content-Type": "application/json",
        Cookie: "session=invalid-or-expired-session-id",
      },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(401)

    const data = await res.json()
    expect(data.error).toBe("unauthorized")
  })

  it("issues tokens when POST /auth/token has a valid session cookie", async () => {
    const userId = "user-uuid-session-auth"
    const email = "sessionauth@example.com"
    const sessionId = "valid-session-id-abc123"
    const refreshTokenId = "refresh-token-uuid-session"

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
        // validateSession: SELECT users JOIN sessions WHERE session id valid
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
        // createRefreshToken INSERT
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
      // userId/email in body should be IGNORED — server uses session data
      body: JSON.stringify({ userId: "attacker-id", email: "attacker@evil.com" }),
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${sessionId}`,
      },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.accessToken).toMatch(/^eyJ/)
    expect(data.refreshToken).toBeDefined()
    expect(data.tokenType).toBe("Bearer")
    expect(data.expiresIn).toBe(900)
    expect(data.refreshTokenId).toBe(refreshTokenId)

    // Verify the access token sub claim is the SESSION user's id, not the spoofed body id
    // Normalize base64url → base64 (- → +, _ → /) then pad to multiple of 4 before atob
    const raw = data.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const b64 = raw.padEnd(raw.length + (4 - raw.length % 4) % 4, '=')
    const payload = JSON.parse(atob(b64))
    expect(payload.sub).toBe(userId)        // "user-uuid-session-auth"
    expect(payload.sub).not.toBe('attacker-id')
    expect(payload.email).toBe(email)
    expect(payload.email).not.toBe('attacker@evil.com')
  }, 15000)
})

describe("JWT Integration: POST /auth/revoke", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    vi.clearAllMocks()
    global.fetch = originalFetch
  })

  it("successfully revokes a refresh token", async () => {
    const refreshTokenId = "revoke-token-uuid-001"
    const userId = "user-uuid-revoke"

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
        // getRefreshToken: SELECT by token_hash — returns existing token
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
      .mockResolvedValueOnce({
        // revokeRefreshToken UPDATE — must return the row with returningAll()
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
              revoked_at: new Date().toISOString(),
              last_used_at: null,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })

    const req = new Request("https://example.com/auth/revoke", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "some-opaque-refresh-token" }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.message).toContain("revoked")
  })

  it("is idempotent — returns 200 even when refresh token is not found", async () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    fetchMock.mockResolvedValueOnce({
      // getRefreshToken: SELECT returns empty — token not found
      ok: true,
      status: 200,
      json: async () => ({ success: true, rows: [], rowCount: 0 }),
    })

    const req = new Request("https://example.com/auth/revoke", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "nonexistent-token" }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it("returns 400 when request body is missing refreshToken", async () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const req = new Request("https://example.com/auth/revoke", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(400)

    const data = await res.json()
    expect(data.error).toBeDefined()
  })
})

describe("JWT Integration: OAuth callback with jwt config issues JWT cookies", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    vi.clearAllMocks()
    global.fetch = originalFetch
  })

  it("sets jwt_access_token and jwt_refresh_token cookies on OAuth callback when jwt is configured", async () => {
    const userId = "user-uuid-oauth-jwt"
    const email = "oauthjwt@example.com"
    const githubId = "gh-12345"
    const refreshTokenId = "refresh-token-uuid-oauth"

    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
      oauth: {
        github: {
          clientId: "github-client-id",
          clientSecret: "github-client-secret",
          redirectUri: "https://example.com/auth/callback/github",
        },
      },
    })

    // Mock Arctic GitHub provider so no real HTTP call to GitHub's token endpoint
    const mockGitHubProvider = {
      validateAuthorizationCode: vi.fn().mockResolvedValue({
        accessToken: () => "github-access-token",
      }),
      createAuthorizationURL: vi.fn(),
    }
    vi.spyOn(arcticProviders, "createGitHubProvider").mockReturnValue(mockGitHubProvider as any)

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    fetchMock
      .mockResolvedValueOnce({
        // GitHub user API (fetchGitHubUserProfile)
        ok: true,
        status: 200,
        json: async () => ({
          id: Number(githubId),
          login: "testgithubuser",
          email,
          name: "Test GitHub User",
          avatar_url: "https://avatars.githubusercontent.com/u/12345",
        }),
      })
      .mockResolvedValueOnce({
        // upsertOAuthUser: SELECT by github_id — user not found
        ok: true,
        status: 200,
        json: async () => ({ success: true, rows: [], rowCount: 0 }),
      })
      .mockResolvedValueOnce({
        // upsertOAuthUser: SELECT by email — also not found (new user)
        ok: true,
        status: 200,
        json: async () => ({ success: true, rows: [], rowCount: 0 }),
      })
      .mockResolvedValueOnce({
        // upsertOAuthUser: INSERT new user
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rows: [
            {
              id: userId,
              email,
              github_id: githubId,
              name: "Test GitHub User",
              avatar_url: "https://avatars.githubusercontent.com/u/12345",
              email_verified: true,
              created_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        }),
      })
      .mockResolvedValueOnce({
        // createSession INSERT
        ok: true,
        status: 200,
        json: async () => ({ success: true, rowCount: 1 }),
      })
      .mockResolvedValueOnce({
        // createRefreshToken INSERT
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

    // The callback needs a matching state cookie
    const state = "test-oauth-state-12345"
    const req = new Request(
      `https://example.com/auth/callback/github?code=github-code&state=${state}`,
      {
        method: "GET",
        headers: {
          Cookie: `oauth_state=${state}`,
        },
      }
    )

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(302)

    // Collect all Set-Cookie headers
    const setCookieHeaders: string[] = []
    res.headers.forEach((value, name) => {
      if (name.toLowerCase() === "set-cookie") {
        setCookieHeaders.push(value)
      }
    })

    const jwtAccessCookie = setCookieHeaders.find((c) => c.startsWith("jwt_access_token="))
    const jwtRefreshCookie = setCookieHeaders.find((c) => c.startsWith("jwt_refresh_token="))

    expect(jwtAccessCookie).toBeDefined()
    expect(jwtRefreshCookie).toBeDefined()

    // Access token should be a JWT
    const accessTokenValue = jwtAccessCookie!.split("=")[1].split(";")[0]
    expect(accessTokenValue).toMatch(/^eyJ/)
  }, 15000)
})

describe("JWT Integration: method gating — JWT routes only accept POST", () => {
  it("returns 405 for GET /auth/token when jwt is configured", async () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const req = new Request("https://example.com/auth/token", { method: "GET" })
    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(405)
    expect(res.headers.get("Allow")).toBe("POST")
  })

  it("returns 405 for PUT /auth/refresh when jwt is configured", async () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const req = new Request("https://example.com/auth/refresh", { method: "PUT" })
    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(405)
    expect(res.headers.get("Allow")).toBe("POST")
  })

  it("returns 405 for DELETE /auth/revoke when jwt is configured", async () => {
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const req = new Request("https://example.com/auth/revoke", { method: "DELETE" })
    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(405)
    expect(res.headers.get("Allow")).toBe("POST")
  })
})

describe("JWT Integration: POST /auth/logout clears JWT cookies and revokes refresh token", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    vi.clearAllMocks()
    global.fetch = originalFetch
  })

  it("clears jwt_access_token and jwt_refresh_token cookies on logout", async () => {
    const sessionId = "logout-session-id"
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    // deleteSession call
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ success: true, rowCount: 1 }),
    })

    const req = new Request("https://example.com/auth/logout", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(200)

    const setCookieHeaders: string[] = []
    res.headers.forEach((value, name) => {
      if (name.toLowerCase() === "set-cookie") setCookieHeaders.push(value)
    })

    const hasAccessDelete = setCookieHeaders.some((c) => c.startsWith("jwt_access_token=") && c.includes("Max-Age=0"))
    const hasRefreshDelete = setCookieHeaders.some((c) => c.startsWith("jwt_refresh_token=") && c.includes("Max-Age=0"))
    expect(hasAccessDelete).toBe(true)
    expect(hasRefreshDelete).toBe(true)
  })

  it("revokes the JWT refresh token DB record when jwt_refresh_token cookie is present", async () => {
    const sessionId = "logout-session-id-2"
    const refreshTokenId = "rt-uuid-to-revoke"
    const fakeRtValue = "some-opaque-refresh-token"
    const config = createClearAuth({
      secret: TEST_SECRET,
      baseUrl: "https://example.com",
      database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
      jwt: jwtConfig,
    })

    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    // deleteSession
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ success: true, rowCount: 1 }),
    })
    // revokeRefreshTokenByValue — single UPDATE WHERE token_hash = ? AND revoked_at IS NULL
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ success: true, rowCount: 1 }),
    })

    const req = new Request("https://example.com/auth/logout", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
      headers: {
        "Content-Type": "application/json",
        Cookie: `jwt_refresh_token=${encodeURIComponent(fakeRtValue)}`,
      },
    })

    const res = await handleClearAuthRequest(req, config)
    expect(res.status).toBe(200)

    // Verify 2 DB calls were made (deleteSession + revokeRefreshTokenByValue)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Second call should be the revocation UPDATE against refresh_tokens
    const revokeCallBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string ?? '{}')
    const revokeQuery: string = revokeCallBody.sql ?? ''
    expect(revokeQuery).toMatch(/refresh_tokens/i)
  })
})
