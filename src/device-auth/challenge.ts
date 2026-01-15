/**
 * Challenge Generation and Verification
 *
 * Implements nonce-based challenge-response authentication for device keys.
 * Challenges are one-time use and expire after 10 minutes.
 */

import type { ClearAuthConfig } from '../types.js'
import type { ChallengeResponse } from './types.js'

/**
 * Challenge TTL in milliseconds (10 minutes)
 */
export const CHALLENGE_TTL_MS = 10 * 60 * 1000 // 600,000 ms = 10 minutes

/**
 * Generate a cryptographically secure random challenge
 *
 * Format: nonce|timestamp
 * - nonce: 64-character hex string (32 bytes of entropy)
 * - timestamp: Unix timestamp in milliseconds
 *
 * @returns Challenge object with challenge string and expiration info
 *
 * @example
 * ```ts
 * const challenge = generateChallenge()
 * // Returns: {
 * //   challenge: "a1b2c3...|1705326960000",
 * //   expiresIn: 600,
 * //   createdAt: "2026-01-15T12:16:00.000Z"
 * // }
 * ```
 */
export function generateChallenge(): ChallengeResponse {
  // Generate 32 bytes (256 bits) of cryptographically secure random data
  const nonceBytes = new Uint8Array(32)
  crypto.getRandomValues(nonceBytes)

  // Convert to hex string (64 characters)
  const nonce = Array.from(nonceBytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  // Current timestamp in milliseconds
  const timestamp = Date.now()
  const createdAt = new Date(timestamp)

  // Format: nonce|timestamp
  const challenge = `${nonce}|${timestamp}`

  return {
    challenge,
    expiresIn: CHALLENGE_TTL_MS / 1000, // Convert to seconds (600)
    createdAt: createdAt.toISOString(),
  }
}

/**
 * Extract nonce from challenge string
 *
 * @param challenge - Challenge string in format "nonce|timestamp"
 * @returns Nonce (64-character hex string) or null if invalid
 */
export function extractNonce(challenge: string): string | null {
  const parts = challenge.split('|')
  if (parts.length !== 2) {
    return null
  }

  const nonce = parts[0]
  if (!nonce || nonce.length !== 64 || !/^[0-9a-f]{64}$/.test(nonce)) {
    return null
  }

  return nonce
}

/**
 * Extract timestamp from challenge string
 *
 * @param challenge - Challenge string in format "nonce|timestamp"
 * @returns Timestamp in milliseconds or null if invalid
 */
export function extractTimestamp(challenge: string): number | null {
  const parts = challenge.split('|')
  if (parts.length !== 2) {
    return null
  }

  const timestamp = parseInt(parts[1] || '', 10)
  if (isNaN(timestamp) || timestamp <= 0) {
    return null
  }

  return timestamp
}

/**
 * Validate challenge format
 *
 * Checks if challenge string follows the correct format: nonce|timestamp
 * Does NOT check expiration or database existence.
 *
 * @param challenge - Challenge string to validate
 * @returns True if format is valid, false otherwise
 */
export function isValidChallengeFormat(challenge: string): boolean {
  if (!challenge || typeof challenge !== 'string') {
    return false
  }

  const nonce = extractNonce(challenge)
  const timestamp = extractTimestamp(challenge)

  return nonce !== null && timestamp !== null
}

/**
 * Store a challenge in the database
 *
 * @param config - ClearAuth configuration
 * @param challenge - Challenge string in format "nonce|timestamp"
 * @returns Promise that resolves when challenge is stored
 *
 * @throws Error if challenge format is invalid or database operation fails
 */
export async function storeChallenge(
  config: ClearAuthConfig,
  challenge: string
): Promise<void> {
  if (!isValidChallengeFormat(challenge)) {
    throw new Error('Invalid challenge format')
  }

  const nonce = extractNonce(challenge)
  const timestamp = extractTimestamp(challenge)

  if (!nonce || !timestamp) {
    throw new Error('Invalid challenge format')
  }

  const createdAt = new Date(timestamp)
  const expiresAt = new Date(timestamp + CHALLENGE_TTL_MS)

  await config.database
    .insertInto('challenges')
    .values({
      nonce,
      challenge,
      created_at: createdAt,
      expires_at: expiresAt,
    })
    .execute()
}

/**
 * Verify and consume a challenge
 *
 * Verifies that:
 * 1. Challenge exists in database
 * 2. Challenge has not expired
 * 3. Deletes challenge after verification (one-time use)
 *
 * @param config - ClearAuth configuration
 * @param challenge - Challenge string to verify
 * @returns True if challenge is valid and consumed, false otherwise
 *
 * @example
 * ```ts
 * const isValid = await verifyChallenge(config, "abc123...|1705326960000")
 * if (isValid) {
 *   // Challenge is valid and has been consumed
 * }
 * ```
 */
export async function verifyChallenge(
  config: ClearAuthConfig,
  challenge: string
): Promise<boolean> {
  if (!isValidChallengeFormat(challenge)) {
    return false
  }

  const nonce = extractNonce(challenge)
  if (!nonce) {
    return false
  }

  // Fetch challenge from database
  const storedChallenge = await config.database
    .selectFrom('challenges')
    .selectAll()
    .where('nonce', '=', nonce)
    .executeTakeFirst()

  if (!storedChallenge) {
    return false
  }

  // Check if challenge has expired
  const now = new Date()
  if (storedChallenge.expires_at <= now) {
    // Delete expired challenge
    await config.database.deleteFrom('challenges').where('nonce', '=', nonce).execute()
    return false
  }

  // Verify challenge string matches
  if (storedChallenge.challenge !== challenge) {
    return false
  }

  // Delete challenge (one-time use)
  await config.database.deleteFrom('challenges').where('nonce', '=', nonce).execute()

  return true
}

/**
 * Clean up expired challenges from the database
 *
 * This should be called periodically (e.g., via cron job) to prevent
 * the challenges table from growing indefinitely.
 *
 * @param config - ClearAuth configuration
 * @returns Number of challenges deleted
 *
 * @example
 * ```ts
 * const deleted = await cleanupExpiredChallenges(config)
 * console.log(`Deleted ${deleted} expired challenges`)
 * ```
 */
export async function cleanupExpiredChallenges(config: ClearAuthConfig): Promise<number> {
  const now = new Date()

  const result = await config.database
    .deleteFrom('challenges')
    .where('expires_at', '<=', now)
    .executeTakeFirst()

  return Number(result.numDeletedRows || 0)
}
