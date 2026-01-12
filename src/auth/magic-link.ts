/**
 * Magic Link Authentication
 *
 * Handles passwordless authentication via email magic links:
 * - Token generation and storage
 * - Token validation and expiration checking
 * - User login with email verification
 * - One-time token consumption
 * - Email enumeration prevention
 */

import type { Kysely } from 'kysely'
import type { Database, User, NewMagicLinkToken } from '../database/schema.js'
import { isValidMagicLinkToken } from '../database/schema.js'
import { createSession } from '../oauth/callbacks.js'
import type { RequestContext } from '../types.js'
import { generateSecureToken, normalizeEmail, createAuthError } from './utils.js'

/**
 * Magic link token expiration (15 minutes for security)
 */
const MAGIC_LINK_TOKEN_EXPIRY = 15 * 60 * 1000 // 15 minutes in milliseconds

/**
 * Request magic link for passwordless login
 *
 * Generates a magic link token and stores it in the database.
 * The token expires after 15 minutes for security.
 *
 * **IMPORTANT:** This function does NOT return the token to prevent email enumeration.
 * The token should be sent via email by the caller using an email service.
 * The function always returns success, even if the user doesn't exist.
 *
 * **Login-only**: Magic links only work for existing users. New users must sign up
 * via the registration flow first.
 *
 * @param db - Kysely database instance
 * @param email - User's email address
 * @param returnTo - Optional URL to redirect to after login
 * @param onTokenGenerated - Optional callback to send the token via email
 * @returns Success status and email (for sending the token)
 *
 * @example
 * ```ts
 * const result = await requestMagicLink(db, 'user@example.com', '/dashboard', async (email, token, linkUrl) => {
 *   await sendEmail({
 *     to: email,
 *     subject: 'Sign in to your account',
 *     template: 'magic-link',
 *     data: { linkUrl }
 *   })
 * })
 * // Always returns { success: true } regardless of whether user exists
 * ```
 */
export async function requestMagicLink(
  db: Kysely<Database>,
  email: string,
  returnTo?: string | null,
  onTokenGenerated?: (email: string, token: string, linkUrl: string) => Promise<void>
): Promise<{ success: true; email: string }> {
  const normalizedEmail = normalizeEmail(email)

  // Look up user by email
  const user = await db
    .selectFrom('users')
    .select(['id', 'email'])
    .where('email', '=', normalizedEmail)
    .executeTakeFirst()

  // If user doesn't exist, return success but don't send email
  // This prevents email enumeration attacks
  if (!user) {
    // Simulate work to prevent timing attacks
    await generateSecureToken(32)
    return { success: true, email: normalizedEmail }
  }

  // Delete any existing magic link tokens for this user
  await db.deleteFrom('magic_link_tokens').where('user_id', '=', user.id).execute()

  // Generate magic link token
  const magicLinkToken = generateSecureToken(32) // 256 bits of entropy
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TOKEN_EXPIRY)

  const newToken: NewMagicLinkToken = {
    token: magicLinkToken,
    user_id: user.id,
    email: normalizedEmail,
    return_to: returnTo || null,
    expires_at: expiresAt,
  }

  await db.insertInto('magic_link_tokens').values(newToken).execute()

  // Call the optional callback to send the token via email
  if (onTokenGenerated) {
    // Construct the magic link URL (caller should provide base URL)
    const linkUrl = `/auth/magic-link/verify?token=${magicLinkToken}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`
    await onTokenGenerated(normalizedEmail, magicLinkToken, linkUrl)
  }

  return {
    success: true,
    email: normalizedEmail,
  }
}

/**
 * Consume magic link token and log user in
 *
 * Validates the token, creates a session, and optionally sets email_verified.
 * The token is deleted after successful consumption (one-time use).
 *
 * @param db - Kysely database instance
 * @param token - Magic link token
 * @param context - Optional request context (IP address, user agent)
 * @returns User record, session ID, and optional returnTo URL
 * @throws {AuthError} If token is invalid or expired
 *
 * @example
 * ```ts
 * const result = await consumeMagicLink(db, 'abc123...', {
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...'
 * })
 * console.log('User logged in:', result.user.id, result.sessionId)
 * if (result.returnTo) {
 *   // Redirect to returnTo URL
 * }
 * ```
 */
export async function consumeMagicLink(
  db: Kysely<Database>,
  token: string,
  context?: RequestContext
): Promise<{ user: User; sessionId: string; returnTo: string | null }> {
  if (!token || token.trim() === '') {
    throw createAuthError('Magic link token is required', 'INVALID_TOKEN', 400)
  }

  // Look up token in database
  const tokenRecord = await db
    .selectFrom('magic_link_tokens')
    .selectAll()
    .where('token', '=', token)
    .executeTakeFirst()

  if (!tokenRecord) {
    throw createAuthError('Invalid or expired magic link', 'INVALID_TOKEN', 400)
  }

  // Check if token is expired
  if (!isValidMagicLinkToken(tokenRecord)) {
    // Delete expired token
    await db.deleteFrom('magic_link_tokens').where('token', '=', token).execute()
    throw createAuthError('Magic link has expired', 'TOKEN_EXPIRED', 400)
  }

  // Get user
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', tokenRecord.user_id)
    .executeTakeFirst()

  if (!user) {
    // Clean up orphaned token
    await db.deleteFrom('magic_link_tokens').where('token', '=', token).execute()
    throw createAuthError('User not found', 'USER_NOT_FOUND', 404)
  }

  // Set email_verified = true (successfully receiving and clicking the link proves email ownership)
  if (!user.email_verified) {
    await db
      .updateTable('users')
      .set({ email_verified: true })
      .where('id', '=', user.id)
      .execute()

    // Update local user object
    user.email_verified = true
  }

  // Delete used magic link token (one-time use)
  await db.deleteFrom('magic_link_tokens').where('token', '=', token).execute()

  // Create new session
  const sessionId = await createSession(db, user.id, 2592000, {
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
  })

  return {
    user,
    sessionId,
    returnTo: tokenRecord.return_to,
  }
}

/**
 * Clean up expired magic link tokens
 *
 * Removes all expired magic link tokens from the database.
 * This should be run periodically as a background job.
 *
 * @param db - Kysely database instance
 * @returns Number of tokens deleted
 *
 * @example
 * ```ts
 * const deleted = await cleanupExpiredMagicLinkTokens(db)
 * console.log(`Cleaned up ${deleted} expired magic link tokens`)
 * ```
 */
export async function cleanupExpiredMagicLinkTokens(db: Kysely<Database>): Promise<number> {
  const result = await db
    .deleteFrom('magic_link_tokens')
    .where('expires_at', '<=', new Date())
    .executeTakeFirst()

  return Number(result.numDeletedRows ?? 0)
}
