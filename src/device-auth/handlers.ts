/**
 * Device Authentication HTTP Handlers
 *
 * Provides HTTP endpoints for device key authentication:
 * - POST /auth/challenge - Generate a new challenge for device authentication
 * - POST /auth/device/register - Register a new device with signature verification
 * - GET /auth/devices - List user's registered devices
 * - DELETE /auth/devices/:deviceId - Revoke a device
 */

import type { ClearAuthConfig } from '../types.js'
import { base64url } from 'oslo/encoding'
import { generateChallenge, storeChallenge, verifyChallenge } from './challenge.js'
import { getSessionFromCookie } from '../session/validate.js'
import { verifyEIP191Signature, recoverEthereumPublicKey } from './web3-verifier.js'
import { verifySignature } from './signature-verifier.js'
import { verifyIOSAttestation, extractPublicKeyFromAttestation } from './ios-verifier.js'
import { verifyIntegrityToken } from './android-verifier.js'
import { listUserDevices, revokeDevice } from './device-registration.js'
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
 * Get the session cookie name from configuration
 * @internal
 */
function getCookieName(config: ClearAuthConfig): string {
  return config.session?.cookie?.name ?? 'session'
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
    const sessionResult = await getSessionFromCookie(request, config.database, { 
      cookieName: getCookieName(config) 
    })
    
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
      const attestationResult = await verifyIOSAttestation({
        attestation: attestation!,
        challenge,
        signature,
        keyId: keyId!,
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

      finalPublicKey = attestationResult.publicKey

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
      if (!config.android?.packageName) {
        throw new Error(
          'Android package name must be configured (config.android.packageName) for Android device registration'
        )
      }

      const integrityResult = await verifyIntegrityToken(integrityToken!, {
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

      if (!publicKey || typeof publicKey !== 'string') {
        return new Response(
          JSON.stringify({
            error: 'invalid_request',
            message: 'publicKey is required for Android device registration',
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
    } else {
      // Non-web3/iOS/Android devices
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
        message: 'Failed to register device', // Generic message
      } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Handle POST /auth/challenge - Generate a new challenge
 *
 * Generates a cryptographically secure challenge for device authentication.
 */
export async function handleChallengeRequest(
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
          headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
        }
      )
    }

    const challengeResponse = generateChallenge()
    await storeChallenge(config, challengeResponse.challenge)

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
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Handle GET /auth/devices - List user's registered devices
 *
 * Requires an authenticated session cookie. Returns all devices
 * (both active and revoked) for the authenticated user.
 */
export async function handleListDevicesRequest(
  request: Request,
  config: ClearAuthConfig
): Promise<Response> {
  try {
    if (request.method !== 'GET') {
      return new Response(
        JSON.stringify({
          error: 'method_not_allowed',
          message: 'Only GET method is allowed',
        } satisfies ErrorResponse),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json', Allow: 'GET' },
        }
      )
    }

    // Session-authenticated: must have a valid session cookie
    const sessionResult = await getSessionFromCookie(request, config.database, { 
      cookieName: getCookieName(config) 
    })
    
    if (!sessionResult) {
      return new Response(
        JSON.stringify({
          error: 'unauthorized',
          message: 'Valid session cookie required',
        } satisfies ErrorResponse),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse pagination options from URL
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const devices = await listUserDevices(config.database, sessionResult.user.id, {
      limit: isNaN(limit) ? 50 : limit,
      offset: isNaN(offset) ? 0 : offset,
    })

    return new Response(JSON.stringify({ devices }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('List devices failed:', error)
    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: 'Failed to list devices',
      } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Handle DELETE /auth/devices/:deviceId - Revoke a device
 *
 * Requires an authenticated session cookie. Revokes the specified device
 * if it belongs to the authenticated user.
 */
export async function handleRevokeDeviceRequest(
  request: Request,
  config: ClearAuthConfig,
  deviceId: string
): Promise<Response> {
  try {
    if (request.method !== 'DELETE') {
      return new Response(
        JSON.stringify({
          error: 'method_not_allowed',
          message: 'Only DELETE method is allowed',
        } satisfies ErrorResponse),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json', Allow: 'DELETE' },
        }
      )
    }

    // Session-authenticated: must have a valid session cookie
    const sessionResult = await getSessionFromCookie(request, config.database, { 
      cookieName: getCookieName(config) 
    })
    
    if (!sessionResult) {
      return new Response(
        JSON.stringify({
          error: 'unauthorized',
          message: 'Valid session cookie required',
        } satisfies ErrorResponse),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const revoked = await revokeDevice(config.database, deviceId, sessionResult.user.id)

    if (!revoked) {
      return new Response(
        JSON.stringify({
          error: 'not_found',
          message: 'Device not found or cannot be revoked', // Generic message
        } satisfies ErrorResponse),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, deviceId }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Revoke device failed:', error)
    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: 'Failed to revoke device',
      } satisfies ErrorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Route device authentication requests to appropriate handlers
 *
 * @param request - HTTP request
 * @param config - ClearAuth configuration
 * @returns HTTP response or null if route not found
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

  // GET /auth/devices - List all devices for the user
  if (url.pathname === '/auth/devices') {
    return handleListDevicesRequest(request, config)
  }

  // DELETE /auth/devices/:deviceId - Revoke a specific device
  if (url.pathname.startsWith('/auth/devices/')) {
    const rawDeviceId = url.pathname.substring('/auth/devices/'.length)
    const deviceId = rawDeviceId.trim()

    // CRITICAL FIX: Ensure deviceId is not empty and matches expected format
    const isValidFormat = /^dev_[a-zA-Z0-9_-]+$/.test(deviceId)

    if (isValidFormat) {
      return handleRevokeDeviceRequest(request, config, deviceId)
    }

    // If it started with /auth/devices/ but didn't match format, it's a 400
    // This includes empty deviceId (which fails regex)
    return new Response(
      JSON.stringify({
        error: 'invalid_request',
        message: 'Invalid device ID format',
      } satisfies ErrorResponse),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Route not found
  return null
}