/**
 * JWT Configuration and Type Definitions
 *
 * TypeScript interfaces for JWT authentication including:
 * - Configuration options
 * - Token pair structure
 * - Access token payload
 * - Default TTL constants
 */

/**
 * JWT Configuration
 *
 * Configuration options for JWT token generation and verification.
 */
export interface JwtConfig {
  /**
   * Access token time-to-live in seconds
   * @default 900 (15 minutes)
   */
  accessTokenTTL?: number

  /**
   * Refresh token time-to-live in seconds
   * @default 2592000 (30 days)
   */
  refreshTokenTTL?: number

  /**
   * Signing algorithm
   * Currently only ES256 (ECDSA with P-256 curve) is supported
   * @default 'ES256'
   */
  algorithm?: 'ES256'

  /**
   * ES256 private key for signing tokens
   * Can be in PEM or JWK format
   */
  privateKey: string

  /**
   * ES256 public key for verifying tokens
   * Can be in PEM or JWK format
   */
  publicKey: string

  /**
   * Optional issuer claim (iss)
   * Identifies the principal that issued the JWT
   */
  issuer?: string

  /**
   * Optional audience claim (aud)
   * Identifies the recipients that the JWT is intended for
   */
  audience?: string
}

/**
 * Token Pair
 *
 * A pair of access and refresh tokens returned after authentication.
 */
export interface TokenPair {
  /**
   * JWT access token (short-lived, stateless)
   */
  accessToken: string

  /**
   * Opaque refresh token (long-lived, stored in database)
   */
  refreshToken: string

  /**
   * Access token TTL in seconds
   */
  expiresIn: number

  /**
   * Refresh token ID (for revocation)
   */
  refreshTokenId: string
}

/**
 * Access Token Payload
 *
 * Standard JWT claims included in access tokens.
 */
export interface AccessTokenPayload {
  /**
   * Subject (user ID)
   */
  sub: string

  /**
   * User email address
   */
  email: string

  /**
   * Issued at (Unix timestamp in seconds)
   */
  iat: number

  /**
   * Expires at (Unix timestamp in seconds)
   */
  exp: number

  /**
   * Issuer (if configured)
   */
  iss?: string

  /**
   * Audience (if configured)
   * Can be a single string or array of strings per JWT spec
   */
  aud?: string | string[]

  /**
   * Optional bound device identifier (if the app uses device-bound JWTs)
   */
  deviceId?: string
}

/**
 * Default access token TTL (15 minutes)
 */
export const DEFAULT_ACCESS_TOKEN_TTL = 900

/**
 * Default refresh token TTL (30 days)
 */
export const DEFAULT_REFRESH_TOKEN_TTL = 2592000
