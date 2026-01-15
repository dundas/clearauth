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
