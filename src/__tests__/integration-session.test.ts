import { describe, it, expect, vi, afterEach } from "vitest"
import { handleClearAuthRequest } from "../handler.js"
import { createClearAuth } from "../createMechAuth.js"

describe("Integration: /auth/session flow", () => {
  const TEST_APP_ID = '550e8400-e29b-41d4-a716-446655440000'
  const TEST_API_KEY = 'test-api-key'
  const TEST_SECRET = 'test-secret-key-at-least-32-chars-long'
  
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
  })

  it("should return { user: null } when no session cookie is present", async () => {
    const request = new Request('https://example.com/auth/session')
    const response = await handleClearAuthRequest(request, config)
    
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

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        rows: [mockUser],
        rowCount: 1
      })
    })

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
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        rows: [],
        rowCount: 0
      })
    })

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
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Mech Storage error' }
      })
    })

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
