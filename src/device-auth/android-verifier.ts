/**
 * Android Play Integrity Verification
 *
 * Implements Google Play Integrity API token verification for Android device authentication.
 * Verifies integrity tokens, validates device verdicts, and ensures app authenticity.
 *
 * Google Play Integrity Documentation:
 * https://developer.android.com/google/play/integrity
 *
 * @module device-auth/android-verifier
 */

import { jwtVerify, createRemoteJWKSet, type JWTPayload, type JWK } from 'jose'

/**
 * Custom error for Android integrity verification failures
 */
export class AndroidIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AndroidIntegrityError'
  }
}

/**
 * Google Play Integrity Token Payload
 *
 * Structure of the decoded JWT token from Play Integrity API
 */
export interface IntegrityTokenPayload extends JWTPayload {
  /** Request details including package name, timestamp, and nonce */
  requestDetails: {
    /** Package name of the app making the request */
    requestPackageName: string
    /** Timestamp of the request in milliseconds */
    timestampMillis: string
    /** Nonce provided during token generation (our challenge) */
    nonce: string
  }

  /** App integrity verdict */
  appIntegrity: {
    /** App recognition verdict from Play Store */
    appRecognitionVerdict: 'PLAY_RECOGNIZED' | 'UNRECOGNIZED_VERSION' | 'UNEVALUATED'
    /** Package name if recognized */
    packageName?: string
    /** Certificate SHA-256 digest fingerprints */
    certificateSha256Digest?: string[]
    /** Version code */
    versionCode?: string
  }

  /** Device integrity verdict */
  deviceIntegrity: {
    /** Array of device integrity verdicts */
    deviceRecognitionVerdict: string[]
  }

  /** Account details */
  accountDetails?: {
    /** App licensing verdict */
    appLicensingVerdict?: 'LICENSED' | 'UNLICENSED' | 'UNEVALUATED'
  }
}

/**
 * Device integrity verdict levels
 *
 * - MEETS_DEVICE_INTEGRITY: Device meets Android compatibility requirements
 * - MEETS_STRONG_INTEGRITY: Device has strong integrity (e.g., passes SafetyNet)
 * - MEETS_BASIC_INTEGRITY: Device meets basic integrity but may be rooted
 */
type DeviceIntegrityVerdict = 'MEETS_DEVICE_INTEGRITY' | 'MEETS_STRONG_INTEGRITY' | 'MEETS_BASIC_INTEGRITY'

/**
 * Google public keys (JWKS) endpoint
 *
 * Used for verifying Google-signed JWTs. Can be overridden via `verifyIntegrityToken({ jwksUrl })`
 * if your environment requires a different source of keys.
 */
const GOOGLE_PLAY_INTEGRITY_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs?format=jwk'

function decodeBase64UrlJson<T>(value: string): T {
  // Prefer Web-standard `atob` for edge compatibility; fall back to Buffer in Node.
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (normalized.length % 4)) % 4
  const padded = normalized + '='.repeat(padLen)

  const json =
    typeof atob === 'function'
      ? new TextDecoder().decode(
          Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
        )
      : Buffer.from(padded, 'base64').toString('utf-8')

  return JSON.parse(json) as T
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

function constantTimeEqualString(a: string, b: string): boolean {
  return bytesEqual(new TextEncoder().encode(a), new TextEncoder().encode(b))
}

/**
 * Parse Play Integrity token (JWT) and extract payload
 *
 * This function decodes the JWT token without verifying the signature.
 * Use `verifyIntegrityToken()` for full verification.
 *
 * @param token - JWT token from Play Integrity API
 * @returns Decoded token payload
 * @throws {AndroidIntegrityError} If token is invalid or missing required claims
 */
export async function parseIntegrityToken(token: string): Promise<IntegrityTokenPayload> {
  try {
    if (!token || token.trim() === '') {
      throw new AndroidIntegrityError('Integrity token cannot be empty')
    }

    // Decode JWT without verification (just parse)
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new AndroidIntegrityError('Invalid JWT format: expected 3 parts')
    }

    const payload = decodeBase64UrlJson<IntegrityTokenPayload>(parts[1])

    // Validate required claims
    if (!payload.requestDetails) {
      throw new AndroidIntegrityError('Missing requestDetails claim')
    }

    if (!payload.deviceIntegrity) {
      throw new AndroidIntegrityError('Missing deviceIntegrity claim')
    }

    if (!payload.appIntegrity) {
      throw new AndroidIntegrityError('Missing appIntegrity claim')
    }

    return payload
  } catch (error) {
    if (error instanceof AndroidIntegrityError) {
      throw error
    }
    throw new AndroidIntegrityError(
      `Failed to parse integrity token: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Validate device integrity verdict
 *
 * Checks that the device meets minimum integrity requirements.
 * By default, requires MEETS_DEVICE_INTEGRITY or MEETS_STRONG_INTEGRITY.
 *
 * @param verdict - Array of device integrity verdicts
 * @param options - Validation options
 * @throws {AndroidIntegrityError} If device does not meet integrity requirements
 */
export function validateDeviceVerdict(
  verdict: string[],
  options?: {
    /** Require MEETS_STRONG_INTEGRITY (default: false) */
    requireStrongIntegrity?: boolean
    /** Allow MEETS_BASIC_INTEGRITY (default: false) */
    allowBasicIntegrity?: boolean
  }
): void {
  if (!verdict || verdict.length === 0) {
    throw new AndroidIntegrityError('Device integrity verdict is empty')
  }

  const requireStrong = options?.requireStrongIntegrity ?? false
  const allowBasic = options?.allowBasicIntegrity ?? false

  const hasStrongIntegrity = verdict.includes('MEETS_STRONG_INTEGRITY')
  const hasDeviceIntegrity = verdict.includes('MEETS_DEVICE_INTEGRITY')
  const hasBasicIntegrity = verdict.includes('MEETS_BASIC_INTEGRITY')

  // Check if verdict meets requirements
  if (requireStrong) {
    if (!hasStrongIntegrity) {
      throw new AndroidIntegrityError(
        'Device does not meet integrity requirements: MEETS_STRONG_INTEGRITY required'
      )
    }
  } else {
    const hasAcceptableIntegrity =
      hasDeviceIntegrity || hasStrongIntegrity || (allowBasic && hasBasicIntegrity)

    if (!hasAcceptableIntegrity) {
      throw new AndroidIntegrityError(
        'Device does not meet integrity requirements: no valid integrity verdict found'
      )
    }
  }

  // Ensure verdict values are recognized (defense-in-depth)
  const allowed: DeviceIntegrityVerdict[] = [
    'MEETS_DEVICE_INTEGRITY',
    'MEETS_STRONG_INTEGRITY',
    'MEETS_BASIC_INTEGRITY',
  ]
  const unknown = verdict.find((v) => !allowed.includes(v as DeviceIntegrityVerdict))
  if (unknown) {
    throw new AndroidIntegrityError(`Unknown device integrity verdict: ${unknown}`)
  }
}

/**
 * Verify Play Integrity token signature and validate claims
 *
 * Complete verification flow:
 * 1. Verify JWT signature using Google's public keys
 * 2. Parse and validate token claims
 * 3. Validate device integrity verdict
 * 4. Return verified payload
 *
 * @param token - JWT token from Play Integrity API
 * @param options - Verification options
 * @returns Verification result with payload or error
 */
export async function verifyIntegrityToken(
  token: string,
  options?: {
    /** Google public keys (JWKS) for signature verification (primarily for testing) */
    googlePublicKeys?: { keys: JWK[] }
    /** Override remote JWKS URL (defaults to Google JWKS URL) */
    jwksUrl?: string
    /** Expected package name */
    expectedPackageName?: string
    /** Expected nonce (challenge) */
    expectedNonce?: string
    /** Require MEETS_STRONG_INTEGRITY */
    requireStrongIntegrity?: boolean
    /** Allow MEETS_BASIC_INTEGRITY */
    allowBasicIntegrity?: boolean
  }
): Promise<{
  valid: boolean
  payload?: IntegrityTokenPayload
  error?: string
}> {
  try {
    // Parse token first
    const payload = await parseIntegrityToken(token)

    // Verify JWT signature
    try {
      let verified: any

      if (options?.googlePublicKeys) {
        // Use provided public keys (for testing)
        const { jwtVerify, importJWK } = await import('jose')

        // Find matching key by kid
        const header = decodeBase64UrlJson<{ kid?: string; alg?: string }>(token.split('.')[0])
        const kid = header.kid

        const matchingKey = options.googlePublicKeys.keys.find((key) => key.kid === kid)
        if (!matchingKey) {
          throw new Error(`No matching key found for kid: ${kid}`)
        }

        const publicKey = await importJWK(matchingKey)
        verified = await jwtVerify(token, publicKey)
      } else {
        // Use Google's public keys endpoint
        const JWKS = createRemoteJWKSet(
          new URL(options?.jwksUrl ?? GOOGLE_PLAY_INTEGRITY_JWKS_URL)
        )
        verified = await jwtVerify(token, JWKS)
      }
    } catch (error) {
      return {
        valid: false,
        error: `Signature verification failed: ${error instanceof Error ? error.message : 'unknown'}`,
      }
    }

    // Validate device integrity verdict
    try {
      validateDeviceVerdict(payload.deviceIntegrity.deviceRecognitionVerdict, {
        requireStrongIntegrity: options?.requireStrongIntegrity,
        allowBasicIntegrity: options?.allowBasicIntegrity,
      })
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Device integrity validation failed',
      }
    }

    // Validate expected package name
    if (options?.expectedPackageName) {
      if (payload.requestDetails.requestPackageName !== options.expectedPackageName) {
        return {
          valid: false,
          error: `Package name mismatch: expected ${options.expectedPackageName}, got ${payload.requestDetails.requestPackageName}`,
        }
      }
    }

    // Validate expected nonce
    if (options?.expectedNonce) {
      if (!constantTimeEqualString(payload.requestDetails.nonce, options.expectedNonce)) {
        return {
          valid: false,
          error: 'Nonce mismatch',
        }
      }
    }

    return {
      valid: true,
      payload,
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'unknown error',
    }
  }
}
