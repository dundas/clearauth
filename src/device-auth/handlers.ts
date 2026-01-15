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
import { generateChallenge, storeChallenge } from './challenge.js'
import type { ChallengeResponse } from './types.js'

/**
 * Error response
 */
interface ErrorResponse {
  error: string
  message: string
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

  // Route not found
  return null
}
