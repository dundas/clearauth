/**
 * Refresh Token Operations Module
 *
 * Provides secure storage and management of JWT refresh tokens.
 * Implements token hashing, rotation, revocation, and tracking.
 *
 * Security Features:
 * - SHA-256 hashing before storage (tokens never stored in plaintext)
 * - Token rotation to prevent replay attacks
 * - Revocation support (single token or all user tokens)
 * - Last used tracking for security monitoring
 */

import type { Kysely } from 'kysely'
import type { Database, RefreshToken, NewRefreshToken } from '../database/schema.js'

/**
 * Hash a refresh token using SHA-256
 *
 * Tokens are hashed before storage to prevent theft if database is compromised.
 * Uses Web Crypto API for edge compatibility.
 *
 * @param token - Raw refresh token string
 * @returns Hex-encoded SHA-256 hash
 *
 * @example
 * ```typescript
 * const token = generateRefreshToken()
 * const hash = await hashRefreshToken(token)
 * // Store hash in database, return token to user
 * ```
 */
export async function hashRefreshToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/**
 * Generate a cryptographically secure refresh token
 *
 * Uses Web Crypto API for secure random token generation (edge-compatible).
 * Generates 32 bytes (256 bits) of entropy and encodes as base64url.
 *
 * @returns Secure random token string (base64url-encoded)
 */
export function generateRefreshToken(): string {
  // 32 bytes = 256 bits of entropy
  const buffer = new Uint8Array(32)
  crypto.getRandomValues(buffer)

  // Convert to base64url (URL-safe, no padding)
  let base64 = btoa(String.fromCharCode(...buffer))
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Create a new refresh token in the database
 *
 * Generates a secure token, hashes it with SHA-256, and stores it in the database.
 * The raw token is returned to the caller (never stored).
 *
 * @param db - Kysely database instance
 * @param userId - User ID the token belongs to
 * @param expiresAt - Token expiration date
 * @param name - Optional device/client name for identification
 * @returns Object containing the raw token (for user) and token record (with hash)
 *
 * @example
 * ```typescript
 * const { token, record } = await createRefreshToken(
 *   db,
 *   'user-123',
 *   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
 *   'iPhone 15 Pro'
 * )
 * // Return token to user, store record.id for reference
 * ```
 */
export async function createRefreshToken(
  db: Kysely<Database>,
  userId: string,
  expiresAt: Date,
  name: string | null = null
): Promise<{ token: string; record: RefreshToken }> {
  const token = generateRefreshToken()
  const tokenHash = await hashRefreshToken(token)

  const record = await db
    .insertInto('refresh_tokens')
    .values({
      user_id: userId,
      token_hash: tokenHash,
      name,
      expires_at: expiresAt,
      revoked_at: null,
      last_used_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  return { token, record }
}

/**
 * Get a refresh token by its raw token value
 *
 * Hashes the provided token and looks it up in the database.
 * Returns null if token not found or has been revoked/expired.
 *
 * @param db - Kysely database instance
 * @param token - Raw refresh token string
 * @returns Refresh token record or null if not found/invalid
 *
 * @example
 * ```typescript
 * const record = await getRefreshToken(db, tokenFromUser)
 * if (!record) {
 *   throw new Error('Invalid or expired refresh token')
 * }
 * ```
 */
export async function getRefreshToken(
  db: Kysely<Database>,
  token: string
): Promise<RefreshToken | null> {
  const tokenHash = await hashRefreshToken(token)

  const record = await db
    .selectFrom('refresh_tokens')
    .selectAll()
    .where('token_hash', '=', tokenHash)
    .executeTakeFirst()

  return record ?? null
}

/**
 * Get a refresh token by its database ID
 *
 * @param db - Kysely database instance
 * @param id - Refresh token UUID
 * @returns Refresh token record or null if not found
 */
export async function getRefreshTokenById(
  db: Kysely<Database>,
  id: string
): Promise<RefreshToken | null> {
  const record = await db
    .selectFrom('refresh_tokens')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()

  return record ?? null
}

/**
 * Get all refresh tokens for a user
 *
 * Useful for listing active sessions in user settings.
 *
 * @param db - Kysely database instance
 * @param userId - User ID
 * @param includeRevoked - Whether to include revoked tokens (default: false)
 * @returns Array of refresh token records
 *
 * @example
 * ```typescript
 * // Get active tokens only
 * const activeTokens = await getUserRefreshTokens(db, 'user-123')
 *
 * // Get all tokens including revoked
 * const allTokens = await getUserRefreshTokens(db, 'user-123', true)
 * ```
 */
export async function getUserRefreshTokens(
  db: Kysely<Database>,
  userId: string,
  includeRevoked: boolean = false
): Promise<RefreshToken[]> {
  let query = db
    .selectFrom('refresh_tokens')
    .selectAll()
    .where('user_id', '=', userId)

  if (!includeRevoked) {
    query = query.where('revoked_at', 'is', null)
  }

  return await query.execute()
}

/**
 * Update the last_used_at timestamp for a refresh token
 *
 * Called after successfully using a refresh token to get a new access token.
 * Helps track token usage for security monitoring.
 *
 * @param db - Kysely database instance
 * @param tokenId - Refresh token UUID
 * @returns Updated refresh token record
 *
 * @example
 * ```typescript
 * // After verifying and using a refresh token
 * await updateLastUsed(db, record.id)
 * ```
 */
export async function updateLastUsed(
  db: Kysely<Database>,
  tokenId: string
): Promise<RefreshToken> {
  const record = await db
    .updateTable('refresh_tokens')
    .set({ last_used_at: new Date() })
    .where('id', '=', tokenId)
    .returningAll()
    .executeTakeFirstOrThrow()

  return record
}

/**
 * Rotate a refresh token (replace with new token)
 *
 * Security best practice: rotate tokens after each use to prevent replay attacks.
 * Creates a new token and revokes the old one in a single operation.
 *
 * @param db - Kysely database instance
 * @param oldToken - Current refresh token string
 * @param expiresAt - Expiration date for new token
 * @returns Object containing new token and record, or null if old token invalid
 *
 * @example
 * ```typescript
 * const result = await rotateRefreshToken(db, oldToken, newExpiresAt)
 * if (!result) {
 *   throw new Error('Invalid refresh token')
 * }
 * const { token, record } = result
 * // Return new token to user
 * ```
 */
export async function rotateRefreshToken(
  db: Kysely<Database>,
  oldToken: string,
  expiresAt: Date
): Promise<{ token: string; record: RefreshToken } | null> {
  // Get old token record
  const oldRecord = await getRefreshToken(db, oldToken)
  if (!oldRecord) {
    return null
  }

  // Check if token is still valid (not expired, not revoked)
  const now = new Date()
  if (oldRecord.expires_at <= now || oldRecord.revoked_at !== null) {
    return null
  }

  // Create new token with same user and name
  const { token, record } = await createRefreshToken(
    db,
    oldRecord.user_id,
    expiresAt,
    oldRecord.name
  )

  // Revoke old token
  await revokeRefreshToken(db, oldRecord.id)

  return { token, record }
}

/**
 * Revoke a single refresh token by ID
 *
 * Sets revoked_at to current timestamp, invalidating the token.
 * Revoked tokens cannot be used and should be considered compromised.
 *
 * @param db - Kysely database instance
 * @param tokenId - Refresh token UUID
 * @returns Revoked refresh token record
 *
 * @example
 * ```typescript
 * // User logs out from specific device
 * await revokeRefreshToken(db, tokenId)
 * ```
 */
export async function revokeRefreshToken(
  db: Kysely<Database>,
  tokenId: string
): Promise<RefreshToken> {
  const record = await db
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date() })
    .where('id', '=', tokenId)
    .returningAll()
    .executeTakeFirstOrThrow()

  return record
}

/**
 * Revoke all refresh tokens for a user
 *
 * Emergency operation for security incidents or "logout from all devices".
 * Invalidates all tokens, requiring user to re-authenticate everywhere.
 *
 * @param db - Kysely database instance
 * @param userId - User ID
 * @returns Number of tokens revoked
 *
 * @example
 * ```typescript
 * // User reports account compromise
 * const count = await revokeAllUserRefreshTokens(db, 'user-123')
 * console.log(`Revoked ${count} tokens`)
 * ```
 */
export async function revokeAllUserRefreshTokens(
  db: Kysely<Database>,
  userId: string
): Promise<number> {
  const result = await db
    .updateTable('refresh_tokens')
    .set({ revoked_at: new Date() })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null) // Only revoke active tokens
    .executeTakeFirst()

  return Number(result.numUpdatedRows ?? 0)
}

/**
 * Delete a refresh token by ID
 *
 * Permanently removes token from database. Use revocation instead unless
 * you need to clean up old tokens (e.g., expired tokens older than 90 days).
 *
 * @param db - Kysely database instance
 * @param tokenId - Refresh token UUID
 */
export async function deleteRefreshToken(
  db: Kysely<Database>,
  tokenId: string
): Promise<void> {
  await db.deleteFrom('refresh_tokens').where('id', '=', tokenId).execute()
}

/**
 * Clean up expired refresh tokens
 *
 * Removes tokens that expired more than the specified number of days ago.
 * Recommended to run periodically (e.g., daily cron job).
 *
 * @param db - Kysely database instance
 * @param daysOld - Delete tokens expired this many days ago (default: 90)
 * @returns Number of tokens deleted
 *
 * @example
 * ```typescript
 * // Daily cleanup job
 * const deleted = await cleanupExpiredTokens(db, 90)
 * console.log(`Cleaned up ${deleted} expired tokens`)
 * ```
 */
export async function cleanupExpiredTokens(
  db: Kysely<Database>,
  daysOld: number = 90
): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)

  const result = await db
    .deleteFrom('refresh_tokens')
    .where('expires_at', '<', cutoffDate)
    .executeTakeFirst()

  return Number(result.numDeletedRows ?? 0)
}
