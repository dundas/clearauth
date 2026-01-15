/**
 * JWT Authentication Module
 *
 * Provides JWT Bearer token authentication for stateless API and CLI access.
 * Includes token generation, refresh, revocation, and validation.
 *
 * @example
 * ```typescript
 * import { createAccessToken, createRefreshToken, validateBearerToken } from 'clearauth/jwt'
 *
 * // Create JWT token pair
 * const accessToken = await createAccessToken(
 *   { sub: 'user-123', email: 'user@example.com' },
 *   jwtConfig
 * )
 *
 * const { token: refreshToken, record } = await createRefreshToken(
 *   db,
 *   'user-123',
 *   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
 * )
 *
 * // Validate Bearer token
 * const payload = await validateBearerToken(request, jwtConfig)
 * if (payload) {
 *   console.log('User:', payload.email)
 * }
 * ```
 *
 * @module clearauth/jwt
 */

// JWT Types
export type {
  JwtConfig,
  TokenPair,
  AccessTokenPayload,
} from './jwt/types.js'

export {
  DEFAULT_ACCESS_TOKEN_TTL,
  DEFAULT_REFRESH_TOKEN_TTL,
} from './jwt/types.js'

// JWT Signing & Verification
export {
  createAccessToken,
  verifyAccessToken,
  importPrivateKey,
  importPublicKey,
  validateAlgorithm,
} from './jwt/signer.js'

// Refresh Token Operations
export {
  generateRefreshToken,
  hashRefreshToken,
  createRefreshToken,
  getRefreshToken,
  getRefreshTokenById,
  getUserRefreshTokens,
  updateLastUsed,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  deleteRefreshToken,
  cleanupExpiredTokens,
} from './jwt/refresh-tokens.js'

// HTTP Handlers
export {
  handleTokenRequest,
  handleRefreshRequest,
  handleRevokeRequest,
  parseBearerToken,
  validateBearerToken,
} from './jwt/handlers.js'

// Database schema types (for JWT-related tables)
export type {
  RefreshToken,
  NewRefreshToken,
  RefreshTokenUpdate,
} from './database/schema.js'

export { isValidRefreshToken } from './database/schema.js'
