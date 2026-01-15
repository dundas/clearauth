import { describe, it, expect, beforeEach } from 'vitest'
import { handleChallengeRequest, handleDeviceAuthRequest } from '../handlers'
import type { ClearAuthConfig } from '../../types'
import type { ChallengeResponse } from '../types'
import { Kysely } from 'kysely'
import type { Database } from '../../database/schema'
import { isValidChallengeFormat } from '../challenge'

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
            const deleted = challenges.has(value)
            challenges.delete(value)
            return { numDeletedRows: deleted ? 1n : 0n }
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
    db: createMockDb(),
    session: {
      expiresIn: 30 * 24 * 60 * 60, // 30 days
      cookieName: 'session',
    },
  } as ClearAuthConfig
}

describe('Device Authentication Handlers', () => {
  let config: ClearAuthConfig

  beforeEach(() => {
    config = createMockConfig()
  })

  describe('handleChallengeRequest', () => {
    it('should generate and return a challenge', async () => {
      const request = new Request('https://example.com/auth/challenge', {
        method: 'POST',
      })

      const response = await handleChallengeRequest(request, config)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const body = (await response.json()) as ChallengeResponse
      expect(body.challenge).toBeDefined()
      expect(body.expiresIn).toBe(600)
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(isValidChallengeFormat(body.challenge)).toBe(true)
    })

    it('should generate unique challenges on multiple requests', async () => {
      const request1 = new Request('https://example.com/auth/challenge', {
        method: 'POST',
      })
      const request2 = new Request('https://example.com/auth/challenge', {
        method: 'POST',
      })

      const response1 = await handleChallengeRequest(request1, config)
      const response2 = await handleChallengeRequest(request2, config)

      const body1 = (await response1.json()) as ChallengeResponse
      const body2 = (await response2.json()) as ChallengeResponse

      expect(body1.challenge).not.toBe(body2.challenge)
    })

    it('should store challenge in database', async () => {
      const request = new Request('https://example.com/auth/challenge', {
        method: 'POST',
      })

      const response = await handleChallengeRequest(request, config)
      const body = (await response.json()) as ChallengeResponse

      // Extract nonce and verify stored
      const nonce = body.challenge.split('|')[0]
      const storedChallenge = await config.db
        .selectFrom('challenges')
        .selectAll()
        .where('nonce', '=', nonce!)
        .executeTakeFirst()

      expect(storedChallenge).toBeDefined()
      expect(storedChallenge?.challenge).toBe(body.challenge)
    })

    it('should reject non-POST requests', async () => {
      const request = new Request('https://example.com/auth/challenge', {
        method: 'GET',
      })

      const response = await handleChallengeRequest(request, config)

      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('POST')

      const body = await response.json()
      expect(body.error).toBe('method_not_allowed')
    })

    it('should handle empty POST body', async () => {
      const request = new Request('https://example.com/auth/challenge', {
        method: 'POST',
        body: '',
      })

      const response = await handleChallengeRequest(request, config)

      expect(response.status).toBe(200)
      const body = (await response.json()) as ChallengeResponse
      expect(body.challenge).toBeDefined()
    })

    it('should return 500 on database error', async () => {
      // Create config with failing database
      const failingConfig = {
        db: {
          insertInto: () => ({
            values: () => ({
              execute: async () => {
                throw new Error('Database error')
              },
            }),
          }),
        },
        session: config.session,
      } as any as ClearAuthConfig

      const request = new Request('https://example.com/auth/challenge', {
        method: 'POST',
      })

      const response = await handleChallengeRequest(request, failingConfig)

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toBe('internal_error')
      expect(body.message).toBe('Failed to generate challenge')
    })
  })

  describe('handleDeviceAuthRequest', () => {
    it('should route /auth/challenge to handleChallengeRequest', async () => {
      const request = new Request('https://example.com/auth/challenge', {
        method: 'POST',
      })

      const response = await handleDeviceAuthRequest(request, config)

      expect(response).not.toBeNull()
      expect(response?.status).toBe(200)

      const body = (await response!.json()) as ChallengeResponse
      expect(body.challenge).toBeDefined()
    })

    it('should return null for unknown routes', async () => {
      const request = new Request('https://example.com/auth/unknown', {
        method: 'POST',
      })

      const response = await handleDeviceAuthRequest(request, config)

      expect(response).toBeNull()
    })

    it('should handle different base URLs', async () => {
      const request1 = new Request('https://example.com/auth/challenge', {
        method: 'POST',
      })
      const request2 = new Request('https://api.example.com/auth/challenge', {
        method: 'POST',
      })

      const response1 = await handleDeviceAuthRequest(request1, config)
      const response2 = await handleDeviceAuthRequest(request2, config)

      expect(response1).not.toBeNull()
      expect(response2).not.toBeNull()
      expect(response1?.status).toBe(200)
      expect(response2?.status).toBe(200)
    })
  })
})
