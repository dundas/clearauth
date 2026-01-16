/**
 * Android Play Integrity Verification Tests
 *
 * Tests for Android Play Integrity token parsing, verification,
 * and device verdict validation.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  parseIntegrityToken,
  verifyIntegrityToken,
  validateDeviceVerdict,
  AndroidIntegrityError,
} from '../android-verifier.js'
import { SignJWT, importJWK, type JWK } from 'jose'

// Test key pair for signing mock tokens
let testPrivateKey: any
let testPublicKey: JWK

beforeAll(async () => {
  // Generate test ES256 key pair
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )

  testPrivateKey = privateKey

  const exportedPublicKey = await crypto.subtle.exportKey('jwk', publicKey)
  testPublicKey = {
    ...exportedPublicKey,
    kid: 'test-key-id',
    alg: 'ES256',
    use: 'sig',
  }
})

async function createMockIntegrityToken(payload: any): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key-id' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(testPrivateKey)
}

describe('parseIntegrityToken', () => {
  it('should parse a valid JWT token', async () => {
    const payload = {
      requestDetails: {
        requestPackageName: 'com.example.app',
        timestampMillis: Date.now().toString(),
        nonce: 'test-nonce',
      },
      appIntegrity: {
        appRecognitionVerdict: 'PLAY_RECOGNIZED',
      },
      deviceIntegrity: {
        deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
      },
      accountDetails: {
        appLicensingVerdict: 'LICENSED',
      },
    }

    const token = await createMockIntegrityToken(payload)
    const parsed = await parseIntegrityToken(token)

    expect(parsed).toBeDefined()
    expect(parsed.requestDetails).toBeDefined()
    expect(parsed.appIntegrity).toBeDefined()
    expect(parsed.deviceIntegrity).toBeDefined()
  })

  it('should throw error for invalid JWT format', async () => {
    await expect(parseIntegrityToken('not.a.valid.jwt')).rejects.toThrow(AndroidIntegrityError)
  })

  it('should throw error for empty token', async () => {
    await expect(parseIntegrityToken('')).rejects.toThrow(AndroidIntegrityError)
  })

  it('should throw error for missing required claims', async () => {
    const payload = {
      requestDetails: {
        requestPackageName: 'com.example.app',
      },
      // Missing deviceIntegrity
    }

    const token = await createMockIntegrityToken(payload)
    await expect(parseIntegrityToken(token)).rejects.toThrow(AndroidIntegrityError)
  })
})

describe('validateDeviceVerdict', () => {
  it('should accept MEETS_DEVICE_INTEGRITY verdict', () => {
    const verdict = ['MEETS_DEVICE_INTEGRITY']
    expect(() => validateDeviceVerdict(verdict)).not.toThrow()
  })

  it('should accept MEETS_STRONG_INTEGRITY verdict', () => {
    const verdict = ['MEETS_STRONG_INTEGRITY']
    expect(() => validateDeviceVerdict(verdict)).not.toThrow()
  })

  it('should accept combined verdicts', () => {
    const verdict = ['MEETS_DEVICE_INTEGRITY', 'MEETS_STRONG_INTEGRITY']
    expect(() => validateDeviceVerdict(verdict)).not.toThrow()
  })

  it('should reject MEETS_BASIC_INTEGRITY only', () => {
    const verdict = ['MEETS_BASIC_INTEGRITY']
    expect(() => validateDeviceVerdict(verdict)).toThrow(AndroidIntegrityError)
    expect(() => validateDeviceVerdict(verdict)).toThrow(/does not meet integrity requirements/)
  })

  it('should reject empty verdict', () => {
    const verdict: string[] = []
    expect(() => validateDeviceVerdict(verdict)).toThrow(AndroidIntegrityError)
  })

  it('should reject unknown verdict values', () => {
    const verdict = ['UNKNOWN_VERDICT']
    expect(() => validateDeviceVerdict(verdict)).toThrow(AndroidIntegrityError)
  })

  it('should reject unknown verdict values even when allowBasicIntegrity is true', () => {
    const verdict = ['UNKNOWN_VERDICT']
    expect(() => validateDeviceVerdict(verdict, { allowBasicIntegrity: true })).toThrow(
      AndroidIntegrityError
    )
  })
})

describe('verifyIntegrityToken', () => {
  it('should verify a valid token with Google public key', async () => {
    const payload = {
      requestDetails: {
        requestPackageName: 'com.example.app',
        timestampMillis: Date.now().toString(),
        nonce: 'test-challenge|1705326960000',
      },
      appIntegrity: {
        appRecognitionVerdict: 'PLAY_RECOGNIZED',
      },
      deviceIntegrity: {
        deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
      },
      accountDetails: {
        appLicensingVerdict: 'LICENSED',
      },
    }

    const token = await createMockIntegrityToken(payload)

    // Mock Google public keys
    const mockGoogleKeys = {
      keys: [testPublicKey],
    }

    const result = await verifyIntegrityToken(token, {
      googlePublicKeys: mockGoogleKeys,
    })

    expect(result.valid).toBe(true)
    expect(result.payload).toBeDefined()
    expect(result.payload?.requestDetails.nonce).toBe('test-challenge|1705326960000')
  })

  it('should return error for token with invalid signature', async () => {
    // Create a token with different key
    const { privateKey } = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )

    const payload = {
      requestDetails: {
        requestPackageName: 'com.example.app',
        timestampMillis: Date.now().toString(),
        nonce: 'test-nonce',
      },
      appIntegrity: {
        appRecognitionVerdict: 'PLAY_RECOGNIZED',
      },
      deviceIntegrity: {
        deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
      },
    }

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256', kid: 'wrong-key' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey)

    const mockGoogleKeys = {
      keys: [testPublicKey],
    }

    const result = await verifyIntegrityToken(token, {
      googlePublicKeys: mockGoogleKeys,
    })

    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should reject token with insufficient device integrity', async () => {
    const payload = {
      requestDetails: {
        requestPackageName: 'com.example.app',
        timestampMillis: Date.now().toString(),
        nonce: 'test-nonce',
      },
      appIntegrity: {
        appRecognitionVerdict: 'PLAY_RECOGNIZED',
      },
      deviceIntegrity: {
        deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY'], // Not enough
      },
    }

    const token = await createMockIntegrityToken(payload)

    const mockGoogleKeys = {
      keys: [testPublicKey],
    }

    const result = await verifyIntegrityToken(token, {
      googlePublicKeys: mockGoogleKeys,
    })

    expect(result.valid).toBe(false)
    expect(result.error).toContain('integrity')
  })
})

describe('AndroidIntegrityError', () => {
  it('should create error with correct name', () => {
    const error = new AndroidIntegrityError('test error')

    expect(error.name).toBe('AndroidIntegrityError')
    expect(error.message).toBe('test error')
    expect(error).toBeInstanceOf(Error)
  })
})
