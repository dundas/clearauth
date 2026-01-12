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

// Mock database
const createMockDb = () => {
  const mockDb = {
    selectFrom: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn(),
    deleteFrom: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    updateTable: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  } as unknown as Kysely<Database>

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
      vi.mocked(db.selectFrom('users').select(['id', 'email']).where('email', '=', 'user@example.com').executeTakeFirst).mockResolvedValue({
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
      vi.mocked(db.selectFrom('users').select(['id', 'email']).where('email', '=', 'nonexistent@example.com').executeTakeFirst).mockResolvedValue(undefined)

      const result = await requestMagicLink(db, 'nonexistent@example.com')

      expect(result.success).toBe(true)
      expect(result.email).toBe('nonexistent@example.com')
    })

    it('should not reveal user existence through response structure', async () => {
      const db = createMockDb()

      // Mock non-existent user
      vi.mocked(db.selectFrom('users').select(['id', 'email']).where('email', '=', 'nonexistent@example.com').executeTakeFirst).mockResolvedValue(undefined)

      const result1 = await requestMagicLink(db, 'nonexistent@example.com')

      // Mock existing user
      vi.mocked(db.selectFrom('users').select(['id', 'email']).where('email', '=', 'existing@example.com').executeTakeFirst).mockResolvedValue({
        id: 'user-123',
        email: 'existing@example.com',
      })

      const result2 = await requestMagicLink(db, 'existing@example.com')

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
      vi.mocked(db.selectFrom('users').select(['id', 'email']).where('email', '=', 'user@example.com').executeTakeFirst).mockResolvedValue({
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
      vi.mocked(db.selectFrom('users').select(['id', 'email']).where('email', '=', 'nonexistent@example.com').executeTakeFirst).mockResolvedValue(undefined)

      await requestMagicLink(db, 'nonexistent@example.com', '/dashboard', mockCallback)

      // Callback should NOT be called
      expect(mockCallback).not.toHaveBeenCalled()
    })

    it('should include returnTo in link URL when provided', async () => {
      const db = createMockDb()
      const mockCallback = vi.fn()

      // Mock: User exists
      vi.mocked(db.selectFrom('users').select(['id', 'email']).where('email', '=', 'user@example.com').executeTakeFirst).mockResolvedValue({
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
      vi.mocked(db.selectFrom('users').select(['id', 'email']).where('email', '=', 'user@example.com').executeTakeFirst).mockResolvedValue({
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

    const setupValidTokenMocks = (db: Kysely<Database>) => {
      // Mock token lookup - valid token (expires 15 minutes from FIXED_TIME)
      vi.mocked(db.selectFrom('magic_link_tokens').selectAll().where('token', '=', validToken).executeTakeFirst).mockResolvedValue({
        token: validToken,
        user_id: userId,
        email: 'user@example.com',
        return_to: '/dashboard',
        expires_at: new Date(FIXED_TIME.getTime() + 900000), // 15 minutes from FIXED_TIME
        created_at: FIXED_TIME,
      })

      // Mock user lookup
      vi.mocked(db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst).mockResolvedValue({
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

      // Mock delete token
      vi.mocked(db.deleteFrom('magic_link_tokens').where('token', '=', validToken).execute).mockResolvedValue({
        numDeletedRows: BigInt(1),
      } as any)

      // Mock update user email_verified
      vi.mocked(db.updateTable('users').set({ email_verified: true }).where('id', '=', userId).execute).mockResolvedValue({
        numUpdatedRows: BigInt(1),
      } as any)

      // Mock session creation (insertInto sessions)
      vi.mocked(db.insertInto('sessions').values(expect.any(Object)).execute).mockResolvedValue({
        insertId: BigInt(1),
      } as any)
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
      vi.mocked(mockDb.selectFrom('magic_link_tokens').selectAll().where('token', '=', invalidToken).executeTakeFirst).mockResolvedValue(undefined)

      await expect(consumeMagicLink(mockDb, invalidToken)).rejects.toThrow('Invalid or expired magic link')
    })

    it('should reject expired token', async () => {
      const mockDb = createMockDb()
      const expiredToken = 'expired-token'

      // Mock: Token exists but is expired (15 minutes before FIXED_TIME)
      vi.mocked(mockDb.selectFrom('magic_link_tokens').selectAll().where('token', '=', expiredToken).executeTakeFirst).mockResolvedValue({
        token: expiredToken,
        user_id: userId,
        email: 'user@example.com',
        return_to: null,
        expires_at: new Date(FIXED_TIME.getTime() - 900000), // 15 minutes before FIXED_TIME (expired)
        created_at: new Date(FIXED_TIME.getTime() - 1800000), // 30 minutes before FIXED_TIME
      })

      // Mock delete expired token
      vi.mocked(mockDb.deleteFrom('magic_link_tokens').where('token', '=', expiredToken).execute).mockResolvedValue({
        numDeletedRows: BigInt(1),
      } as any)

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
      vi.mocked(mockDb.selectFrom('magic_link_tokens').selectAll().where('token', '=', orphanedToken).executeTakeFirst).mockResolvedValue({
        token: orphanedToken,
        user_id: 'non-existent-user',
        email: 'user@example.com',
        return_to: null,
        expires_at: new Date(FIXED_TIME.getTime() + 900000), // 15 minutes from FIXED_TIME
        created_at: FIXED_TIME,
      })

      // Mock: User doesn't exist
      vi.mocked(mockDb.selectFrom('users').selectAll().where('id', '=', 'non-existent-user').executeTakeFirst).mockResolvedValue(undefined)

      // Mock delete orphaned token
      vi.mocked(mockDb.deleteFrom('magic_link_tokens').where('token', '=', orphanedToken).execute).mockResolvedValue({
        numDeletedRows: BigInt(1),
      } as any)

      await expect(consumeMagicLink(mockDb, orphanedToken)).rejects.toThrow('User not found')
    })

    it('should not update email_verified if already verified', async () => {
      const mockDb = createMockDb()
      
      // Mock token lookup
      vi.mocked(mockDb.selectFrom('magic_link_tokens').selectAll().where('token', '=', validToken).executeTakeFirst).mockResolvedValue({
        token: validToken,
        user_id: userId,
        email: 'user@example.com',
        return_to: '/dashboard',
        expires_at: new Date(FIXED_TIME.getTime() + 900000),
        created_at: FIXED_TIME,
      })

      // Mock user with email already verified
      vi.mocked(mockDb.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst).mockResolvedValue({
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

      // Mock delete token
      vi.mocked(mockDb.deleteFrom('magic_link_tokens').where('token', '=', validToken).execute).mockResolvedValue({
        numDeletedRows: BigInt(1),
      } as any)

      // Mock session creation
      vi.mocked(mockDb.insertInto('sessions').values(expect.any(Object)).execute).mockResolvedValue({
        insertId: BigInt(1),
      } as any)

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
      
      // Mock token without returnTo
      vi.mocked(mockDb.selectFrom('magic_link_tokens').selectAll().where('token', '=', validToken).executeTakeFirst).mockResolvedValue({
        token: validToken,
        user_id: userId,
        email: 'user@example.com',
        return_to: null,
        expires_at: new Date(FIXED_TIME.getTime() + 900000),
        created_at: FIXED_TIME,
      })

      // Mock user lookup
      vi.mocked(mockDb.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst).mockResolvedValue({
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

      // Mock delete token
      vi.mocked(mockDb.deleteFrom('magic_link_tokens').where('token', '=', validToken).execute).mockResolvedValue({
        numDeletedRows: BigInt(1),
      } as any)

      // Mock update user
      vi.mocked(mockDb.updateTable('users').set({ email_verified: true }).where('id', '=', userId).execute).mockResolvedValue({
        numUpdatedRows: BigInt(1),
      } as any)

      // Mock session creation
      vi.mocked(mockDb.insertInto('sessions').values(expect.any(Object)).execute).mockResolvedValue({
        insertId: BigInt(1),
      } as any)

      const result = await consumeMagicLink(mockDb, validToken)

      expect(result.returnTo).toBeNull()
    })
  })

  describe('cleanupExpiredMagicLinkTokens()', () => {
    it('should delete expired tokens', async () => {
      const db = createMockDb()

      // Mock delete result
      vi.mocked(db.deleteFrom('magic_link_tokens').where('expires_at', '<=', expect.any(Date)).executeTakeFirst).mockResolvedValue({
        numDeletedRows: BigInt(5),
      } as any)

      const deleted = await cleanupExpiredMagicLinkTokens(db)

      expect(deleted).toBe(5)
      expect(db.deleteFrom).toHaveBeenCalledWith('magic_link_tokens')
    })

    it('should return 0 if no expired tokens', async () => {
      const db = createMockDb()

      // Mock delete result - no rows deleted
      vi.mocked(db.deleteFrom('magic_link_tokens').where('expires_at', '<=', expect.any(Date)).executeTakeFirst).mockResolvedValue({
        numDeletedRows: BigInt(0),
      } as any)

      const deleted = await cleanupExpiredMagicLinkTokens(db)

      expect(deleted).toBe(0)
    })
  })
})
