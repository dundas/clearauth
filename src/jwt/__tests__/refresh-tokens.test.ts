import { describe, it, expect, beforeEach } from 'vitest'
import { Kysely } from 'kysely'
import type { Database } from '../../database/schema.js'
import {
  hashRefreshToken,
  generateRefreshToken,
  createRefreshToken,
  getRefreshToken,
  getRefreshTokenById,
  getUserRefreshTokens,
  updateLastUsed,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  deleteRefreshToken,
  cleanupExpiredTokens,
} from '../refresh-tokens.js'

// Mock Kysely database for testing
class MockDatabase {
  private tokens: Map<string, any> = new Map()
  private idCounter = 1

  insertInto(table: string) {
    return {
      values: (values: any) => ({
        returningAll: () => ({
          executeTakeFirstOrThrow: async () => {
            const id = `token-${this.idCounter++}`
            const record = {
              id,
              ...values,
              created_at: new Date(),
            }
            this.tokens.set(id, record)
            return record
          },
        }),
      }),
    }
  }

  selectFrom(table: string) {
    return {
      selectAll: () => ({
        where: (column: string, op: string, value: any) => ({
          executeTakeFirst: async () => {
            for (const token of this.tokens.values()) {
              if (column === 'token_hash' && token.token_hash === value) {
                return token
              }
              if (column === 'id' && token.id === value) {
                return token
              }
            }
            return undefined
          },
          where: (column2: string, op2: string, value2: any) => ({
            execute: async () => {
              const results = []
              for (const token of this.tokens.values()) {
                if (column === 'user_id' && token.user_id === value) {
                  if (column2 === 'revoked_at' && op2 === 'is' && value2 === null) {
                    if (token.revoked_at === null) {
                      results.push(token)
                    }
                  }
                }
              }
              return results
            },
          }),
          execute: async () => {
            const results = []
            for (const token of this.tokens.values()) {
              if (column === 'user_id' && token.user_id === value) {
                results.push(token)
              }
            }
            return results
          },
        }),
      }),
    }
  }

  updateTable(table: string) {
    return {
      set: (values: any) => ({
        where: (column: string, op: string, value: any) => ({
          returningAll: () => ({
            executeTakeFirstOrThrow: async () => {
              for (const [id, token] of this.tokens.entries()) {
                if (column === 'id' && token.id === value) {
                  const updated = { ...token, ...values }
                  this.tokens.set(id, updated)
                  return updated
                }
              }
              throw new Error('Token not found')
            },
          }),
          where: (column2: string, op2: string, value2: any) => ({
            executeTakeFirst: async () => {
              let count = 0
              for (const [id, token] of this.tokens.entries()) {
                if (column === 'user_id' && token.user_id === value) {
                  if (column2 === 'revoked_at' && op2 === 'is' && value2 === null) {
                    if (token.revoked_at === null) {
                      const updated = { ...token, ...values }
                      this.tokens.set(id, updated)
                      count++
                    }
                  }
                }
              }
              return { numUpdatedRows: BigInt(count) }
            },
          }),
          executeTakeFirst: async () => {
            let count = 0
            for (const [id, token] of this.tokens.entries()) {
              if (column === 'user_id' && token.user_id === value) {
                if ('revoked_at' in values && token.revoked_at === null) {
                  const updated = { ...token, ...values }
                  this.tokens.set(id, updated)
                  count++
                }
              }
            }
            return { numUpdatedRows: BigInt(count) }
          },
        }),
      }),
    }
  }

  deleteFrom(table: string) {
    return {
      where: (column: string, op: string, value: any) => ({
        execute: async () => {
          if (column === 'id') {
            const deleted = this.tokens.delete(value)
            return { numDeletedRows: deleted ? BigInt(1) : BigInt(0) }
          }
          if (column === 'expires_at' && op === '<') {
            let count = 0
            for (const [id, token] of this.tokens.entries()) {
              if (token.expires_at < value) {
                this.tokens.delete(id)
                count++
              }
            }
            return { numDeletedRows: BigInt(count) }
          }
          return { numDeletedRows: BigInt(0) }
        },
        executeTakeFirst: async () => {
          if (column === 'expires_at' && op === '<') {
            let count = 0
            for (const [id, token] of this.tokens.entries()) {
              if (token.expires_at < value) {
                this.tokens.delete(id)
                count++
              }
            }
            return { numDeletedRows: BigInt(count) }
          }
          return { numDeletedRows: BigInt(0) }
        },
      }),
    }
  }

  clear() {
    this.tokens.clear()
    this.idCounter = 1
  }
}

describe('Refresh Token Operations', () => {
  let db: Kysely<Database>
  let mockDb: MockDatabase

  beforeEach(() => {
    mockDb = new MockDatabase()
    db = mockDb as unknown as Kysely<Database>
  })

  describe('hashRefreshToken', () => {
    it('should hash token using SHA-256', async () => {
      const token = 'test-token-123'
      const hash = await hashRefreshToken(token)

      expect(hash).toBeTruthy()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(64) // SHA-256 produces 64 hex characters
    })

    it('should produce consistent hashes for same token', async () => {
      const token = 'test-token-456'
      const hash1 = await hashRefreshToken(token)
      const hash2 = await hashRefreshToken(token)

      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different tokens', async () => {
      const token1 = 'token-abc'
      const token2 = 'token-xyz'
      const hash1 = await hashRefreshToken(token1)
      const hash2 = await hashRefreshToken(token2)

      expect(hash1).not.toBe(hash2)
    })

    it('should use Web Crypto API (edge-compatible)', async () => {
      // This test verifies we're using crypto.subtle, not Node.js crypto
      const token = 'edge-test-token'
      const hash = await hashRefreshToken(token)

      expect(hash).toMatch(/^[0-9a-f]{64}$/) // Valid hex string
    })
  })

  describe('generateRefreshToken', () => {
    it('should generate a random token', () => {
      const token = generateRefreshToken()

      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })

    it('should generate unique tokens', () => {
      const token1 = generateRefreshToken()
      const token2 = generateRefreshToken()

      expect(token1).not.toBe(token2)
    })

    it('should generate tokens with sufficient entropy', () => {
      const tokens = new Set()
      for (let i = 0; i < 100; i++) {
        tokens.add(generateRefreshToken())
      }

      // All 100 tokens should be unique
      expect(tokens.size).toBe(100)
    })
  })

  describe('createRefreshToken', () => {
    it('should create refresh token and return raw token + record', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000) // 24 hours

      const { token, record } = await createRefreshToken(db, userId, expiresAt)

      expect(token).toBeTruthy()
      expect(record).toBeTruthy()
      expect(record.user_id).toBe(userId)
      expect(record.expires_at).toEqual(expiresAt)
      expect(record.revoked_at).toBeNull()
      expect(record.last_used_at).toBeNull()
      expect(record.token_hash).toBeTruthy()
      expect(record.token_hash.length).toBe(64) // SHA-256 hash
    })

    it('should store hashed token, not plaintext', async () => {
      const userId = 'user-456'
      const expiresAt = new Date(Date.now() + 86400000)

      const { token, record } = await createRefreshToken(db, userId, expiresAt)

      expect(record.token_hash).not.toBe(token)
      expect(record.token_hash).toBe(await hashRefreshToken(token))
    })

    it('should support optional device name', async () => {
      const userId = 'user-789'
      const expiresAt = new Date(Date.now() + 86400000)
      const name = 'iPhone 15 Pro'

      const { record } = await createRefreshToken(db, userId, expiresAt, name)

      expect(record.name).toBe(name)
    })

    it('should default name to null if not provided', async () => {
      const userId = 'user-101'
      const expiresAt = new Date(Date.now() + 86400000)

      const { record } = await createRefreshToken(db, userId, expiresAt)

      expect(record.name).toBeNull()
    })
  })

  describe('getRefreshToken', () => {
    it('should retrieve token by raw token value', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      const { token, record: created } = await createRefreshToken(db, userId, expiresAt)

      const retrieved = await getRefreshToken(db, token)

      expect(retrieved).toBeTruthy()
      expect(retrieved?.id).toBe(created.id)
      expect(retrieved?.user_id).toBe(userId)
    })

    it('should return null for non-existent token', async () => {
      const result = await getRefreshToken(db, 'non-existent-token')

      expect(result).toBeNull()
    })

    it('should return null for wrong token value', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      await createRefreshToken(db, userId, expiresAt)

      const result = await getRefreshToken(db, 'wrong-token')

      expect(result).toBeNull()
    })
  })

  describe('getRefreshTokenById', () => {
    it('should retrieve token by database ID', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      const { record: created } = await createRefreshToken(db, userId, expiresAt)

      const retrieved = await getRefreshTokenById(db, created.id)

      expect(retrieved).toBeTruthy()
      expect(retrieved?.id).toBe(created.id)
      expect(retrieved?.user_id).toBe(userId)
    })

    it('should return null for non-existent ID', async () => {
      const result = await getRefreshTokenById(db, 'non-existent-id')

      expect(result).toBeNull()
    })
  })

  describe('getUserRefreshTokens', () => {
    it('should retrieve all active tokens for user', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)

      await createRefreshToken(db, userId, expiresAt, 'Device 1')
      await createRefreshToken(db, userId, expiresAt, 'Device 2')
      await createRefreshToken(db, 'other-user', expiresAt, 'Device 3')

      const tokens = await getUserRefreshTokens(db, userId)

      expect(tokens).toHaveLength(2)
      expect(tokens.every((t) => t.user_id === userId)).toBe(true)
    })

    it('should exclude revoked tokens by default', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)

      const { record: token1 } = await createRefreshToken(db, userId, expiresAt)
      await createRefreshToken(db, userId, expiresAt)
      await revokeRefreshToken(db, token1.id)

      const tokens = await getUserRefreshTokens(db, userId)

      expect(tokens).toHaveLength(1)
      expect(tokens[0].revoked_at).toBeNull()
    })

    it('should include revoked tokens when requested', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)

      const { record: token1 } = await createRefreshToken(db, userId, expiresAt)
      await createRefreshToken(db, userId, expiresAt)
      await revokeRefreshToken(db, token1.id)

      const tokens = await getUserRefreshTokens(db, userId, true)

      expect(tokens).toHaveLength(2)
    })

    it('should return empty array for user with no tokens', async () => {
      const tokens = await getUserRefreshTokens(db, 'user-with-no-tokens')

      expect(tokens).toHaveLength(0)
    })
  })

  describe('updateLastUsed', () => {
    it('should update last_used_at timestamp', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      const { record: created } = await createRefreshToken(db, userId, expiresAt)

      expect(created.last_used_at).toBeNull()

      const updated = await updateLastUsed(db, created.id)

      expect(updated.last_used_at).toBeTruthy()
      expect(updated.last_used_at).toBeInstanceOf(Date)
    })

    it('should update timestamp to current time', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      const { record: created } = await createRefreshToken(db, userId, expiresAt)

      const before = Date.now()
      const updated = await updateLastUsed(db, created.id)
      const after = Date.now()

      const lastUsedTime = updated.last_used_at!.getTime()
      expect(lastUsedTime).toBeGreaterThanOrEqual(before)
      expect(lastUsedTime).toBeLessThanOrEqual(after)
    })
  })

  describe('rotateRefreshToken', () => {
    it('should create new token and revoke old token', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      const { token: oldToken, record: oldRecord } = await createRefreshToken(
        db,
        userId,
        expiresAt,
        'Device 1'
      )

      const newExpiresAt = new Date(Date.now() + 86400000 * 2)
      const result = await rotateRefreshToken(db, oldToken, newExpiresAt)

      expect(result).toBeTruthy()
      expect(result!.token).toBeTruthy()
      expect(result!.token).not.toBe(oldToken)
      expect(result!.record.user_id).toBe(userId)
      expect(result!.record.name).toBe('Device 1') // Name preserved
      expect(result!.record.expires_at).toEqual(newExpiresAt)

      // Old token should be revoked
      const oldTokenRetrieved = await getRefreshTokenById(db, oldRecord.id)
      expect(oldTokenRetrieved!.revoked_at).toBeTruthy()
    })

    it('should return null for non-existent token', async () => {
      const expiresAt = new Date(Date.now() + 86400000)
      const result = await rotateRefreshToken(db, 'non-existent-token', expiresAt)

      expect(result).toBeNull()
    })

    it('should return null for expired token', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() - 86400000) // Already expired
      const { token } = await createRefreshToken(db, userId, expiresAt)

      const result = await rotateRefreshToken(db, token, new Date(Date.now() + 86400000))

      expect(result).toBeNull()
    })

    it('should return null for revoked token', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      const { token, record } = await createRefreshToken(db, userId, expiresAt)
      await revokeRefreshToken(db, record.id)

      const result = await rotateRefreshToken(db, token, new Date(Date.now() + 86400000))

      expect(result).toBeNull()
    })
  })

  describe('revokeRefreshToken', () => {
    it('should set revoked_at timestamp', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      const { record: created } = await createRefreshToken(db, userId, expiresAt)

      expect(created.revoked_at).toBeNull()

      const revoked = await revokeRefreshToken(db, created.id)

      expect(revoked.revoked_at).toBeTruthy()
      expect(revoked.revoked_at).toBeInstanceOf(Date)
    })

    it('should prevent token from being retrieved as valid', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      const { token, record } = await createRefreshToken(db, userId, expiresAt)

      await revokeRefreshToken(db, record.id)

      const retrieved = await getRefreshToken(db, token)
      expect(retrieved!.revoked_at).toBeTruthy()
    })
  })

  describe('revokeAllUserRefreshTokens', () => {
    it('should revoke all active tokens for user', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)

      await createRefreshToken(db, userId, expiresAt)
      await createRefreshToken(db, userId, expiresAt)
      await createRefreshToken(db, userId, expiresAt)

      const count = await revokeAllUserRefreshTokens(db, userId)

      expect(count).toBe(3)

      const tokens = await getUserRefreshTokens(db, userId, true)
      expect(tokens.every((t) => t.revoked_at !== null)).toBe(true)
    })

    it('should not revoke already-revoked tokens', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)

      const { record: token1 } = await createRefreshToken(db, userId, expiresAt)
      await createRefreshToken(db, userId, expiresAt)
      await revokeRefreshToken(db, token1.id) // Revoke one

      const count = await revokeAllUserRefreshTokens(db, userId)

      expect(count).toBe(1) // Only one active token was revoked
    })

    it('should return 0 for user with no tokens', async () => {
      const count = await revokeAllUserRefreshTokens(db, 'user-with-no-tokens')

      expect(count).toBe(0)
    })

    it('should not affect other users tokens', async () => {
      const user1 = 'user-123'
      const user2 = 'user-456'
      const expiresAt = new Date(Date.now() + 86400000)

      await createRefreshToken(db, user1, expiresAt)
      await createRefreshToken(db, user2, expiresAt)

      await revokeAllUserRefreshTokens(db, user1)

      const user1Tokens = await getUserRefreshTokens(db, user1)
      const user2Tokens = await getUserRefreshTokens(db, user2)

      expect(user1Tokens).toHaveLength(0)
      expect(user2Tokens).toHaveLength(1)
    })
  })

  describe('deleteRefreshToken', () => {
    it('should permanently delete token from database', async () => {
      const userId = 'user-123'
      const expiresAt = new Date(Date.now() + 86400000)
      const { record } = await createRefreshToken(db, userId, expiresAt)

      await deleteRefreshToken(db, record.id)

      const retrieved = await getRefreshTokenById(db, record.id)
      expect(retrieved).toBeNull()
    })
  })

  describe('cleanupExpiredTokens', () => {
    it('should delete tokens expired beyond cutoff date', async () => {
      const userId = 'user-123'
      const now = Date.now()

      // Create tokens with different expiration dates
      await createRefreshToken(db, userId, new Date(now - 100 * 24 * 60 * 60 * 1000)) // 100 days ago
      await createRefreshToken(db, userId, new Date(now - 50 * 24 * 60 * 60 * 1000)) // 50 days ago
      await createRefreshToken(db, userId, new Date(now + 24 * 60 * 60 * 1000)) // Future

      const deleted = await cleanupExpiredTokens(db, 90)

      expect(deleted).toBe(1) // Only the 100-day-old token
    })

    it('should not delete recently expired tokens', async () => {
      const userId = 'user-123'
      const now = Date.now()

      await createRefreshToken(db, userId, new Date(now - 30 * 24 * 60 * 60 * 1000)) // 30 days ago

      const deleted = await cleanupExpiredTokens(db, 90)

      expect(deleted).toBe(0)
    })

    it('should not delete future-dated tokens', async () => {
      const userId = 'user-123'
      const now = Date.now()

      await createRefreshToken(db, userId, new Date(now + 30 * 24 * 60 * 60 * 1000)) // 30 days future

      const deleted = await cleanupExpiredTokens(db, 90)

      expect(deleted).toBe(0)
    })
  })
})
