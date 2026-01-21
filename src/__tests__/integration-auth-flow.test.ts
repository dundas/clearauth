import { describe, it, expect, vi, afterEach } from "vitest"
import { handleClearAuthRequest } from "../handler.js"
import { createClearAuth } from "../createMechAuth.js"
import { createPbkdf2PasswordHasher } from "../password-hasher.js"

describe("Integration: Auth Flow (Register -> Login -> Session -> Logout)", () => {
  const TEST_APP_ID = '550e8400-e29b-41d4-a716-446655440000'
  const TEST_API_KEY = 'test-api-key'
  const TEST_SECRET = 'test-secret-key-at-least-32-chars-long'
  const hasher = createPbkdf2PasswordHasher()

  const originalFetch = global.fetch

  const config = createClearAuth({
    secret: TEST_SECRET,
    baseUrl: 'https://example.com',
    database: {
      appId: TEST_APP_ID,
      apiKey: TEST_API_KEY,
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
    global.fetch = originalFetch
  })

  it("should complete a full user lifecycle", async () => {
    const email = "newuser@example.com"
    const password = "Password123!"
    const userId = "user-uuid-123"
    const sessionId = "session-random-id-123"

    const expectedMechUrl = `https://storage.mechdna.net/api/apps/${TEST_APP_ID}/postgresql/query`
    const expectedAppSchemaId = TEST_APP_ID.replace(/-/g, "_")

    // 1. Mock Registration
    // - Check if user exists (none)
    // - Insert user
    // - Insert verification token
    // - Insert session (via createSession)
    const registerFetchMock = vi.fn()
    global.fetch = registerFetchMock as unknown as typeof fetch
    registerFetchMock
      .mockResolvedValueOnce({ // Check if user exists
        ok: true,
        status: 200,
        json: async () => ({ success: true, rows: [], rowCount: 0 })
      })
      .mockResolvedValueOnce({ // Insert user
        ok: true,
        status: 200,
        json: async () => ({ 
          success: true, 
          rows: [{ id: userId, email, email_verified: false, created_at: new Date().toISOString() }], 
          rowCount: 1 
        })
      })
      .mockResolvedValueOnce({ // Insert verification token
        ok: true,
        status: 200,
        json: async () => ({ success: true, rowCount: 1 })
      })
      .mockResolvedValueOnce({ // Insert session
        ok: true,
        status: 200,
        json: async () => ({ success: true, rowCount: 1 })
      })

    const registerReq = new Request('https://example.com/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: { 'Content-Type': 'application/json' }
    })
    
    const registerRes = await handleClearAuthRequest(registerReq, config)
    expect(registerRes.status).toBe(201)
    const registerData = await registerRes.json()
    expect(registerData.user.email).toBe(email)
    expect(registerData.sessionId).toBeDefined()
    const setCookie = registerRes.headers.get('Set-Cookie')
    expect(setCookie).toContain('session=')

    expect(registerFetchMock).toHaveBeenCalledTimes(4)
    expect(registerFetchMock).toHaveBeenNthCalledWith(
      1,
      expectedMechUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
          'X-App-ID': expectedAppSchemaId,
        }),
      })
    )

    // 2. Mock Login
    // - Look up user by email
    // - Insert session
    const passwordHash = await hasher.hash(password)
    const loginFetchMock = vi.fn()
    global.fetch = loginFetchMock as unknown as typeof fetch
    loginFetchMock
      .mockResolvedValueOnce({ // Look up user
        ok: true,
        status: 200,
        json: async () => ({ 
          success: true, 
          rows: [{ id: userId, email, password_hash: passwordHash, email_verified: true, created_at: new Date().toISOString() }], 
          rowCount: 1 
        })
      })
      .mockResolvedValueOnce({ // Insert session
        ok: true,
        status: 200,
        json: async () => ({ success: true, rowCount: 1 })
      })

    const loginReq = new Request('https://example.com/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: { 'Content-Type': 'application/json' }
    })

    const loginRes = await handleClearAuthRequest(loginReq, config)
    expect(loginRes.status).toBe(200)
    const loginData = await loginRes.json()
    expect(loginData.sessionId).toBeDefined()

    expect(loginFetchMock).toHaveBeenCalledTimes(2)
    expect(loginFetchMock).toHaveBeenNthCalledWith(
      1,
      expectedMechUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
          'X-App-ID': expectedAppSchemaId,
        }),
      })
    )

    // 3. Mock Session Validation
    // - SELECT with JOIN
    const sessionFetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        rows: [{ id: userId, email, email_verified: true, created_at: new Date().toISOString() }],
        rowCount: 1
      })
    })
    global.fetch = sessionFetchMock as unknown as typeof fetch

    const sessionReq = new Request('https://example.com/auth/session', {
      headers: { 'Cookie': `session=${loginData.sessionId}` }
    })
    
    const sessionRes = await handleClearAuthRequest(sessionReq, config)
    expect(sessionRes.status).toBe(200)
    const sessionData = await sessionRes.json()
    expect(sessionData.user.id).toBe(userId)

    expect(sessionFetchMock).toHaveBeenCalledTimes(1)
    expect(sessionFetchMock).toHaveBeenNthCalledWith(
      1,
      expectedMechUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
          'X-App-ID': expectedAppSchemaId,
        }),
      })
    )

    // 4. Mock Logout
    // - DELETE session
    const logoutFetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, rowCount: 1 })
    })
    global.fetch = logoutFetchMock as unknown as typeof fetch

    const logoutReq = new Request('https://example.com/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ sessionId: loginData.sessionId }),
      headers: { 'Content-Type': 'application/json' }
    })
    
    const logoutRes = await handleClearAuthRequest(logoutReq, config)
    expect(logoutRes.status).toBe(200)
    expect(logoutRes.headers.get('Set-Cookie')).toContain('Max-Age=0')

    expect(logoutFetchMock).toHaveBeenCalledTimes(1)
    expect(logoutFetchMock).toHaveBeenNthCalledWith(
      1,
      expectedMechUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': TEST_API_KEY,
          'X-App-ID': expectedAppSchemaId,
        }),
      })
    )
  }, 20000)
})
