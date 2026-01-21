import { describe, it, expect, vi, afterEach } from "vitest"
import { handleClearAuthRequest } from "../handler.js"
import { createClearAuth } from "../createMechAuth.js"

describe("Integration: /auth/session flow", () => {
  const TEST_APP_ID = '550e8400-e29b-41d4-a716-446655440000'
  const TEST_API_KEY = 'test-api-key'
  const TEST_SECRET = 'test-secret-key-at-least-32-chars-long'

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

  it("should return { user: null } when no session cookie is present", async () => {
    const request = new Request('https://example.com/auth/session')
    const response = await handleClearAuthRequest(request, config)
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ user: null })
  })

  it("should include an expires_at filter in the session validation query and return { user: null } for expired sessions", async () => {
    const expiredFetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        rows: [],
        rowCount: 0
      })
    })
    global.fetch = expiredFetchMock as unknown as typeof fetch

    const expiredSessionId = 'expired-session-id'
    const request = new Request('https://example.com/auth/session', {
      headers: {
        'Cookie': `session=${expiredSessionId}`
      }
    })

    const response = await handleClearAuthRequest(request, config)

    expect(expiredFetchMock).toHaveBeenCalledTimes(1)
    const fetchArgs = expiredFetchMock.mock.calls[0]
    const options = fetchArgs[1] as RequestInit
    const payload = JSON.parse(options.body as string) as { sql: string; params: unknown[] }
    expect(payload.sql).toContain('expires_at')
    expect(payload.sql).toContain('>')
    expect(payload.params).toContain(expiredSessionId)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ user: null })
  })

  it("should return user info when a valid session cookie is present", async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      email_verified: true,
      avatar_url: null,
      created_at: new Date().toISOString()
    }

    const validFetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        rows: [mockUser],
        rowCount: 1
      })
    })
    global.fetch = validFetchMock as unknown as typeof fetch

    const request = new Request('https://example.com/auth/session', {
      headers: {
        'Cookie': 'session=valid-session-id'
      }
    })
    
    const response = await handleClearAuthRequest(request, config)
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.user).toBeDefined()
    expect(data.user.id).toBe(mockUser.id)
    expect(data.user.email).toBe(mockUser.email)
  })

  it("should return { user: null } for a stale session (no rows found)", async () => {
    const staleFetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        rows: [],
        rowCount: 0
      })
    })
    global.fetch = staleFetchMock as unknown as typeof fetch

    const request = new Request('https://example.com/auth/session', {
      headers: {
        'Cookie': 'session=stale-session-id'
      }
    })
    
    const response = await handleClearAuthRequest(request, config)
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ user: null })
  })

  it("should return { user: null } even if database throws an error", async () => {
    const errorFetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Mech Storage error' }
      })
    })
    global.fetch = errorFetchMock as unknown as typeof fetch

    const request = new Request('https://example.com/auth/session', {
      headers: {
        'Cookie': 'session=any-id'
      }
    })
    
    const response = await handleClearAuthRequest(request, config)
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ user: null })
  })
})
