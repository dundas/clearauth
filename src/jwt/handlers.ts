/**
 * JWT HTTP Handlers Module
 *
 * Provides HTTP endpoints for JWT token operations:
 * - POST /auth/token - Exchange credentials for JWT token pair
 * - POST /auth/refresh - Rotate refresh token and get new access token
 * - POST /auth/revoke - Revoke a refresh token
 *
 * Supports Bearer token authentication via Authorization header.
 */

import type { Kysely } from 'kysely'
import type { Database } from '../database/schema.js'
import type { JwtConfig, TokenPair } from './types.js'
import { DEFAULT_REFRESH_TOKEN_TTL } from './types.js'
import { createAccessToken, verifyAccessToken } from './signer.js'
import {
  createRefreshToken,
  getRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  updateLastUsed,
} from './refresh-tokens.js'

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
    throw new Error('Request body is empty')
  }

  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error('Invalid JSON in request body')
  }
}

/**
 * Token endpoint request body
 */
interface TokenRequest {
  /**
   * User ID to create tokens for
   */
  userId: string

  /**
   * User email address
   */
  email: string

  /**
   * Optional device/client name for refresh token
   */
  deviceName?: string
}

/**
 * Refresh endpoint request body
 */
interface RefreshRequest {
  /**
   * Refresh token to rotate
   */
  refreshToken: string
}

/**
 * Revoke endpoint request body
 */
interface RevokeRequest {
  /**
   * Refresh token to revoke
   */
  refreshToken: string
}

/**
 * Token endpoint response
 */
interface TokenResponse {
  /**
   * JWT access token (short-lived, stateless)
   */
  accessToken: string

  /**
   * Refresh token (long-lived, stored in database)
   */
  refreshToken: string

  /**
   * Token type (always "Bearer")
   */
  tokenType: 'Bearer'

  /**
   * Access token expiration in seconds
   */
  expiresIn: number

  /**
   * Refresh token ID (for revocation)
   */
  refreshTokenId: string
}

/**
 * Error response
 */
interface ErrorResponse {
  error: string
  message: string
}

/**
 * Handle POST /auth/token - Exchange credentials for JWT token pair
 *
 * Creates both an access token (JWT) and a refresh token (opaque).
 * The access token is stateless and expires quickly (default 15 min).
 * The refresh token is stored in the database and can be used to get new access tokens.
 *
 * @param request - HTTP request
 * @param db - Kysely database instance
 * @param jwtConfig - JWT configuration
 * @returns HTTP response with token pair or error
 *
 * @example
 * ```typescript
 * POST /auth/token
 * Content-Type: application/json
 *
 * {
 *   "userId": "user-123",
 *   "email": "user@example.com",
 *   "deviceName": "iPhone 15 Pro"
 * }
 *
 * Response:
 * {
 *   "accessToken": "eyJhbGc...",
 *   "refreshToken": "rt_...",
 *   "tokenType": "Bearer",
 *   "expiresIn": 900,
 *   "refreshTokenId": "token-uuid"
 * }
 * ```
 */
export async function handleTokenRequest(
  request: Request,
  db: Kysely<Database>,
  jwtConfig: JwtConfig
): Promise<Response> {
  try {
    // Parse request body
    const body = await parseJsonBody<TokenRequest>(request)

    if (!body.userId || !body.email) {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Missing required fields: userId, email',
        } satisfies ErrorResponse),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Create access token (JWT)
    const accessToken = await createAccessToken(
      { sub: body.userId, email: body.email },
      jwtConfig
    )

    // Create refresh token
    const refreshTokenTTL = jwtConfig.refreshTokenTTL ?? DEFAULT_REFRESH_TOKEN_TTL
    const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenTTL * 1000)
    const { token: refreshToken, record: refreshTokenRecord } = await createRefreshToken(
      db,
      body.userId,
      refreshTokenExpiresAt,
      body.deviceName ?? null
    )

    const response: TokenResponse = {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: jwtConfig.accessTokenTTL ?? 900,
      refreshTokenId: refreshTokenRecord.id,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'server_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      } satisfies ErrorResponse),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/**
 * Handle POST /auth/refresh - Rotate refresh token and get new access token
 *
 * Takes an existing refresh token, validates it, creates a new access token,
 * and rotates the refresh token (creates new one, revokes old one).
 * This prevents replay attacks.
 *
 * @param request - HTTP request
 * @param db - Kysely database instance
 * @param jwtConfig - JWT configuration
 * @returns HTTP response with new token pair or error
 *
 * @example
 * ```typescript
 * POST /auth/refresh
 * Content-Type: application/json
 *
 * {
 *   "refreshToken": "rt_..."
 * }
 *
 * Response:
 * {
 *   "accessToken": "eyJhbGc...",
 *   "refreshToken": "rt_new...",
 *   "tokenType": "Bearer",
 *   "expiresIn": 900,
 *   "refreshTokenId": "new-token-uuid"
 * }
 * ```
 */
export async function handleRefreshRequest(
  request: Request,
  db: Kysely<Database>,
  jwtConfig: JwtConfig
): Promise<Response> {
  try {
    // Parse request body
    const body = await parseJsonBody<RefreshRequest>(request)

    if (!body.refreshToken) {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Missing required field: refreshToken',
        } satisfies ErrorResponse),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Get refresh token from database
    const refreshTokenRecord = await getRefreshToken(db, body.refreshToken)

    if (!refreshTokenRecord) {
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          message: 'Invalid or expired refresh token',
        } satisfies ErrorResponse),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Check if token is expired or revoked
    const now = new Date()
    if (refreshTokenRecord.expires_at <= now || refreshTokenRecord.revoked_at !== null) {
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          message: 'Refresh token has been revoked or expired',
        } satisfies ErrorResponse),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Get user information (we'll need to join with users table)
    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', refreshTokenRecord.user_id)
      .executeTakeFirst()

    if (!user) {
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          message: 'User not found',
        } satisfies ErrorResponse),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Create new access token
    const accessToken = await createAccessToken(
      { sub: user.id, email: user.email },
      jwtConfig
    )

    // Rotate refresh token (create new, revoke old)
    const refreshTokenTTL = jwtConfig.refreshTokenTTL ?? DEFAULT_REFRESH_TOKEN_TTL
    const newRefreshTokenExpiresAt = new Date(Date.now() + refreshTokenTTL * 1000)
    const rotateResult = await rotateRefreshToken(
      db,
      body.refreshToken,
      newRefreshTokenExpiresAt
    )

    if (!rotateResult) {
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          message: 'Failed to rotate refresh token',
        } satisfies ErrorResponse),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const response: TokenResponse = {
      accessToken,
      refreshToken: rotateResult.token,
      tokenType: 'Bearer',
      expiresIn: jwtConfig.accessTokenTTL ?? 900,
      refreshTokenId: rotateResult.record.id,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'server_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      } satisfies ErrorResponse),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/**
 * Handle POST /auth/revoke - Revoke a refresh token
 *
 * Invalidates a refresh token by setting its revoked_at timestamp.
 * The token cannot be used for refreshing after revocation.
 *
 * @param request - HTTP request
 * @param db - Kysely database instance
 * @returns HTTP response indicating success or error
 *
 * @example
 * ```typescript
 * POST /auth/revoke
 * Content-Type: application/json
 *
 * {
 *   "refreshToken": "rt_..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Refresh token revoked successfully"
 * }
 * ```
 */
export async function handleRevokeRequest(
  request: Request,
  db: Kysely<Database>
): Promise<Response> {
  try {
    // Parse request body
    const body = await parseJsonBody<RevokeRequest>(request)

    if (!body.refreshToken) {
      return new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Missing required field: refreshToken',
        } satisfies ErrorResponse),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Get refresh token from database
    const refreshTokenRecord = await getRefreshToken(db, body.refreshToken)

    if (!refreshTokenRecord) {
      // Return success even if token doesn't exist (idempotent)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Refresh token revoked successfully',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Revoke the token
    await revokeRefreshToken(db, refreshTokenRecord.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Refresh token revoked successfully',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'server_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      } satisfies ErrorResponse),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

/**
 * Parse Bearer token from Authorization header
 *
 * Extracts JWT access token from "Authorization: Bearer <token>" header.
 *
 * @param request - HTTP request
 * @returns Access token or null if not found/invalid format
 *
 * @example
 * ```typescript
 * const token = parseBearerToken(request)
 * if (token) {
 *   const payload = await verifyAccessToken(token, jwtConfig)
 * }
 * ```
 */
export function parseBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return null
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null
  }

  return parts[1]
}

/**
 * Validate Bearer token from Authorization header
 *
 * Extracts and verifies JWT access token from Authorization header.
 * Returns decoded payload if valid, null otherwise.
 *
 * @param request - HTTP request
 * @param jwtConfig - JWT configuration
 * @returns Decoded access token payload or null if invalid
 *
 * @example
 * ```typescript
 * const payload = await validateBearerToken(request, jwtConfig)
 * if (payload) {
 *   console.log('User ID:', payload.sub)
 *   console.log('Email:', payload.email)
 * } else {
 *   return new Response('Unauthorized', { status: 401 })
 * }
 * ```
 */
export async function validateBearerToken(
  request: Request,
  jwtConfig: JwtConfig
): Promise<{ sub: string; email: string; iat: number; exp: number } | null> {
  const token = parseBearerToken(request)
  if (!token) {
    return null
  }

  try {
    const payload = await verifyAccessToken(token, jwtConfig)
    return {
      sub: payload.sub,
      email: payload.email,
      iat: payload.iat,
      exp: payload.exp,
    }
  } catch (error) {
    // Token verification failed (expired, invalid signature, etc.)
    return null
  }
}
