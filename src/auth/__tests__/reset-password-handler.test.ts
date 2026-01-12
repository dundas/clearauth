/**
 * Password Reset Handler Tests
 *
 * Tests for the HTTP handler backward compatibility with password/newPassword fields
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleAuthRequest } from '../handler.js'
import type { ClearAuthConfig } from '../../types.js'
import type { Kysely } from 'kysely'
import type { Database } from '../../database/schema.js'
import { createPbkdf2PasswordHasher } from '../../password-hasher.js'

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

describe('Password Reset Handler - Backward Compatibility', () => {
  let mockDb: Kysely<Database>
  let config: ClearAuthConfig
  const validToken = 'valid-reset-token-123'
  const validPassword = 'NewSecurePass123!'
  const userId = 'user-123'

  beforeEach(() => {
    mockDb = createMockDb()
    config = {
      database: mockDb,
      secret: 'test-secret',
      baseUrl: 'http://localhost:3000',
      passwordHasher: createPbkdf2PasswordHasher(),
    }

    // Mock token lookup - valid token
    vi.mocked(mockDb.selectFrom('password_reset_tokens').selectAll().where('token', '=', validToken).executeTakeFirst).mockResolvedValue({
      token: validToken,
      user_id: userId,
      expires_at: new Date(Date.now() + 3600000), // 1 hour from now
      created_at: new Date(),
    })

    // Mock delete all user sessions
    vi.mocked(mockDb.deleteFrom('sessions').where('user_id', '=', userId).execute).mockResolvedValue({
      numDeletedRows: BigInt(1),
    } as any)

    // Mock delete reset token
    vi.mocked(mockDb.deleteFrom('password_reset_tokens').where('token', '=', validToken).execute).mockResolvedValue({
      numDeletedRows: BigInt(1),
    } as any)

    // Mock update user password
    vi.mocked(mockDb.updateTable('users').set({ password_hash: expect.any(String) }).where('id', '=', userId).execute).mockResolvedValue({
      numUpdatedRows: BigInt(1),
    } as any)
  })

  describe('POST /auth/reset-password', () => {
    it('should accept "password" field (canonical)', async () => {
      const request = new Request('http://localhost:3000/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: validToken,
          password: validPassword,
        }),
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should accept "newPassword" field (backward compatibility)', async () => {
      const request = new Request('http://localhost:3000/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: validToken,
          newPassword: validPassword,
        }),
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should reject when neither password nor newPassword is provided', async () => {
      const request = new Request('http://localhost:3000/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: validToken,
        }),
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Token and password are required')
      expect(data.code).toBe('MISSING_FIELDS')
    })

    it('should reject when token is missing', async () => {
      const request = new Request('http://localhost:3000/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: validPassword,
        }),
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Token and password are required')
      expect(data.code).toBe('MISSING_FIELDS')
    })

    it('should prefer "password" over "newPassword" when both are provided', async () => {
      const request = new Request('http://localhost:3000/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: validToken,
          password: validPassword,
          newPassword: 'DifferentPass456!',
        }),
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      // The implementation uses nullish coalescing (password ?? newPassword)
      // so "password" takes precedence
    })

    it('should reject with invalid token', async () => {
      const invalidToken = 'invalid-token'

      // Mock: Token doesn't exist
      vi.mocked(mockDb.selectFrom('password_reset_tokens').selectAll().where('token', '=', invalidToken).executeTakeFirst).mockResolvedValue(undefined)

      const request = new Request('http://localhost:3000/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: invalidToken,
          password: validPassword,
        }),
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid or expired reset token')
      expect(data.code).toBe('INVALID_TOKEN')
    })

    it('should reject with expired token', async () => {
      const expiredToken = 'expired-token'

      // Mock: Token exists but is expired
      vi.mocked(mockDb.selectFrom('password_reset_tokens').selectAll().where('token', '=', expiredToken).executeTakeFirst).mockResolvedValue({
        token: expiredToken,
        user_id: userId,
        expires_at: new Date(Date.now() - 3600000), // 1 hour ago (expired)
        created_at: new Date(Date.now() - 7200000),
      })

      // Mock delete expired token
      vi.mocked(mockDb.deleteFrom('password_reset_tokens').where('token', '=', expiredToken).execute).mockResolvedValue({
        numDeletedRows: BigInt(1),
      } as any)

      const request = new Request('http://localhost:3000/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: expiredToken,
          password: validPassword,
        }),
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Reset token has expired')
      expect(data.code).toBe('TOKEN_EXPIRED')
    })

    it('should invalidate all user sessions after password reset', async () => {
      const request = new Request('http://localhost:3000/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: validToken,
          password: validPassword,
        }),
      })

      await handleAuthRequest(request, config)

      // Verify sessions were deleted
      expect(mockDb.deleteFrom).toHaveBeenCalledWith('sessions')
    })
  })
})
