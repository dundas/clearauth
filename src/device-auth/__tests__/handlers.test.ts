import { describe, it, expect, beforeEach } from 'vitest'
import { handleChallengeRequest, handleDeviceAuthRequest } from '../handlers'
import type { ClearAuthConfig } from '../../types'
import type { ChallengeResponse } from '../types'
import { Kysely } from 'kysely'
import type { Database } from '../../database/schema'
import { isValidChallengeFormat } from '../challenge'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { hashEIP191Message } from '../web3-verifier.js'

// Mock database for testing
function createMockDb(): Kysely<Database> {
  const challenges = new Map<
    string,
    { nonce: string; challenge: string; created_at: Date; expires_at: Date }
  >()
  const devices = new Map<string, any>()
  const sessions = new Map<string, any>()
  const users = new Map<string, any>()

  // Seed a test user + session for session-authenticated endpoints
  const user = {
    id: 'user-123',
    email: 'test@example.com',
    email_verified: true,
    name: null,
    avatar_url: null,
    created_at: new Date(),
  }
  users.set(user.id, user)

  const sessionId = 'sess-123'
  sessions.set(sessionId, {
    id: sessionId,
    user_id: user.id,
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
    ip_address: null,
    user_agent: null,
    created_at: new Date(),
  })

  const mockDb = {
    insertInto: (table: string) => ({
      values: (data: any) => ({
        execute: async () => {
          if (table === 'challenges') {
            challenges.set(data.nonce, data)
          }
          if (table === 'devices') {
            devices.set(data.device_id, { id: 'device-uuid', created_at: new Date(), ...data })
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
            if (table === 'sessions') {
              return sessions.get(value) || null
            }
            if (table === 'users') {
              return users.get(value) || null
            }
            if (table === 'devices') {
              return devices.get(value) || null
            }
            return null
          },
        }),
      }),
      select: (_cols: any) => ({
        where: (col: string, op: string, value: any) => ({
          executeTakeFirst: async () => {
            if (table === 'users' && col === 'id') {
              return users.get(value) || null
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
    database: createMockDb(),
    secret: 'test-secret',
    baseUrl: 'https://example.com',
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
      const storedChallenge = await config.database
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
        database: {
          insertInto: () => ({
            values: () => ({
              execute: async () => {
                throw new Error('Database error')
              },
            }),
          }),
        },
        secret: 'test-secret',
        baseUrl: 'https://example.com',
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

    it('should register a web3 device with valid session + challenge + signature', async () => {
      // 1) Create a challenge
      const challengeResp = await handleDeviceAuthRequest(
        new Request('https://example.com/auth/challenge', { method: 'POST' }),
        config
      )
      expect(challengeResp?.status).toBe(200)
      const challengeBody = (await challengeResp!.json()) as ChallengeResponse

      // 2) Create wallet + sign challenge (EIP-191)
      const privateKey = new Uint8Array(32).fill(7)
      privateKey[0] = 42
      const publicKey = secp256k1.getPublicKey(privateKey, false)
      const walletAddress =
        '0x' +
        Array.from(keccak_256(publicKey.slice(1)).slice(-20))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')

      const messageHash = hashEIP191Message(challengeBody.challenge)
      const signatureBytes = secp256k1.sign(messageHash, privateKey, { prehash: false })
      const sig = secp256k1.Signature.fromBytes(signatureBytes)

      // Determine recovery id by trying 0..3 (some may throw)
      let recovery = 0
      for (let i = 0; i < 4; i++) {
        try {
          const recovered = sig.addRecoveryBit(i).recoverPublicKey(messageHash).toBytes(false)
          if (bytesToHex(recovered).toLowerCase() === bytesToHex(publicKey).toLowerCase()) {
            recovery = i
            break
          }
        } catch {
          // ignore
        }
      }

      const r = bytesToHex(signatureBytes.slice(0, 32))
      const s = bytesToHex(signatureBytes.slice(32, 64))
      const v = (recovery + 27).toString(16).padStart(2, '0')
      const signature = '0x' + r + s + v

      // 3) Register device with session cookie
      const registerReq = new Request('https://example.com/auth/device/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=sess-123',
        },
        body: JSON.stringify({
          platform: 'web3',
          publicKey: '0x' + bytesToHex(publicKey),
          keyAlgorithm: 'secp256k1',
          walletAddress,
          challenge: challengeBody.challenge,
          signature,
        }),
      })

      const registerResp = await handleDeviceAuthRequest(registerReq, config)
      expect(registerResp?.status).toBe(201)
      const body = await registerResp!.json()
      expect(body.deviceId).toMatch(/^dev_web3_/)
      expect(body.userId).toBe('user-123')
      expect(body.platform).toBe('web3')
      expect(body.status).toBe('active')
      expect(body.registeredAt).toBeTypeOf('string')
    })

    it('should reject device registration without a session cookie', async () => {
      const req = new Request('https://example.com/auth/device/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'web3',
          publicKey: '0x' + '11'.repeat(65),
          keyAlgorithm: 'secp256k1',
          walletAddress: '0x' + '22'.repeat(20),
          challenge: 'a'.repeat(64) + '|1705326960000',
          signature: '0x' + '00'.repeat(65),
        }),
      })

      const resp = await handleDeviceAuthRequest(req, config)
      expect(resp?.status).toBe(401)
    })

    it('should require attestation for iOS platform', async () => {
      const req = new Request('https://example.com/auth/device/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=sess-123',
        },
        body: JSON.stringify({
          platform: 'ios',
          keyAlgorithm: 'P-256',
          challenge: 'a'.repeat(64) + '|1705326960000',
          signature: 'mock-signature',
          // Missing attestation and keyId
        }),
      })

      const resp = await handleDeviceAuthRequest(req, config)
      expect(resp?.status).toBe(400)

      const body = await resp?.json()
      expect(body.error).toBe('invalid_request')
      expect(body.message).toContain('attestation')
    })

    it('should require keyId for iOS platform', async () => {
      const req = new Request('https://example.com/auth/device/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=sess-123',
        },
        body: JSON.stringify({
          platform: 'ios',
          keyAlgorithm: 'P-256',
          challenge: 'a'.repeat(64) + '|1705326960000',
          signature: 'mock-signature',
          attestation: Buffer.from('mock').toString('base64'),
          // Missing keyId
        }),
      })

      const resp = await handleDeviceAuthRequest(req, config)
      expect(resp?.status).toBe(400)

      const body = await resp?.json()
      expect(body.error).toBe('invalid_request')
      expect(body.message).toContain('keyId')
    })

    it('should reject iOS registration with invalid attestation', async () => {
      // Generate a valid challenge first
      const challengeReq = new Request('https://example.com/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const challengeResp = await handleChallengeRequest(challengeReq, config)
      const challengeBody: ChallengeResponse = await challengeResp.json()

      const req = new Request('https://example.com/auth/device/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=sess-123',
        },
        body: JSON.stringify({
          platform: 'ios',
          keyAlgorithm: 'P-256',
          challenge: challengeBody.challenge,
          signature: 'mock-signature',
          attestation: Buffer.from('invalid-attestation').toString('base64'),
          keyId: 'mock-key-id',
        }),
      })

      const resp = await handleDeviceAuthRequest(req, config)
      expect(resp?.status).toBe(400)

      const body = await resp?.json()
      expect(body.error).toBe('invalid_attestation')
    })
  })
})

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
