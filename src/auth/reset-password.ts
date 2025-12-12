/**
 * Password Reset
 *
 * Handles password reset flow:
 * - Password reset token generation and storage
 * - Token validation and expiration checking
 * - Password update with new hash
 * - Session invalidation for security
 */

import type { Kysely } from 'kysely'
import type { Database, NewPasswordResetToken } from '../database/schema.js'
import { deleteAllUserSessions } from '../oauth/callbacks.js'
import { generateSecureToken, normalizeEmail, validatePassword, createAuthError } from './utils.js'
import { isValidPasswordResetToken } from '../database/schema.js'
import type { PasswordHasher } from '../password-hasher.js'
import { createPbkdf2PasswordHasher } from '../password-hasher.js'

/**
 * Password reset token expiration (1 hour for security)
 */
const RESET_TOKEN_EXPIRY = 60 * 60 * 1000 // 1 hour in milliseconds

const defaultPasswordHasher = createPbkdf2PasswordHasher()

/**
 * Request password reset
 *
 * Generates a password reset token and stores it in the database.
 * The token expires after 1 hour for security.
 *
 * **IMPORTANT:** This function does NOT return the token to prevent email enumeration.
 * The token should be sent via email by the caller using an email service.
 * The function always returns success, even if the user doesn't exist.
 *
 * @param db - Kysely database instance
 * @param email - User's email address
 * @param onTokenGenerated - Optional callback to send the token via email
 * @returns Success status and email (for sending the token)
 *
 * @example
 * ```ts
 * const result = await requestPasswordReset(db, 'user@example.com', async (email, token) => {
 *   await sendEmail({
 *     to: email,
 *     subject: 'Password Reset',
 *     template: 'password-reset',
 *     data: { token, resetUrl: `https://example.com/reset-password?token=${token}` }
 *   })
 * })
 * // Always returns { success: true } regardless of whether user exists
 * ```
 */
export async function requestPasswordReset(
  db: Kysely<Database>,
  email: string,
  onTokenGenerated?: (email: string, token: string) => Promise<void>
): Promise<{ success: true; email: string }> {
  const normalizedEmail = normalizeEmail(email)

  // Look up user by email
  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'password_hash'])
    .where('email', '=', normalizedEmail)
    .executeTakeFirst()

  // If user doesn't exist, return success but don't send email
  // This prevents email enumeration attacks
  if (!user) {
    // Simulate work to prevent timing attacks
    await generateSecureToken(32)
    return { success: true, email: normalizedEmail }
  }

  // If user exists but has no password (OAuth-only), don't send reset email
  // Return success to avoid revealing whether email exists
  if (!user.password_hash) {
    return { success: true, email: normalizedEmail }
  }

  // Delete any existing reset tokens for this user
  await db.deleteFrom('password_reset_tokens').where('user_id', '=', user.id).execute()

  // Generate password reset token
  const resetToken = generateSecureToken(32) // 256 bits of entropy
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY)

  const newToken: NewPasswordResetToken = {
    token: resetToken,
    user_id: user.id,
    expires_at: expiresAt,
  }

  await db.insertInto('password_reset_tokens').values(newToken).execute()

  // Call the optional callback to send the token via email
  if (onTokenGenerated) {
    await onTokenGenerated(normalizedEmail, resetToken)
  }

  return {
    success: true,
    email: normalizedEmail,
  }
}

/**
 * Verify password reset token
 *
 * Checks if a password reset token is valid and not expired.
 * Does not consume the token.
 *
 * @param db - Kysely database instance
 * @param token - Password reset token
 * @returns Validation result with user ID if valid
 *
 * @example
 * ```ts
 * const result = await verifyResetToken(db, 'abc123...')
 * if (result.valid) {
 *   console.log('Token is valid for user:', result.userId)
 * }
 * ```
 */
export async function verifyResetToken(
  db: Kysely<Database>,
  token: string
): Promise<{ valid: boolean; userId?: string }> {
  if (!token || token.trim() === '') {
    return { valid: false }
  }

  // Look up token in database
  const tokenRecord = await db
    .selectFrom('password_reset_tokens')
    .selectAll()
    .where('token', '=', token)
    .executeTakeFirst()

  if (!tokenRecord) {
    return { valid: false }
  }

  // Check if token is expired
  if (!isValidPasswordResetToken(tokenRecord)) {
    // Delete expired token
    await db.deleteFrom('password_reset_tokens').where('token', '=', token).execute()
    return { valid: false }
  }

  return {
    valid: true,
    userId: tokenRecord.user_id,
  }
}

/**
 * Reset password using token
 *
 * Updates the user's password with a new hash.
 * Invalidates all existing sessions for security.
 * Deletes the used reset token.
 *
 * @param db - Kysely database instance
 * @param token - Password reset token
 * @param newPassword - New password (plain text, will be hashed)
 * @returns Success status
 * @throws {AuthError} If token is invalid, expired, or password is invalid
 *
 * @example
 * ```ts
 * const result = await resetPassword(db, 'abc123...', 'NewSecurePass123!')
 * if (result.success) {
 *   console.log('Password reset successful')
 * }
 * ```
 */
export async function resetPassword(
  db: Kysely<Database>,
  token: string,
  newPassword: string,
  passwordHasher?: PasswordHasher
): Promise<{ success: boolean }> {
  const hasher = passwordHasher ?? defaultPasswordHasher

  if (!token || token.trim() === '') {
    throw createAuthError('Reset token is required', 'INVALID_TOKEN', 400)
  }

  // Validate new password
  const passwordError = validatePassword(newPassword)
  if (passwordError) {
    throw createAuthError(passwordError, 'INVALID_PASSWORD', 400)
  }

  // Look up token in database
  const tokenRecord = await db
    .selectFrom('password_reset_tokens')
    .selectAll()
    .where('token', '=', token)
    .executeTakeFirst()

  if (!tokenRecord) {
    throw createAuthError('Invalid or expired reset token', 'INVALID_TOKEN', 400)
  }

  // Check if token is expired
  if (!isValidPasswordResetToken(tokenRecord)) {
    // Delete expired token
    await db.deleteFrom('password_reset_tokens').where('token', '=', token).execute()
    throw createAuthError('Reset token has expired', 'TOKEN_EXPIRED', 400)
  }

  // Hash new password
  const passwordHash = await hasher.hash(newPassword)

  // Update user's password
  await db
    .updateTable('users')
    .set({ password_hash: passwordHash })
    .where('id', '=', tokenRecord.user_id)
    .execute()

  // Delete used reset token
  await db.deleteFrom('password_reset_tokens').where('token', '=', token).execute()

  // Invalidate all sessions for security
  await deleteAllUserSessions(db, tokenRecord.user_id)

  return {
    success: true,
  }
}

/**
 * Clean up expired password reset tokens
 *
 * Removes all expired password reset tokens from the database.
 * This should be run periodically as a background job.
 *
 * @param db - Kysely database instance
 * @returns Number of tokens deleted
 *
 * @example
 * ```ts
 * const deleted = await cleanupExpiredResetTokens(db)
 * console.log(`Cleaned up ${deleted} expired reset tokens`)
 * ```
 */
export async function cleanupExpiredResetTokens(db: Kysely<Database>): Promise<number> {
  const result = await db
    .deleteFrom('password_reset_tokens')
    .where('expires_at', '<=', new Date())
    .executeTakeFirst()

  return Number(result.numDeletedRows ?? 0)
}
