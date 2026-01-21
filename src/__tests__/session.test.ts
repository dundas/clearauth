import { describe, it, expect, vi, afterEach } from "vitest"
import { validateSession } from "../oauth/callbacks.js"
import { createMechKysely } from "../mech-kysely.js"

describe("Session Validation", () => {
  const TEST_APP_ID = '550e8400-e29b-41d4-a716-446655440000'
  const TEST_API_KEY = 'test-api-key'
  
  // Helper to create a Kysely instance with a mocked fetch
  function createMockDb() {
    return createMechKysely({
      appId: TEST_APP_ID,
      apiKey: TEST_API_KEY,
    })
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("should return user if session is valid", async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User'
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

    const db = createMockDb()
    const result = await validateSession(db as any, 'valid-session-id')

    expect(result).toEqual(mockUser)
    expect(global.fetch).toHaveBeenCalled()
  })

  it("should return null if session is not found (empty result)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        rows: [],
        rowCount: 0
      })
    })

    const db = createMockDb()
    const result = await validateSession(db as any, 'stale-session-id')

    expect(result).toBeNull()
  })

  it("should return null if database returns an error", async () => {
    // Simulate Mech Storage returning an error (e.g. 400 or success: false)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        error: {
          code: 'SOME_ERROR',
          message: 'Database error'
        }
      })
    })

    const db = createMockDb()
    const result = await validateSession(db as any, 'any-session-id')

    expect(result).toBeNull()
  })

  it("should return null if network fails", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network failure'))

    const db = createMockDb()
    const result = await validateSession(db as any, 'any-session-id')

    expect(result).toBeNull()
  })
})
