import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ClearAuthConfig } from '../../types'
import type { ChallengeResponse } from '../types'
import { Kysely } from 'kysely'
import type { Database } from '../../database/schema'
import { p256 } from '@noble/curves/nist.js'
import { randomBytes } from '@noble/hashes/utils.js'

vi.mock('../android-verifier.js', async () => {
  const actual = await vi.importActual<typeof import('../android-verifier.js')>(
    '../android-verifier.js'
  )

  return {
    ...actual,
    verifyIntegrityToken: vi.fn(),
  }
})

import { handleChallengeRequest, handleDeviceAuthRequest } from '../handlers'
import { verifyIntegrityToken } from '../android-verifier.js'

function createMockDb(): Kysely<Database> {
  const challenges = new Map<
    string,
    { nonce: string; challenge: string; created_at: Date; expires_at: Date }
  >()
  const sessions = new Map<string, any>()
  const users = new Map<string, any>()

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
            return { numInsertedOrUpdatedRows: 1n }
          }
          return { numInsertedOrUpdatedRows: 1n }
        },
      }),
    }),
    selectFrom: (table: string) => ({
      selectAll: () => ({
        where: (_col: string, _op: string, value: any) => ({
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
            return null
          },
        }),
      }),
      select: (_cols: any) => ({
        where: (_col: string, _op: string, value: any) => ({
          executeTakeFirst: async () => {
            if (table === 'sessions') {
              return sessions.get(value) || null
            }
            if (table === 'users') {
              return users.get(value) || null
            }
            return null
          },
        }),
      }),
    }),
    deleteFrom: (table: string) => ({
      where: (_col: string, _op: string, value: any) => ({
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
  }

  return mockDb as any
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

describe('Android device registration handler', () => {
  let config: ClearAuthConfig

  beforeEach(() => {
    config = {
      database: createMockDb(),
      secret: 'test-secret',
      baseUrl: 'https://example.com',
      isProduction: false,
      android: { packageName: 'com.example.app' },
    }

    vi.mocked(verifyIntegrityToken).mockReset()
  })

  it('returns 500 if android.packageName is not configured', async () => {
    const challengeReq = new Request('https://example.com/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const challengeResp = await handleChallengeRequest(challengeReq, config)
    const challengeBody: ChallengeResponse = await challengeResp.json()

    const misconfigured: ClearAuthConfig = { ...config, android: undefined }

    const req = new Request('https://example.com/auth/device/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session=sess-123',
      },
      body: JSON.stringify({
        platform: 'android',
        keyAlgorithm: 'P-256',
        publicKey: '04' + '11'.repeat(64),
        challenge: challengeBody.challenge,
        signature: '00'.repeat(64),
        integrityToken: 'mock-token',
      }),
    })

    const resp = await handleDeviceAuthRequest(req, misconfigured)
    expect(resp?.status).toBe(500)
  })

  it('passes expectedPackageName to verifyIntegrityToken()', async () => {
    const challengeReq = new Request('https://example.com/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const challengeResp = await handleChallengeRequest(challengeReq, config)
    const challengeBody: ChallengeResponse = await challengeResp.json()

    vi.mocked(verifyIntegrityToken).mockResolvedValue({
      valid: true,
      payload: {
        requestDetails: {
          requestPackageName: config.android!.packageName,
          timestampMillis: Date.now().toString(),
          nonce: challengeBody.challenge,
        },
        appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED' },
        deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
      } as any,
    })

    const privateKey = randomBytes(32)
    const publicKeyBytes = p256.getPublicKey(privateKey, false)
    const publicKeyHex = bytesToHex(publicKeyBytes)

    const challengeHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(challengeBody.challenge)
    )
    const signature = p256.sign(new Uint8Array(challengeHash), privateKey)
    const signatureHex = bytesToHex(signature)

    const req = new Request('https://example.com/auth/device/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session=sess-123',
      },
      body: JSON.stringify({
        platform: 'android',
        keyAlgorithm: 'P-256',
        publicKey: publicKeyHex,
        challenge: challengeBody.challenge,
        signature: signatureHex,
        integrityToken: 'mock-token',
      }),
    })

    const resp = await handleDeviceAuthRequest(req, config)
    expect(resp?.status).toBe(201)

    expect(verifyIntegrityToken).toHaveBeenCalledTimes(1)
    const [_token, options] = vi.mocked(verifyIntegrityToken).mock.calls[0]
    expect(options.expectedPackageName).toBe(config.android!.packageName)
    expect(options.expectedNonce).toBe(challengeBody.challenge)
  })
})
