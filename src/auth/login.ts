/**
 * User Login
 *
 * Handles user login with email and password:
 * - User lookup by email
 * - Password verification using Argon2id
 * - Session creation on successful login
 */

import type { Kysely } from 'kysely'
import type { Database, User } from '../database/schema.js'
import { createSession } from '../oauth/callbacks.js'
import type { RequestContext } from '../types.js'
import type { PasswordHasher } from '../password-hasher.js'
import { createPbkdf2PasswordHasher } from '../password-hasher.js'
import { normalizeEmail, createAuthError } from './utils.js'

const defaultPasswordHasher = createPbkdf2PasswordHasher()

/**
 * Login user with email and password
 *
 * Authenticates a user by verifying their email and password.
 * Creates a new session on successful login.
 *
 * @param db - Kysely database instance
 * @param email - User's email address
 * @param password - User's password (plain text)
 * @param context - Optional request context (IP address, user agent)
 * @returns User record and session ID if successful
 * @throws {AuthError} If credentials are invalid
 *
 * @example
 * ```ts
 * try {
 *   const result = await loginUser(db, 'user@example.com', 'SecurePass123!', {
 *     ipAddress: '192.168.1.1',
 *     userAgent: 'Mozilla/5.0...'
 *   })
 *   console.log('Login successful:', result.user.id, result.sessionId)
 * } catch (error) {
 *   console.error('Login failed:', error.message)
 * }
 * ```
 */
export async function loginUser(
  db: Kysely<Database>,
  email: string,
  password: string,
  context?: RequestContext,
  passwordHasher?: PasswordHasher
): Promise<{ user: User; sessionId: string }> {
  const hasher = passwordHasher ?? defaultPasswordHasher

  if (!email || !password) {
    throw createAuthError('Email and password are required', 'INVALID_CREDENTIALS', 401)
  }

  const normalizedEmail = normalizeEmail(email)

  // Look up user by email
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', normalizedEmail)
    .executeTakeFirst()

  if (!user) {
    // Generic error message to prevent email enumeration
    throw createAuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
  }

  // Check if user has a password set (OAuth-only users don't)
  if (!user.password_hash) {
    throw createAuthError(
      'This account uses social login. Please sign in with your social provider.',
      'NO_PASSWORD_SET',
      400
    )
  }

  // Verify password
  let isValidPassword: boolean
  try {
    isValidPassword = await hasher.verify(user.password_hash, password)
  } catch {
    throw createAuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
  }

  if (!isValidPassword) {
    throw createAuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
  }

  // Create new session
  const sessionId = await createSession(db, user.id, 2592000, {
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
  })

  return {
    user,
    sessionId,
  }
}

/**
 * Login result type (for HTTP responses)
 */
export interface LoginUserResult {
  user: {
    id: string
    email: string
    email_verified: boolean
    name: string | null
    avatar_url: string | null
    created_at: Date
  }
  sessionId: string
}

/**
 * Convert login result to public format
 *
 * Removes sensitive fields like password_hash and provider IDs.
 *
 * @param result - Login result
 * @returns Public login result
 * @internal
 */
export function toPublicLoginResult(result: { user: User; sessionId: string }): LoginUserResult {
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      email_verified: result.user.email_verified,
      name: result.user.name,
      avatar_url: result.user.avatar_url,
      created_at: result.user.created_at,
    },
    sessionId: result.sessionId,
  }
}
