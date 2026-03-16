/**
 * Shared JWT token pair issuance helper
 *
 * Used by both the email/password handler and the OAuth handler to issue a
 * JWT access + refresh token pair after successful authentication.
 */

import type { Kysely } from 'kysely'
import type { Database } from '../database/schema.js'
import type { JwtConfig } from './types.js'
import { DEFAULT_REFRESH_TOKEN_TTL } from './types.js'
import { createAccessToken } from './signer.js'
import { createRefreshToken } from './refresh-tokens.js'

export interface TokenPairResult {
  accessToken: string
  refreshToken: string
  tokenType: 'Bearer'
  expiresIn: number
  refreshTokenId: string
}

/**
 * Issue a JWT access + refresh token pair for an authenticated user.
 *
 * @param db - Kysely database instance
 * @param user - Authenticated user (id, email, email_verified)
 * @param jwtConfig - JWT configuration
 * @returns Token pair ready to include in a response
 */
export async function issueTokenPair(
  db: Kysely<Database>,
  user: { id: string; email: string; email_verified: boolean },
  jwtConfig: JwtConfig
): Promise<TokenPairResult> {
  const accessToken = await createAccessToken(
    { sub: user.id, email: user.email, email_verified: user.email_verified },
    jwtConfig
  )
  const refreshTokenTTL = jwtConfig.refreshTokenTTL ?? DEFAULT_REFRESH_TOKEN_TTL
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenTTL * 1000)
  const { token: refreshToken, record } = await createRefreshToken(
    db,
    user.id,
    refreshTokenExpiresAt,
    null
  )
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: jwtConfig.accessTokenTTL ?? 900,
    refreshTokenId: record.id,
  }
}
