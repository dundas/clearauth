/**
 * JWT Signing and Verification Module
 *
 * Edge-compatible JWT operations using jose library.
 * Supports ES256 (ECDSA with P-256 curve) for optimal edge performance.
 *
 * Uses Web Crypto API standard - compatible with:
 * - Cloudflare Workers
 * - Node.js 18+
 * - Browsers
 * - Vercel Edge
 * - Deno/Bun
 */

import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from 'jose'
import type { JwtConfig, AccessTokenPayload } from './types.js'
import { DEFAULT_ACCESS_TOKEN_TTL } from './types.js'

/**
 * Supported key formats for ES256
 */
type KeyFormat = 'pem' | 'jwk'

/**
 * Detect key format from string content
 */
function detectKeyFormat(key: string): KeyFormat {
  if (key.trim().startsWith('{')) {
    return 'jwk'
  }
  if (key.includes('-----BEGIN')) {
    return 'pem'
  }
  throw new Error('Invalid key format: must be PEM or JWK')
}

/**
 * Import ES256 private key from PEM or JWK format
 *
 * @param privateKey - Private key string (PEM or JWK)
 * @returns CryptoKey for signing
 * @throws Error if key format is invalid or import fails
 */
export async function importPrivateKey(privateKey: string): Promise<CryptoKey> {
  const format = detectKeyFormat(privateKey)

  if (format === 'jwk') {
    const jwk = JSON.parse(privateKey)
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    )
  }

  // PEM format
  return await importPKCS8(privateKey, 'ES256')
}

/**
 * Import ES256 public key from PEM or JWK format
 *
 * @param publicKey - Public key string (PEM or JWK)
 * @returns CryptoKey for verification
 * @throws Error if key format is invalid or import fails
 */
export async function importPublicKey(publicKey: string): Promise<CryptoKey> {
  const format = detectKeyFormat(publicKey)

  if (format === 'jwk') {
    const jwk = JSON.parse(publicKey)
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
  }

  // PEM format
  return await importSPKI(publicKey, 'ES256')
}

/**
 * Validate algorithm configuration (security-critical)
 *
 * @param algorithm - Algorithm to validate
 * @throws Error if algorithm is not ES256
 */
export function validateAlgorithm(algorithm?: string): void {
  if (algorithm && algorithm !== 'ES256') {
    throw new Error(
      `Invalid algorithm: ${algorithm}. Only ES256 is supported in ClearAuth v1.` +
      ` Rejecting non-ES256 algorithms prevents security vulnerabilities.`
    )
  }
}

/**
 * Create and sign a JWT access token
 *
 * @param payload - Token payload (user ID, email)
 * @param config - JWT configuration
 * @returns Signed JWT access token string
 * @throws Error if signing fails or algorithm is invalid
 *
 * @example
 * ```typescript
 * const token = await createAccessToken(
 *   { sub: 'user-123', email: 'user@example.com' },
 *   {
 *     privateKey: pemPrivateKey,
 *     publicKey: pemPublicKey,
 *     accessTokenTTL: 900,
 *     issuer: 'https://example.com',
 *     audience: 'https://api.example.com'
 *   }
 * )
 * ```
 */
export async function createAccessToken(
  payload: Pick<AccessTokenPayload, 'sub' | 'email'>,
  config: JwtConfig
): Promise<string> {
  // Validate algorithm (security-critical)
  validateAlgorithm(config.algorithm)

  // Import private key
  const privateKey = await importPrivateKey(config.privateKey)

  // Build JWT with standard claims
  const ttl = config.accessTokenTTL ?? DEFAULT_ACCESS_TOKEN_TTL
  const jwt = new SignJWT({
    sub: payload.sub,
    email: payload.email,
  })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)

  // Add optional claims
  if (config.issuer) {
    jwt.setIssuer(config.issuer)
  }
  if (config.audience) {
    jwt.setAudience(config.audience)
  }

  // Sign and return JWT
  return await jwt.sign(privateKey)
}

/**
 * Verify and decode a JWT access token
 *
 * @param token - JWT token string
 * @param config - JWT configuration
 * @returns Decoded and verified token payload
 * @throws Error if verification fails, token is expired, or algorithm is invalid
 *
 * @example
 * ```typescript
 * try {
 *   const payload = await verifyAccessToken(token, {
 *     privateKey: pemPrivateKey,
 *     publicKey: pemPublicKey,
 *     issuer: 'https://example.com',
 *     audience: 'https://api.example.com'
 *   })
 *   console.log('User ID:', payload.sub)
 *   console.log('Email:', payload.email)
 * } catch (error) {
 *   console.error('Token verification failed:', error)
 * }
 * ```
 */
export async function verifyAccessToken(
  token: string,
  config: JwtConfig
): Promise<AccessTokenPayload> {
  // Validate algorithm (security-critical)
  validateAlgorithm(config.algorithm)

  // Import public key
  const publicKey = await importPublicKey(config.publicKey)

  // Verify JWT with strict algorithm enforcement
  const { payload } = await jwtVerify(token, publicKey, {
    algorithms: ['ES256'], // Explicitly restrict to ES256 only
    issuer: config.issuer,
    audience: config.audience,
  })

  // Type-safe payload extraction
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    iat: payload.iat as number,
    exp: payload.exp as number,
    iss: payload.iss as string | undefined,
    aud: payload.aud as string | string[] | undefined,
  }
}
