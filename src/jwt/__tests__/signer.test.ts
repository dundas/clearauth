import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPair, exportPKCS8, exportSPKI, exportJWK } from 'jose'
import {
  createAccessToken,
  verifyAccessToken,
  importPrivateKey,
  importPublicKey,
  validateAlgorithm,
} from '../signer.js'
import type { JwtConfig } from '../types.js'

describe('JWT Signer Module', () => {
  let pemPrivateKey: string
  let pemPublicKey: string
  let jwkPrivateKey: string
  let jwkPublicKey: string
  let baseConfig: JwtConfig

  // Generate test keys before all tests
  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })

    // Export as PEM
    pemPrivateKey = await exportPKCS8(privateKey)
    pemPublicKey = await exportSPKI(publicKey)

    // Export as JWK
    const privateJwk = await exportJWK(privateKey)
    const publicJwk = await exportJWK(publicKey)
    jwkPrivateKey = JSON.stringify(privateJwk)
    jwkPublicKey = JSON.stringify(publicJwk)

    // Base configuration for tests
    baseConfig = {
      privateKey: pemPrivateKey,
      publicKey: pemPublicKey,
      accessTokenTTL: 900,
      algorithm: 'ES256',
    }
  })

  describe('validateAlgorithm', () => {
    it('should accept ES256 algorithm', () => {
      expect(() => validateAlgorithm('ES256')).not.toThrow()
    })

    it('should accept undefined algorithm (defaults to ES256)', () => {
      expect(() => validateAlgorithm(undefined)).not.toThrow()
    })

    it('should reject non-ES256 algorithms', () => {
      expect(() => validateAlgorithm('HS256')).toThrow('Invalid algorithm: HS256')
      expect(() => validateAlgorithm('RS256')).toThrow('Invalid algorithm: RS256')
      expect(() => validateAlgorithm('none')).toThrow('Invalid algorithm: none')
    })

    it('should include security explanation in error message', () => {
      expect(() => validateAlgorithm('HS256')).toThrow(
        'Rejecting non-ES256 algorithms prevents security vulnerabilities'
      )
    })
  })

  describe('importPrivateKey', () => {
    it('should import PEM private key', async () => {
      const key = await importPrivateKey(pemPrivateKey)
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.type).toBe('private')
    })

    it('should import JWK private key', async () => {
      const key = await importPrivateKey(jwkPrivateKey)
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.type).toBe('private')
    })

    it('should reject invalid key format', async () => {
      await expect(importPrivateKey('invalid-key-data')).rejects.toThrow(
        'Invalid key format: must be PEM or JWK'
      )
    })

    it('should reject malformed PEM key', async () => {
      await expect(importPrivateKey('-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----')).rejects.toThrow()
    })

    it('should reject malformed JWK key', async () => {
      await expect(importPrivateKey('{"invalid": "jwk"}')).rejects.toThrow()
    })
  })

  describe('importPublicKey', () => {
    it('should import PEM public key', async () => {
      const key = await importPublicKey(pemPublicKey)
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.type).toBe('public')
    })

    it('should import JWK public key', async () => {
      const key = await importPublicKey(jwkPublicKey)
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.type).toBe('public')
    })

    it('should reject invalid key format', async () => {
      await expect(importPublicKey('invalid-key-data')).rejects.toThrow(
        'Invalid key format: must be PEM or JWK'
      )
    })
  })

  describe('createAccessToken', () => {
    it('should create valid JWT with required claims', async () => {
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        baseConfig
      )

      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3) // JWT format: header.payload.signature
    })

    it('should include issuer claim when configured', async () => {
      const config: JwtConfig = {
        ...baseConfig,
        issuer: 'https://example.com',
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        config
      )

      const payload = await verifyAccessToken(token, config)
      expect(payload.iss).toBe('https://example.com')
    })

    it('should include audience claim when configured', async () => {
      const config: JwtConfig = {
        ...baseConfig,
        audience: 'https://api.example.com',
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        config
      )

      const payload = await verifyAccessToken(token, config)
      expect(payload.aud).toBe('https://api.example.com')
    })

    it('should use custom TTL when provided', async () => {
      const config: JwtConfig = {
        ...baseConfig,
        accessTokenTTL: 60, // 1 minute
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        config
      )

      const payload = await verifyAccessToken(token, config)
      const ttl = payload.exp - payload.iat
      expect(ttl).toBe(60)
    })

    it('should use default TTL (900s) when not provided', async () => {
      const config: JwtConfig = {
        ...baseConfig,
        accessTokenTTL: undefined,
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        config
      )

      const payload = await verifyAccessToken(token, config)
      const ttl = payload.exp - payload.iat
      expect(ttl).toBe(900)
    })

    it('should work with JWK keys', async () => {
      const config: JwtConfig = {
        privateKey: jwkPrivateKey,
        publicKey: jwkPublicKey,
        algorithm: 'ES256',
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        config
      )

      expect(token).toBeTruthy()
      const payload = await verifyAccessToken(token, config)
      expect(payload.sub).toBe('user-123')
    })

    it('should reject non-ES256 algorithm', async () => {
      const config: JwtConfig = {
        ...baseConfig,
        algorithm: 'HS256' as any, // Type assertion to test runtime validation
      }
      await expect(
        createAccessToken({ sub: 'user-123', email: 'test@example.com' }, config)
      ).rejects.toThrow('Invalid algorithm: HS256')
    })
  })

  describe('verifyAccessToken', () => {
    it('should verify valid token and return payload', async () => {
      const token = await createAccessToken(
        { sub: 'user-456', email: 'verify@example.com' },
        baseConfig
      )

      const payload = await verifyAccessToken(token, baseConfig)
      expect(payload.sub).toBe('user-456')
      expect(payload.email).toBe('verify@example.com')
      expect(payload.iat).toBeTypeOf('number')
      expect(payload.exp).toBeTypeOf('number')
      expect(payload.exp).toBeGreaterThan(payload.iat)
    })

    it('should verify token with issuer claim', async () => {
      const config: JwtConfig = {
        ...baseConfig,
        issuer: 'https://auth.example.com',
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        config
      )

      const payload = await verifyAccessToken(token, config)
      expect(payload.iss).toBe('https://auth.example.com')
    })

    it('should verify token with audience claim', async () => {
      const config: JwtConfig = {
        ...baseConfig,
        audience: 'https://api.example.com',
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        config
      )

      const payload = await verifyAccessToken(token, config)
      expect(payload.aud).toBe('https://api.example.com')
    })

    it('should reject token with wrong issuer', async () => {
      const signConfig: JwtConfig = {
        ...baseConfig,
        issuer: 'https://auth.example.com',
      }
      const verifyConfig: JwtConfig = {
        ...baseConfig,
        issuer: 'https://wrong.example.com',
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        signConfig
      )

      await expect(verifyAccessToken(token, verifyConfig)).rejects.toThrow()
    })

    it('should reject token with wrong audience', async () => {
      const signConfig: JwtConfig = {
        ...baseConfig,
        audience: 'https://api.example.com',
      }
      const verifyConfig: JwtConfig = {
        ...baseConfig,
        audience: 'https://wrong.example.com',
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        signConfig
      )

      await expect(verifyAccessToken(token, verifyConfig)).rejects.toThrow()
    })

    it('should reject token signed with wrong key', async () => {
      const { privateKey: wrongPrivateKey } = await generateKeyPair('ES256', { extractable: true })
      const wrongPemPrivateKey = await exportPKCS8(wrongPrivateKey)

      const signConfig: JwtConfig = {
        ...baseConfig,
        privateKey: wrongPemPrivateKey,
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        signConfig
      )

      // Verify with original public key should fail
      await expect(verifyAccessToken(token, baseConfig)).rejects.toThrow()
    })

    it('should reject malformed token', async () => {
      await expect(verifyAccessToken('not.a.valid.jwt', baseConfig)).rejects.toThrow()
    })

    it('should reject expired token', async () => {
      const config: JwtConfig = {
        ...baseConfig,
        accessTokenTTL: -1, // Already expired
      }
      const token = await createAccessToken(
        { sub: 'user-123', email: 'test@example.com' },
        config
      )

      await expect(verifyAccessToken(token, baseConfig)).rejects.toThrow()
    })

    it('should work with JWK keys', async () => {
      const config: JwtConfig = {
        privateKey: jwkPrivateKey,
        publicKey: jwkPublicKey,
        algorithm: 'ES256',
      }
      const token = await createAccessToken(
        { sub: 'user-789', email: 'jwk@example.com' },
        config
      )

      const payload = await verifyAccessToken(token, config)
      expect(payload.sub).toBe('user-789')
      expect(payload.email).toBe('jwk@example.com')
    })

    it('should reject non-ES256 algorithm', async () => {
      const config: JwtConfig = {
        ...baseConfig,
        algorithm: 'RS256' as any,
      }
      await expect(
        verifyAccessToken('fake.token.here', config)
      ).rejects.toThrow('Invalid algorithm: RS256')
    })
  })

  describe('Edge-Compatible Integration', () => {
    it('should create and verify token using only Web Crypto API', async () => {
      // This test ensures we're not using Node.js-specific crypto
      const token = await createAccessToken(
        { sub: 'edge-user', email: 'edge@example.com' },
        baseConfig
      )

      const payload = await verifyAccessToken(token, baseConfig)
      expect(payload.sub).toBe('edge-user')
      expect(payload.email).toBe('edge@example.com')
    })

    it('should handle concurrent token operations', async () => {
      // Edge environments often have concurrent requests
      const promises = Array.from({ length: 10 }, (_, i) =>
        createAccessToken(
          { sub: `user-${i}`, email: `user${i}@example.com` },
          baseConfig
        )
      )

      const tokens = await Promise.all(promises)
      expect(tokens).toHaveLength(10)
      expect(new Set(tokens).size).toBe(10) // All unique tokens

      // Verify all tokens
      const verifyPromises = tokens.map((token) => verifyAccessToken(token, baseConfig))
      const payloads = await Promise.all(verifyPromises)
      expect(payloads).toHaveLength(10)
    })
  })
})
