import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateSession, getSessionFromCookie } from '../validate.js'
import type { Kysely } from 'kysely'
import type { Database } from '../../database/schema.js'

// Mock database
function createMockDb(sessionResult: any, userResult: any) {
  const mockExecuteTakeFirst = vi.fn()
    .mockResolvedValueOnce(sessionResult)
    .mockResolvedValueOnce(userResult)

  const mockWhere = vi.fn().mockReturnThis()
  const mockSelect = vi.fn().mockReturnThis()
  const mockSelectAll = vi.fn().mockReturnThis()
  const mockSelectFrom = vi.fn().mockReturnValue({
    selectAll: mockSelectAll,
    select: mockSelect,
    where: mockWhere,
    executeTakeFirst: mockExecuteTakeFirst,
  })

  return {
    selectFrom: mockSelectFrom,
    _mockExecuteTakeFirst: mockExecuteTakeFirst,
  } as unknown as Kysely<Database>
}

describe('validateSession', () => {
  it('returns null for empty session token', async () => {
    const db = createMockDb(null, null)
    const result = await validateSession('', db)
    expect(result).toBeNull()
  })

  it('returns null when session not found in database', async () => {
    const db = createMockDb(null, null)
    const result = await validateSession('invalid-token', db)
    expect(result).toBeNull()
  })

  it('returns null when session is expired', async () => {
    const expiredSession = {
      id: 'session-123',
      user_id: 'user-456',
      expires_at: new Date(Date.now() - 1000), // 1 second ago
      ip_address: null,
      user_agent: null,
      created_at: new Date(),
    }
    const db = createMockDb(expiredSession, null)
    const result = await validateSession('session-123', db)
    expect(result).toBeNull()
  })

  it('returns null when user not found', async () => {
    const validSession = {
      id: 'session-123',
      user_id: 'user-456',
      expires_at: new Date(Date.now() + 3600000), // 1 hour from now
      ip_address: null,
      user_agent: null,
      created_at: new Date(),
    }
    const db = createMockDb(validSession, null)
    const result = await validateSession('session-123', db)
    expect(result).toBeNull()
  })

  it('returns user and session when valid', async () => {
    const validSession = {
      id: 'session-123',
      user_id: 'user-456',
      expires_at: new Date(Date.now() + 3600000), // 1 hour from now
      ip_address: '127.0.0.1',
      user_agent: 'test-agent',
      created_at: new Date(),
    }
    const validUser = {
      id: 'user-456',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      avatar_url: 'https://example.com/avatar.png',
      created_at: new Date(),
    }

    const db = createMockDb(validSession, validUser)
    const result = await validateSession('session-123', db)

    expect(result).not.toBeNull()
    expect(result?.user.id).toBe('user-456')
    expect(result?.user.email).toBe('test@example.com')
    expect(result?.session.id).toBe('session-123')
  })

  it('returns public user data only (no password_hash)', async () => {
    const validSession = {
      id: 'session-123',
      user_id: 'user-456',
      expires_at: new Date(Date.now() + 3600000),
      ip_address: null,
      user_agent: null,
      created_at: new Date(),
    }
    const userWithPassword = {
      id: 'user-456',
      email: 'test@example.com',
      email_verified: false,
      name: null,
      avatar_url: null,
      created_at: new Date(),
      password_hash: 'should-not-be-exposed',
    }

    const db = createMockDb(validSession, userWithPassword)
    const result = await validateSession('session-123', db)

    expect(result).not.toBeNull()
    // Verify password_hash is not in the returned user object
    expect((result?.user as any).password_hash).toBeUndefined()
  })
})

describe('getSessionFromCookie', () => {
  it('returns null when no Cookie header', async () => {
    const db = createMockDb(null, null)
    const request = new Request('https://example.com', {
      headers: {},
    })
    const result = await getSessionFromCookie(request, db)
    expect(result).toBeNull()
  })

  it('returns null when session cookie not present', async () => {
    const db = createMockDb(null, null)
    const request = new Request('https://example.com', {
      headers: { Cookie: 'other=value' },
    })
    const result = await getSessionFromCookie(request, db)
    expect(result).toBeNull()
  })

  it('returns null when session is invalid', async () => {
    const db = createMockDb(null, null)
    const request = new Request('https://example.com', {
      headers: { Cookie: 'session=invalid-token' },
    })
    const result = await getSessionFromCookie(request, db)
    expect(result).toBeNull()
  })

  it('returns user when session is valid', async () => {
    const validSession = {
      id: 'session-123',
      user_id: 'user-456',
      expires_at: new Date(Date.now() + 3600000),
      ip_address: null,
      user_agent: null,
      created_at: new Date(),
    }
    const validUser = {
      id: 'user-456',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      avatar_url: null,
      created_at: new Date(),
    }
    const db = createMockDb(validSession, validUser)
    const request = new Request('https://example.com', {
      headers: { Cookie: 'session=session-123' },
    })
    const result = await getSessionFromCookie(request, db)
    expect(result).not.toBeNull()
    expect(result?.user.email).toBe('test@example.com')
  })

  it('uses custom cookie name', async () => {
    const validSession = {
      id: 'token-abc',
      user_id: 'user-456',
      expires_at: new Date(Date.now() + 3600000),
      ip_address: null,
      user_agent: null,
      created_at: new Date(),
    }
    const validUser = {
      id: 'user-456',
      email: 'test@example.com',
      email_verified: true,
      name: null,
      avatar_url: null,
      created_at: new Date(),
    }
    const db = createMockDb(validSession, validUser)
    const request = new Request('https://example.com', {
      headers: { Cookie: 'auth_token=token-abc' },
    })
    const result = await getSessionFromCookie(request, db, { cookieName: 'auth_token' })
    expect(result).not.toBeNull()
    expect(result?.session.id).toBe('token-abc')
  })
})
