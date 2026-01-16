/**
 * Device Authentication HTTP Handlers
 *
 * Provides HTTP endpoints for device key authentication:
 * - POST /auth/challenge - Generate a new challenge for device authentication
 *
 * Future endpoints (will be added in subsequent PRs):
 * - POST /auth/device/register - Register a new device with signature verification
 * - POST /auth/device/authenticate - Authenticate with a registered device
 * - GET /auth/device/list - List user's registered devices
 * - POST /auth/device/revoke - Revoke a device
 */

import type { ClearAuthConfig } from '../types.js'
import { base64url } from 'oslo/encoding'
import { generateChallenge, storeChallenge, verifyChallenge } from './challenge.js'
import { getSessionFromCookie } from '../session/validate.js'
import { verifyEIP191Signature, recoverEthereumPublicKey } from './web3-verifier.js'
import { verifySignature } from './signature-verifier.js'
import { verifyIOSAttestation, extractPublicKeyFromAttestation } from './ios-verifier.js'
import { verifyIntegrityToken } from './android-verifier.js'
import type { ChallengeResponse, DeviceRegistrationRequest, DeviceRegistrationResponse } from './types.js'
import { isDevicePlatform, isKeyAlgorithm } from './types.js'

/**
 * Error response
 */
interface ErrorResponse {
  error: string
  message: string
}

/**
 * Generate a stable, user-friendly device identifier
 * @internal
 */
function generateDeviceId(platform: string, entropyBytes: number = 12): string {
  const bytes = new Uint8Array(entropyBytes)
  crypto.getRandomValues(bytes)
  const suffix = base64url.encode(bytes).replace(/=/g, '')
  return `dev_${platform}_${suffix}`
}

/**
 * Normalize an Ethereum address to lowercase 0x-prefixed format
 * @internal
 */
function normalizeEthereumAddress(address: string): string {
  const lower = address.toLowerCase()
  return lower.startsWith('0x') ? lower : `0x${lower}`
}

/**
 * Basic Ethereum address validation
 * @internal
 */
function isValidEthereumAddress(address: string): boolean {
  const normalized = normalizeEthereumAddress(address)
  return /^0x[0-9a-f]{40}$/.test(normalized)
}

/**
 * Parse JSON body from request
 *
 * @param request - HTTP request
 * @returns Parsed JSON body
 * @throws Error if body is invalid or already consumed
 */
async function parseJsonBody<T = any>(request: Request): Promise<T> {
  if (request.bodyUsed) {
    throw new Error('Request body has already been consumed')
  }

  const text = await request.text()

  if (!text || text.trim() === '') {
    // Empty body is ok for some endpoints (like challenge generation)
    return {} as T
  }

  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error('Invalid JSON in request body')
  }
}

/**
 * Handle POST /auth/device/register - Register a new device
 *
 * Requires an authenticated session cookie. The request must include a valid
 * one-time challenge and a signature of that challenge from the device key.
 *
 * For Web3 devices, the signature is verified using EIP-191 personal_sign and
 * must match the provided wallet address.
 */
export async function handleDeviceRegisterRequest(
  request: Request,
  config: ClearAuthConfig
): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({
          error: 'method_not_allowed',
          message: 'Only POST method is allowed',
        } satisfies ErrorResponse),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json', Allow: 'POST' },
        }
      )
    }

    // Session-authenticated: must have a valid session cookie
    const cookieName = config.session?.cookie?.name ?? 'session'
    const sessionResult = await getSessionFromCookie(request, config.database, { cookieName })
    if (!sessionResult) {
      return new Response(
        JSON.stringify({
          error: 'unauthorized',
          message: 'Valid session cookie required to register a device',
        } satisfies ErrorResponse),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const body = await parseJsonBody<DeviceRegistrationRequest>(request)

    if (!body || typeof body !== 'object') {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Request body must be a JSON object',
        } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { platform, publicKey, keyAlgorithm, walletAddress, challenge, signature, attestation, keyId, integrityToken } = body

    if (!platform || !isDevicePlatform(platform)) {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Invalid or missing platform',
        } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!keyAlgorithm || !isKeyAlgorithm(keyAlgorithm)) {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Invalid or missing keyAlgorithm',
        } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!challenge || typeof challenge !== 'string') {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Missing challenge',
        } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!signature || typeof signature !== 'string') {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Missing signature',
        } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // iOS requires attestation and keyId
    if (platform === 'ios') {
      if (!attestation || typeof attestation !== 'string') {
        return new Response(
          JSON.stringify({
            error: 'invalid_request',
            message: 'attestation is required for iOS platform',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      if (!keyId || typeof keyId !== 'string') {
        return new Response(
          JSON.stringify({
            error: 'invalid_request',
            message: 'keyId is required for iOS platform',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Android requires integrityToken
    if (platform === 'android') {
      if (!integrityToken || typeof integrityToken !== 'string') {
        return new Response(
          JSON.stringify({
            error: 'invalid_request',
            message: 'integrityToken is required for Android platform',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Verify and consume the challenge (one-time use)
    const okChallenge = await verifyChallenge(config, challenge)
    if (!okChallenge) {
      return new Response(
        JSON.stringify({
          error: 'invalid_challenge',
          message: 'Challenge is invalid, expired, or already used',
        } satisfies ErrorResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const userId = sessionResult.user.id

    const now = new Date()
    const deviceId = generateDeviceId(platform)

    let finalWalletAddress: string | null = null
    let finalPublicKey: string

    if (platform === 'web3') {
      if (!walletAddress || typeof walletAddress !== 'string' || !isValidEthereumAddress(walletAddress)) {
        return new Response(
          JSON.stringify({
            error: 'invalid_request',
            message: 'walletAddress is required for web3 and must be a valid Ethereum address',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      finalWalletAddress = normalizeEthereumAddress(walletAddress)

      const okSig = verifyEIP191Signature(challenge, signature, finalWalletAddress)
      if (!okSig) {
        return new Response(
          JSON.stringify({
            error: 'invalid_signature',
            message: 'Signature does not match provided wallet address',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Persist recovered public key for audit and optional future verification
      finalPublicKey = recoverEthereumPublicKey(challenge, signature)

      // Optional: if caller provided a public key, ensure it matches the recovered one
      if (publicKey && typeof publicKey === 'string') {
        const provided = publicKey.toLowerCase().replace(/^0x/i, '0x')
        if (provided.startsWith('0x') && provided.length === finalPublicKey.length && provided !== finalPublicKey) {
          return new Response(
            JSON.stringify({
              error: 'invalid_request',
              message: 'Provided publicKey does not match recovered public key for signature',
            } satisfies ErrorResponse),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          )
        }
      }
    } else if (platform === 'ios') {
      // iOS: Verify App Attest attestation and extract public key
      if (!attestation || !keyId) {
        return new Response(
          JSON.stringify({
            error: 'invalid_request',
            message: 'iOS platform requires attestation and keyId',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Verify attestation (includes certificate chain validation)
      const attestationResult = await verifyIOSAttestation({
        attestation,
        challenge,
        signature,
        keyId,
      })

      if (!attestationResult.valid || !attestationResult.publicKey) {
        return new Response(
          JSON.stringify({
            error: 'invalid_attestation',
            message: attestationResult.error || 'iOS attestation verification failed',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Public key extracted from attestation
      finalPublicKey = attestationResult.publicKey

      // Optional: Verify the signature using the extracted public key
      const okSig = await verifySignature({
        message: challenge,
        signature,
        publicKey: finalPublicKey,
        algorithm: keyAlgorithm,
      })

      if (!okSig) {
        return new Response(
          JSON.stringify({
            error: 'invalid_signature',
            message: 'Signature verification failed with extracted public key',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
    } else if (platform === 'android') {
      // Android: Verify Play Integrity token
      if (!integrityToken) {
        return new Response(
          JSON.stringify({
            error: 'invalid_request',
            message: 'Android platform requires integrityToken',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      if (!config.android?.packageName) {
        throw new Error(
          'Android package name must be configured (config.android.packageName) for Android device registration'
        )
      }

      // Verify Play Integrity token
      const integrityResult = await verifyIntegrityToken(integrityToken, {
        expectedNonce: challenge,
        expectedPackageName: config.android.packageName,
      })

      if (!integrityResult.valid || !integrityResult.payload) {
        return new Response(
          JSON.stringify({
            error: 'invalid_integrity_token',
            message: integrityResult.error || 'Play Integrity verification failed',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // For Android, public key must be provided separately
      if (!publicKey || typeof publicKey !== 'string') {
        return new Response(
          JSON.stringify({
            error: 'invalid_request',
            message: 'publicKey is required for Android device registration',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Verify the signature using the provided public key
      const okSig = await verifySignature({
        message: challenge,
        signature,
        publicKey,
        algorithm: keyAlgorithm,
      })

      if (!okSig) {
        return new Response(
          JSON.stringify({
            error: 'invalid_signature',
            message: 'Signature verification failed',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      finalPublicKey = publicKey
    } else {
      // Non-web3/iOS/Android devices: require public key for verification
      if (!publicKey || typeof publicKey !== 'string') {
        return new Response(
          JSON.stringify({
            error: 'invalid_request',
            message: 'publicKey is required for non-web3 device registration',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const okSig = await verifySignature({
        message: challenge,
        signature,
        publicKey,
        algorithm: keyAlgorithm,
      })

      if (!okSig) {
        return new Response(
          JSON.stringify({
            error: 'invalid_signature',
            message: 'Signature verification failed',
          } satisfies ErrorResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      finalPublicKey = publicKey
    }

    await config.database
      .insertInto('devices')
      .values({
        device_id: deviceId,
        user_id: userId,
        platform,
        public_key: finalPublicKey,
        wallet_address: finalWalletAddress,
        key_algorithm: keyAlgorithm,
        status: 'active',
        registered_at: now,
        last_used_at: null,
      })
      .execute()

    const response: DeviceRegistrationResponse = {
      deviceId,
      userId,
      platform,
      status: 'active',
      registeredAt: now.toISOString(),
    }

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Device registration failed:', error)
    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Failed to register device',
      } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Handle POST /auth/challenge - Generate a new challenge
 *
 * Generates a cryptographically secure challenge for device authentication.
 * The challenge must be signed by the device's private key for registration or authentication.
 *
 * @param request - HTTP request
 * @param config - ClearAuth configuration
 * @returns HTTP response with challenge or error
 *
 * @example
 * ```typescript
 * POST /auth/challenge
 * Content-Type: application/json
 *
 * Response:
 * {
 *   "challenge": "a1b2c3...def|1705326960000",
 *   "expiresIn": 600,
 *   "createdAt": "2026-01-15T12:16:00.000Z"
 * }
 * ```
 */
export async function handleChallengeRequest(
  request: Request,
  config: ClearAuthConfig
): Promise<Response> {
  try {
    // Check method
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({
          error: 'method_not_allowed',
          message: 'Only POST method is allowed',
        } satisfies ErrorResponse),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Allow': 'POST',
          },
        }
      )
    }

    // Generate challenge
    const challengeResponse = generateChallenge()

    // Store challenge in database
    await storeChallenge(config, challengeResponse.challenge)

    // Return challenge to client
    return new Response(JSON.stringify(challengeResponse satisfies ChallengeResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Challenge generation failed:', error)

    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: 'Failed to generate challenge',
      } satisfies ErrorResponse),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/**
 * Route device authentication requests to appropriate handlers
 *
 * @param request - HTTP request
 * @param config - ClearAuth configuration
 * @returns HTTP response or null if route not found
 *
 * @example
 * ```typescript
 * const response = await handleDeviceAuthRequest(request, config)
 * if (!response) {
 *   // Route not found, handle 404
 * }
 * ```
 */
export async function handleDeviceAuthRequest(
  request: Request,
  config: ClearAuthConfig
): Promise<Response | null> {
  const url = new URL(request.url)

  // POST /auth/challenge
  if (url.pathname === '/auth/challenge') {
    return handleChallengeRequest(request, config)
  }

  // POST /auth/device/register
  if (url.pathname === '/auth/device/register') {
    return handleDeviceRegisterRequest(request, config)
  }

  // Route not found
  return null
}
