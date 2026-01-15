import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateChallenge,
  extractNonce,
  extractTimestamp,
  isValidChallengeFormat,
  storeChallenge,
  verifyChallenge,
  cleanupExpiredChallenges,
  CHALLENGE_TTL_MS,
} from '../challenge'
import type { ClearAuthConfig } from '../../types'
import { Kysely } from 'kysely'
import type { Database } from '../../database/schema'

// Mock database for testing
function createMockDb(): Kysely<Database> {
  const challenges = new Map<
    string,
    { nonce: string; challenge: string; created_at: Date; expires_at: Date }
  >()

  const mockDb = {
    insertInto: (table: string) => ({
      values: (data: any) => ({
        execute: async () => {
          if (table === 'challenges') {
            challenges.set(data.nonce, data)
          }
          return { numInsertedOrUpdatedRows: 1n }
        },
      }),
    }),
    selectFrom: (table: string) => ({
      selectAll: () => ({
        where: (col: string, op: string, value: any) => ({
          executeTakeFirst: async () => {
            if (table === 'challenges') {
              return challenges.get(value) || null
            }
            return null
          },
        }),
      }),
    }),
    deleteFrom: (table: string) => ({
      where: (col: string, op: string, value: any) => ({
        execute: async () => {
          if (table === 'challenges') {
            if (col === 'nonce') {
              const deleted = challenges.has(value)
              challenges.delete(value)
              return { numDeletedRows: deleted ? 1n : 0n }
            }
            // For expires_at cleanup
            let count = 0
            const now = value as Date
            for (const [nonce, challenge] of challenges.entries()) {
              if (challenge.expires_at <= now) {
                challenges.delete(nonce)
                count++
              }
            }
            return { numDeletedRows: BigInt(count) }
          }
          return { numDeletedRows: 0n }
        },
        executeTakeFirst: async () => {
          if (table === 'challenges') {
            let count = 0
            const now = value as Date
            for (const [nonce, challenge] of challenges.entries()) {
              if (challenge.expires_at <= now) {
                challenges.delete(nonce)
                count++
              }
            }
            return { numDeletedRows: BigInt(count) }
          }
          return { numDeletedRows: 0n }
        },
      }),
    }),
  } as any

  return mockDb
}

function createMockConfig(): ClearAuthConfig {
  return {
    database: createMockDb(),
    secret: 'test-secret',
    baseUrl: 'https://example.com',
    session: {
      expiresIn: 30 * 24 * 60 * 60, // 30 days
      cookieName: 'session',
    },
  } as ClearAuthConfig
}

describe('Challenge Generation', () => {
  describe('generateChallenge', () => {
    it('should generate a challenge with correct format', () => {
      const result = generateChallenge()

      expect(result.challenge).toMatch(/^[0-9a-f]{64}\|\d+$/)
      expect(result.expiresIn).toBe(600) // 10 minutes in seconds
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should generate unique nonces', () => {
      const challenge1 = generateChallenge()
      const challenge2 = generateChallenge()
      const challenge3 = generateChallenge()

      const nonce1 = extractNonce(challenge1.challenge)
      const nonce2 = extractNonce(challenge2.challenge)
      const nonce3 = extractNonce(challenge3.challenge)

      expect(nonce1).not.toBe(nonce2)
      expect(nonce2).not.toBe(nonce3)
      expect(nonce1).not.toBe(nonce3)
    })

    it('should generate nonces with 64 hex characters', () => {
      const result = generateChallenge()
      const nonce = extractNonce(result.challenge)

      expect(nonce).toHaveLength(64)
      expect(nonce).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should include current timestamp', () => {
      const before = Date.now()
      const result = generateChallenge()
      const after = Date.now()

      const timestamp = extractTimestamp(result.challenge)

      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it('should have consistent createdAt and timestamp', () => {
      const result = generateChallenge()
      const timestamp = extractTimestamp(result.challenge)
      const createdAtMs = new Date(result.createdAt).getTime()

      expect(timestamp).toBe(createdAtMs)
    })
  })

  describe('extractNonce', () => {
    it('should extract nonce from valid challenge', () => {
      const challenge = 'a'.repeat(64) + '|1705326960000'
      const nonce = extractNonce(challenge)

      expect(nonce).toBe('a'.repeat(64))
    })

    it('should return null for invalid format', () => {
      expect(extractNonce('invalid')).toBeNull()
      expect(extractNonce('abc|def')).toBeNull()
      expect(extractNonce('a'.repeat(63) + '|1705326960000')).toBeNull() // Too short
      expect(extractNonce('a'.repeat(65) + '|1705326960000')).toBeNull() // Too long
      expect(extractNonce('z'.repeat(64) + '|1705326960000')).toBeNull() // Invalid hex
    })

    it('should return null for missing separator', () => {
      expect(extractNonce('a'.repeat(64))).toBeNull()
      expect(extractNonce('a'.repeat(64) + '1705326960000')).toBeNull()
    })
  })

  describe('extractTimestamp', () => {
    it('should extract timestamp from valid challenge', () => {
      const challenge = 'a'.repeat(64) + '|1705326960000'
      const timestamp = extractTimestamp(challenge)

      expect(timestamp).toBe(1705326960000)
    })

    it('should return null for invalid timestamp', () => {
      expect(extractTimestamp('a'.repeat(64) + '|abc')).toBeNull()
      expect(extractTimestamp('a'.repeat(64) + '|-123')).toBeNull()
      expect(extractTimestamp('a'.repeat(64) + '|0')).toBeNull()
    })

    it('should return null for missing separator', () => {
      expect(extractTimestamp('a'.repeat(64))).toBeNull()
    })
  })

  describe('isValidChallengeFormat', () => {
    it('should return true for valid format', () => {
      const challenge = 'a'.repeat(64) + '|1705326960000'
      expect(isValidChallengeFormat(challenge)).toBe(true)
    })

    it('should return false for invalid nonce', () => {
      expect(isValidChallengeFormat('abc|1705326960000')).toBe(false)
      expect(isValidChallengeFormat('z'.repeat(64) + '|1705326960000')).toBe(false)
    })

    it('should return false for invalid timestamp', () => {
      expect(isValidChallengeFormat('a'.repeat(64) + '|abc')).toBe(false)
      expect(isValidChallengeFormat('a'.repeat(64) + '|0')).toBe(false)
    })

    it('should return false for empty or non-string input', () => {
      expect(isValidChallengeFormat('')).toBe(false)
      expect(isValidChallengeFormat(null as any)).toBe(false)
      expect(isValidChallengeFormat(undefined as any)).toBe(false)
      expect(isValidChallengeFormat(123 as any)).toBe(false)
    })
  })
})

describe('Challenge Storage', () => {
  let config: ClearAuthConfig

  beforeEach(() => {
    config = createMockConfig()
  })

  describe('storeChallenge', () => {
    it('should store a valid challenge', async () => {
      const result = generateChallenge()
      await expect(storeChallenge(config, result.challenge)).resolves.not.toThrow()
    })

    it('should reject invalid challenge format', async () => {
      await expect(storeChallenge(config, 'invalid')).rejects.toThrow('Invalid challenge format')
    })

    it('should store challenge with correct TTL', async () => {
      const challenge = generateChallenge()
      await storeChallenge(config, challenge.challenge)

      const nonce = extractNonce(challenge.challenge)
      const timestamp = extractTimestamp(challenge.challenge)

      expect(nonce).toBeTruthy()
      expect(timestamp).toBeTruthy()

      // Verify stored challenge has correct expiration
      const storedChallenge = await config.database
        .selectFrom('challenges')
        .selectAll()
        .where('nonce', '=', nonce!)
        .executeTakeFirst()

      expect(storedChallenge).toBeTruthy()
      expect(storedChallenge?.expires_at.getTime()).toBe(timestamp! + CHALLENGE_TTL_MS)
    })
  })
})

describe('Challenge Verification', () => {
  let config: ClearAuthConfig

  beforeEach(() => {
    config = createMockConfig()
  })

  describe('verifyChallenge', () => {
    it('should verify a valid non-expired challenge', async () => {
      const challenge = generateChallenge()
      await storeChallenge(config, challenge.challenge)

      const isValid = await verifyChallenge(config, challenge.challenge)
      expect(isValid).toBe(true)
    })

    it('should reject challenge with invalid format', async () => {
      const isValid = await verifyChallenge(config, 'invalid')
      expect(isValid).toBe(false)
    })

    it('should reject non-existent challenge', async () => {
      const challenge = generateChallenge()
      // Don't store it
      const isValid = await verifyChallenge(config, challenge.challenge)
      expect(isValid).toBe(false)
    })

    it('should reject expired challenge', async () => {
      // Create an expired challenge
      const timestamp = Date.now() - CHALLENGE_TTL_MS - 1000 // Expired 1 second ago
      const nonce = 'a'.repeat(64)
      const challenge = `${nonce}|${timestamp}`

      await storeChallenge(config, challenge)

      const isValid = await verifyChallenge(config, challenge)
      expect(isValid).toBe(false)
    })

    it('should consume challenge after verification (one-time use)', async () => {
      const challenge = generateChallenge()
      await storeChallenge(config, challenge.challenge)

      // First verification should succeed
      const isValid1 = await verifyChallenge(config, challenge.challenge)
      expect(isValid1).toBe(true)

      // Second verification should fail (challenge was consumed)
      const isValid2 = await verifyChallenge(config, challenge.challenge)
      expect(isValid2).toBe(false)
    })

    it('should reject challenge with mismatched string', async () => {
      const challenge1 = generateChallenge()
      const nonce = extractNonce(challenge1.challenge)!

      // Store challenge1
      await storeChallenge(config, challenge1.challenge)

      // Try to verify with different timestamp but same nonce
      const challenge2 = `${nonce}|${Date.now() + 1000}`

      const isValid = await verifyChallenge(config, challenge2)
      expect(isValid).toBe(false)
    })
  })

  describe('cleanupExpiredChallenges', () => {
    it('should delete expired challenges', async () => {
      // Create 2 expired challenges
      const timestamp1 = Date.now() - CHALLENGE_TTL_MS - 1000
      const timestamp2 = Date.now() - CHALLENGE_TTL_MS - 2000
      const challenge1 = `${'a'.repeat(64)}|${timestamp1}`
      const challenge2 = `${'b'.repeat(64)}|${timestamp2}`

      await storeChallenge(config, challenge1)
      await storeChallenge(config, challenge2)

      // Create 1 valid challenge
      const validChallenge = generateChallenge()
      await storeChallenge(config, validChallenge.challenge)

      const deleted = await cleanupExpiredChallenges(config)
      expect(deleted).toBe(2)

      // Verify valid challenge still exists
      const isValid = await verifyChallenge(config, validChallenge.challenge)
      expect(isValid).toBe(true)
    })

    it('should return 0 when no challenges are expired', async () => {
      const challenge = generateChallenge()
      await storeChallenge(config, challenge.challenge)

      const deleted = await cleanupExpiredChallenges(config)
      expect(deleted).toBe(0)
    })

    it('should return 0 when challenges table is empty', async () => {
      const deleted = await cleanupExpiredChallenges(config)
      expect(deleted).toBe(0)
    })
  })
})
