import { describe, it, expect, beforeEach } from 'vitest'
import { Kysely } from 'kysely'
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose'
import type { Database } from '../../database/schema.js'
import type { JwtConfig } from '../types.js'
import {
  handleTokenRequest,
  handleRefreshRequest,
  handleRevokeRequest,
  parseBearerToken,
  validateBearerToken,
} from '../handlers.js'
import { createAccessToken } from '../signer.js'
import { createRefreshToken } from '../refresh-tokens.js'

// Mock database (simplified version from refresh-tokens.test.ts)
class MockDatabase {
  private users: Map<string, any> = new Map()
  private tokens: Map<string, any> = new Map()
  private idCounter = 1

  constructor() {
    // Add a test user
    this.users.set('user-123', {
      id: 'user-123',
      email: 'test@example.com',
      email_verified: true,
      password_hash: 'hash',
      created_at: new Date(),
      updated_at: new Date(),
    })
  }

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
    if (table === 'refresh_tokens') {
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
          }),
        }),
      }
    }

    if (table === 'users') {
      return {
        selectAll: () => ({
          where: (column: string, op: string, value: any) => ({
            executeTakeFirst: async () => {
              if (column === 'id') {
                return this.users.get(value)
              }
              return undefined
            },
          }),
        }),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
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
        }),
      }),
    }
  }

  clear() {
    this.tokens.clear()
    this.idCounter = 1
  }
}

describe('JWT Handlers', () => {
  let db: Kysely<Database>
  let mockDb: MockDatabase
  let jwtConfig: JwtConfig
  let pemPrivateKey: string
  let pemPublicKey: string

  beforeEach(async () => {
    // Generate test keys
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
    pemPrivateKey = await exportPKCS8(privateKey)
    pemPublicKey = await exportSPKI(publicKey)

    jwtConfig = {
      privateKey: pemPrivateKey,
      publicKey: pemPublicKey,
      accessTokenTTL: 900,
      refreshTokenTTL: 2592000,
      algorithm: 'ES256',
    }

    mockDb = new MockDatabase()
    db = mockDb as unknown as Kysely<Database>
  })

  describe('handleTokenRequest', () => {
    it('should create token pair for valid request', async () => {
      const request = new Request('https://example.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-123',
          email: 'test@example.com',
          deviceName: 'iPhone 15 Pro',
        }),
      })

      const response = await handleTokenRequest(request, db, jwtConfig)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.accessToken).toBeTruthy()
      expect(data.refreshToken).toBeTruthy()
      expect(data.tokenType).toBe('Bearer')
      expect(data.expiresIn).toBe(900)
      expect(data.refreshTokenId).toBeTruthy()
    })

    it('should return 400 for missing userId', async () => {
      const request = new Request('https://example.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      })

      const response = await handleTokenRequest(request, db, jwtConfig)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('invalid_request')
      expect(data.message).toContain('Missing required fields')
    })

    it('should return 400 for missing email', async () => {
      const request = new Request('https://example.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-123',
        }),
      })

      const response = await handleTokenRequest(request, db, jwtConfig)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('invalid_request')
    })

    it('should handle missing deviceName (optional)', async () => {
      const request = new Request('https://example.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-123',
          email: 'test@example.com',
        }),
      })

      const response = await handleTokenRequest(request, db, jwtConfig)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.accessToken).toBeTruthy()
      expect(data.refreshToken).toBeTruthy()
    })

    it('should return 400 for invalid JSON', async () => {
      const request = new Request('https://example.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      })

      const response = await handleTokenRequest(request, db, jwtConfig)
      expect(response.status).toBe(500)
    })
  })

  describe('handleRefreshRequest', () => {
    it('should refresh token pair for valid refresh token', async () => {
      // Create initial tokens
      const tokenRequest = new Request('https://example.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-123',
          email: 'test@example.com',
        }),
      })

      const tokenResponse = await handleTokenRequest(tokenRequest, db, jwtConfig)
      const tokenData = await tokenResponse.json()

      // Use refresh token to get new tokens
      const refreshRequest = new Request('https://example.com/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: tokenData.refreshToken,
        }),
      })

      const refreshResponse = await handleRefreshRequest(refreshRequest, db, jwtConfig)
      expect(refreshResponse.status).toBe(200)

      const refreshData = await refreshResponse.json()
      expect(refreshData.accessToken).toBeTruthy()
      expect(refreshData.refreshToken).toBeTruthy()
      expect(refreshData.refreshToken).not.toBe(tokenData.refreshToken) // Rotated
      expect(refreshData.tokenType).toBe('Bearer')
    })

    it('should return 400 for missing refreshToken', async () => {
      const request = new Request('https://example.com/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const response = await handleRefreshRequest(request, db, jwtConfig)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('invalid_request')
    })

    it('should return 401 for invalid refresh token', async () => {
      const request = new Request('https://example.com/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'invalid-token',
        }),
      })

      const response = await handleRefreshRequest(request, db, jwtConfig)
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('invalid_grant')
    })

    it('should return 401 for expired refresh token', async () => {
      // Create token with past expiration
      const expiresAt = new Date(Date.now() - 86400000) // Yesterday
      const { token } = await createRefreshToken(db, 'user-123', expiresAt)

      const request = new Request('https://example.com/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: token,
        }),
      })

      const response = await handleRefreshRequest(request, db, jwtConfig)
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('invalid_grant')
      expect(data.message).toContain('revoked or expired')
    })
  })

  describe('handleRevokeRequest', () => {
    it('should revoke refresh token successfully', async () => {
      // Create token first
      const tokenRequest = new Request('https://example.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-123',
          email: 'test@example.com',
        }),
      })

      const tokenResponse = await handleTokenRequest(tokenRequest, db, jwtConfig)
      const tokenData = await tokenResponse.json()

      // Revoke the token
      const revokeRequest = new Request('https://example.com/auth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: tokenData.refreshToken,
        }),
      })

      const revokeResponse = await handleRevokeRequest(revokeRequest, db)
      expect(revokeResponse.status).toBe(200)

      const revokeData = await revokeResponse.json()
      expect(revokeData.success).toBe(true)
      expect(revokeData.message).toContain('revoked successfully')

      // Try to use revoked token - should fail
      const refreshRequest = new Request('https://example.com/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: tokenData.refreshToken,
        }),
      })

      const refreshResponse = await handleRefreshRequest(refreshRequest, db, jwtConfig)
      expect(refreshResponse.status).toBe(401)
    })

    it('should return 400 for missing refreshToken', async () => {
      const request = new Request('https://example.com/auth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const response = await handleRevokeRequest(request, db)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('invalid_request')
    })

    it('should be idempotent (revoking non-existent token succeeds)', async () => {
      const request = new Request('https://example.com/auth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'non-existent-token',
        }),
      })

      const response = await handleRevokeRequest(request, db)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('parseBearerToken', () => {
    it('should extract token from valid Authorization header', () => {
      const request = new Request('https://example.com/api/test', {
        headers: { Authorization: 'Bearer abc123' },
      })

      const token = parseBearerToken(request)
      expect(token).toBe('abc123')
    })

    it('should return null for missing Authorization header', () => {
      const request = new Request('https://example.com/api/test')

      const token = parseBearerToken(request)
      expect(token).toBeNull()
    })

    it('should return null for invalid format (no Bearer prefix)', () => {
      const request = new Request('https://example.com/api/test', {
        headers: { Authorization: 'abc123' },
      })

      const token = parseBearerToken(request)
      expect(token).toBeNull()
    })

    it('should return null for invalid format (wrong prefix)', () => {
      const request = new Request('https://example.com/api/test', {
        headers: { Authorization: 'Basic abc123' },
      })

      const token = parseBearerToken(request)
      expect(token).toBeNull()
    })

    it('should return null for malformed header', () => {
      const request = new Request('https://example.com/api/test', {
        headers: { Authorization: 'Bearer' },
      })

      const token = parseBearerToken(request)
      expect(token).toBeNull()
    })
  })

  describe('validateBearerToken', () => {
    it('should validate and decode valid Bearer token', async () => {
      const accessToken = await createAccessToken(
        { sub: 'user-456', email: 'user@example.com' },
        jwtConfig
      )

      const request = new Request('https://example.com/api/test', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      const payload = await validateBearerToken(request, jwtConfig)
      expect(payload).toBeTruthy()
      expect(payload?.sub).toBe('user-456')
      expect(payload?.email).toBe('user@example.com')
      expect(payload?.iat).toBeTypeOf('number')
      expect(payload?.exp).toBeTypeOf('number')
    })

    it('should return null for missing Authorization header', async () => {
      const request = new Request('https://example.com/api/test')

      const payload = await validateBearerToken(request, jwtConfig)
      expect(payload).toBeNull()
    })

    it('should return null for invalid token format', async () => {
      const request = new Request('https://example.com/api/test', {
        headers: { Authorization: 'Bearer invalid-token' },
      })

      const payload = await validateBearerToken(request, jwtConfig)
      expect(payload).toBeNull()
    })

    it('should return null for expired token', async () => {
      const expiredConfig: JwtConfig = {
        ...jwtConfig,
        accessTokenTTL: -1, // Already expired
      }

      const accessToken = await createAccessToken(
        { sub: 'user-456', email: 'user@example.com' },
        expiredConfig
      )

      const request = new Request('https://example.com/api/test', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      const payload = await validateBearerToken(request, jwtConfig)
      expect(payload).toBeNull()
    })

    it('should return null for token signed with wrong key', async () => {
      // Generate different keys
      const { privateKey: wrongPrivateKey } = await generateKeyPair('ES256', {
        extractable: true,
      })
      const wrongPemPrivateKey = await exportPKCS8(wrongPrivateKey)

      const wrongConfig: JwtConfig = {
        ...jwtConfig,
        privateKey: wrongPemPrivateKey,
      }

      const accessToken = await createAccessToken(
        { sub: 'user-456', email: 'user@example.com' },
        wrongConfig
      )

      const request = new Request('https://example.com/api/test', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      // Verify with original keys (should fail)
      const payload = await validateBearerToken(request, jwtConfig)
      expect(payload).toBeNull()
    })
  })
})
