/**
 * Magic Link Authentication Tests
 *
 * Tests for magic link request, consumption, and security features
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { requestMagicLink, consumeMagicLink, cleanupExpiredMagicLinkTokens } from '../magic-link.js'
import type { Kysely } from 'kysely'
import type { Database } from '../../database/schema.js'

// Fixed timestamp for deterministic testing
const FIXED_TIME = new Date('2026-01-12T12:00:00Z')

// Mock database with proper chaining support
const createMockDb = () => {
  const mockExecuteTakeFirst = vi.fn()
  const mockExecute = vi.fn()
  
  const mockWhere = vi.fn(() => ({
    executeTakeFirst: mockExecuteTakeFirst,
    execute: mockExecute,
  }))
  
  const mockSet = vi.fn(() => ({
    where: mockWhere,
    execute: mockExecute,
  }))
  
  const mockValues = vi.fn(() => ({
    execute: mockExecute,
  }))
  
  const mockSelectAll = vi.fn(() => ({
    where: mockWhere,
  }))
  
  const mockSelect = vi.fn(() => ({
    where: mockWhere,
  }))
  
  const mockDb = {
    selectFrom: vi.fn((table: string) => {
      if (table === 'magic_link_tokens' || table === 'users') {
        return {
          selectAll: mockSelectAll,
          select: mockSelect,
        }
      }
      return { selectAll: mockSelectAll, select: mockSelect }
    }),
    deleteFrom: vi.fn(() => ({
      where: mockWhere,
    })),
    insertInto: vi.fn(() => ({
      values: mockValues,
    })),
    updateTable: vi.fn(() => ({
      set: mockSet,
    })),
    // Expose mock functions for assertions
    _mockExecuteTakeFirst: mockExecuteTakeFirst,
    _mockExecute: mockExecute,
    _mockWhere: mockWhere,
    _mockSet: mockSet,
    _mockValues: mockValues,
  } as any

  return mockDb
}

describe('Magic Link Authentication', () => {
  beforeEach(() => {
    // Use fake timers for deterministic date testing
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_TIME)
  })

  afterEach(() => {
    // Restore real timers after each test
    vi.useRealTimers()
  })

  describe('requestMagicLink()', () => {
    it('should return success for existing user', async () => {
      const db = createMockDb()

      // Mock: User exists
      db._mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-123',
        email: 'user@example.com',
      })

      const result = await requestMagicLink(db, 'user@example.com')

      expect(result.success).toBe(true)
      expect(result.email).toBe('user@example.com')
    })

    it('should return success for non-existent user (enumeration prevention)', async () => {
      const db = createMockDb()

      // Mock: User doesn't exist
      db._mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

      const result = await requestMagicLink(db, 'nonexistent@example.com')

      expect(result.success).toBe(true)
      expect(result.email).toBe('nonexistent@example.com')
    })

    it('should not reveal user existence through response structure', async () => {
      const db1 = createMockDb()
      const db2 = createMockDb()

      // Mock non-existent user
      db1._mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

      const result1 = await requestMagicLink(db1, 'nonexistent@example.com')

      // Mock existing user
      db2._mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-123',
        email: 'existing@example.com',
      })

      const result2 = await requestMagicLink(db2, 'existing@example.com')

      // Both responses should have identical structure
      expect(result1).toHaveProperty('success')
      expect(result1).toHaveProperty('email')
      expect(result2).toHaveProperty('success')
      expect(result2).toHaveProperty('email')

      // Both should indicate success
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      // Should not have 'token' property (security)
      expect(result1).not.toHaveProperty('token')
      expect(result2).not.toHaveProperty('token')
    })

    it('should call onTokenGenerated callback for existing user', async () => {
      const db = createMockDb()
      const mockCallback = vi.fn()

      // Mock: User exists
      db._mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-123',
        email: 'user@example.com',
      })

      await requestMagicLink(db, 'user@example.com', '/dashboard', mockCallback)

      // Callback should be called with email, token, and linkUrl
      expect(mockCallback).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
        expect.stringContaining('/auth/magic-link/verify?token=')
      )
    })

    it('should NOT call onTokenGenerated callback for non-existent user', async () => {
      const db = createMockDb()
      const mockCallback = vi.fn()

      // Mock: User doesn't exist
      db._mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

      await requestMagicLink(db, 'nonexistent@example.com', '/dashboard', mockCallback)

      // Callback should NOT be called
      expect(mockCallback).not.toHaveBeenCalled()
    })

    it('should include returnTo in link URL when provided', async () => {
      const db = createMockDb()
      const mockCallback = vi.fn()

      // Mock: User exists
      db._mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-123',
        email: 'user@example.com',
      })

      await requestMagicLink(db, 'user@example.com', '/dashboard', mockCallback)

      // Link URL should include returnTo parameter
      expect(mockCallback).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
        expect.stringContaining('returnTo=%2Fdashboard')
      )
    })

    it('should delete existing magic link tokens before creating new one', async () => {
      const db = createMockDb()

      // Mock: User exists
      db._mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'user-123',
        email: 'user@example.com',
      })

      await requestMagicLink(db, 'user@example.com')

      // Should delete existing tokens
      expect(db.deleteFrom).toHaveBeenCalledWith('magic_link_tokens')
    })
  })

  describe('consumeMagicLink()', () => {
    const validToken = 'valid-magic-link-token'
    const userId = 'user-123'

    const setupValidTokenMocks = (db: any) => {
      // Mock token lookup - valid token (expires 15 minutes from FIXED_TIME)
      db._mockExecuteTakeFirst
        .mockResolvedValueOnce({
          token: validToken,
          user_id: userId,
          email: 'user@example.com',
          return_to: '/dashboard',
          expires_at: new Date(FIXED_TIME.getTime() + 900000), // 15 minutes from FIXED_TIME
          created_at: FIXED_TIME,
        })
        // Mock user lookup
        .mockResolvedValueOnce({
          id: userId,
          email: 'user@example.com',
          email_verified: false,
          password_hash: null,
          github_id: null,
          google_id: null,
          name: null,
          avatar_url: null,
          created_at: FIXED_TIME,
          updated_at: FIXED_TIME,
        })

      // Mock delete token, update user, insert session
      db._mockExecute.mockResolvedValue({ numDeletedRows: BigInt(1), numUpdatedRows: BigInt(1) } as any)
    }

    it('should successfully consume valid magic link token', async () => {
      const mockDb = createMockDb()
      setupValidTokenMocks(mockDb)

      const result = await consumeMagicLink(mockDb, validToken)

      expect(result.user).toBeDefined()
      expect(result.user.id).toBe(userId)
      expect(result.sessionId).toBeDefined()
      expect(result.returnTo).toBe('/dashboard')
    })

    it('should set email_verified to true when consuming magic link', async () => {
      const mockDb = createMockDb()
      setupValidTokenMocks(mockDb)

      await consumeMagicLink(mockDb, validToken)

      // Should update email_verified
      expect(mockDb.updateTable).toHaveBeenCalledWith('users')
    })

    it('should delete token after successful consumption (one-time use)', async () => {
      const mockDb = createMockDb()
      setupValidTokenMocks(mockDb)

      await consumeMagicLink(mockDb, validToken)

      // Should delete the token
      expect(mockDb.deleteFrom).toHaveBeenCalledWith('magic_link_tokens')
    })

    it('should reject invalid token', async () => {
      const mockDb = createMockDb()
      const invalidToken = 'invalid-token'

      // Mock: Token doesn't exist
      mockDb._mockExecuteTakeFirst.mockResolvedValueOnce(undefined)

      await expect(consumeMagicLink(mockDb, invalidToken)).rejects.toThrow('Invalid or expired magic link')
    })

    it('should reject expired token', async () => {
      const mockDb = createMockDb()
      const expiredToken = 'expired-token'

      // Mock: Token exists but is expired (15 minutes before FIXED_TIME)
      mockDb._mockExecuteTakeFirst.mockResolvedValueOnce({
        token: expiredToken,
        user_id: userId,
        email: 'user@example.com',
        return_to: null,
        expires_at: new Date(FIXED_TIME.getTime() - 900000), // 15 minutes before FIXED_TIME (expired)
        created_at: new Date(FIXED_TIME.getTime() - 1800000), // 30 minutes before FIXED_TIME
      })

      // Mock delete expired token
      mockDb._mockExecute.mockResolvedValueOnce({ numDeletedRows: BigInt(1) } as any)

      await expect(consumeMagicLink(mockDb, expiredToken)).rejects.toThrow('Magic link has expired')
    })

    it('should reject empty token', async () => {
      const mockDb = createMockDb()
      await expect(consumeMagicLink(mockDb, '')).rejects.toThrow('Magic link token is required')
    })

    it('should handle user not found (orphaned token)', async () => {
      const mockDb = createMockDb()
      const orphanedToken = 'orphaned-token'

      // Mock: Token exists (valid, not expired)
      mockDb._mockExecuteTakeFirst
        .mockResolvedValueOnce({
          token: orphanedToken,
          user_id: 'non-existent-user',
          email: 'user@example.com',
          return_to: null,
          expires_at: new Date(FIXED_TIME.getTime() + 900000), // 15 minutes from FIXED_TIME
          created_at: FIXED_TIME,
        })
        // Mock: User doesn't exist
        .mockResolvedValueOnce(undefined)

      // Mock delete orphaned token
      mockDb._mockExecute.mockResolvedValueOnce({ numDeletedRows: BigInt(1) } as any)

      await expect(consumeMagicLink(mockDb, orphanedToken)).rejects.toThrow('User not found')
    })

    it('should not update email_verified if already verified', async () => {
      const mockDb = createMockDb()
      
      // Mock token lookup and user with email already verified
      mockDb._mockExecuteTakeFirst
        .mockResolvedValueOnce({
          token: validToken,
          user_id: userId,
          email: 'user@example.com',
          return_to: '/dashboard',
          expires_at: new Date(FIXED_TIME.getTime() + 900000),
          created_at: FIXED_TIME,
        })
        .mockResolvedValueOnce({
          id: userId,
          email: 'user@example.com',
          email_verified: true, // Already verified
          password_hash: null,
          github_id: null,
          google_id: null,
          name: null,
          avatar_url: null,
          created_at: FIXED_TIME,
          updated_at: FIXED_TIME,
        })

      // Mock delete token and session creation
      mockDb._mockExecute.mockResolvedValue({ numDeletedRows: BigInt(1) } as any)

      await consumeMagicLink(mockDb, validToken)

      // Should NOT call updateTable since email is already verified
      expect(mockDb.updateTable).not.toHaveBeenCalled()
    })

    it('should return returnTo from token if present', async () => {
      const mockDb = createMockDb()
      setupValidTokenMocks(mockDb)

      const result = await consumeMagicLink(mockDb, validToken)

      expect(result.returnTo).toBe('/dashboard')
    })

    it('should return null returnTo if not set in token', async () => {
      const mockDb = createMockDb()
      
      // Mock token without returnTo and user lookup
      mockDb._mockExecuteTakeFirst
        .mockResolvedValueOnce({
          token: validToken,
          user_id: userId,
          email: 'user@example.com',
          return_to: null,
          expires_at: new Date(FIXED_TIME.getTime() + 900000),
          created_at: FIXED_TIME,
        })
        .mockResolvedValueOnce({
          id: userId,
          email: 'user@example.com',
          email_verified: false,
          password_hash: null,
          github_id: null,
          google_id: null,
          name: null,
          avatar_url: null,
          created_at: FIXED_TIME,
          updated_at: FIXED_TIME,
        })

      // Mock delete token, update user, session creation
      mockDb._mockExecute.mockResolvedValue({ numDeletedRows: BigInt(1), numUpdatedRows: BigInt(1) } as any)

      const result = await consumeMagicLink(mockDb, validToken)

      expect(result.returnTo).toBeNull()
    })
  })

  describe('cleanupExpiredMagicLinkTokens()', () => {
    it('should delete expired tokens', async () => {
      const db = createMockDb()

      // Mock delete result
      db._mockExecuteTakeFirst.mockResolvedValueOnce({
        numDeletedRows: BigInt(5),
      } as any)

      const deleted = await cleanupExpiredMagicLinkTokens(db)

      expect(deleted).toBe(5)
      expect(db.deleteFrom).toHaveBeenCalledWith('magic_link_tokens')
    })

    it('should return 0 if no expired tokens', async () => {
      const db = createMockDb()

      // Mock delete result - no rows deleted
      db._mockExecuteTakeFirst.mockResolvedValueOnce({
        numDeletedRows: BigInt(0),
      } as any)

      const deleted = await cleanupExpiredMagicLinkTokens(db)

      expect(deleted).toBe(0)
    })
  })
})
