/**
 * User Registration
 *
 * Handles user registration with email and password:
 * - Email and password validation
 * - Password hashing using Argon2id
 * - User creation with email_verified=false
 * - Email verification token generation
 * - Initial session creation
 */

import type { Kysely } from 'kysely'
import type { Database, User, NewUser, NewEmailVerificationToken } from '../database/schema.js'
import { createSession } from '../oauth/callbacks.js'
import type { RequestContext } from '../types.js'
import type { PasswordHasher } from '../password-hasher.js'
import { createPbkdf2PasswordHasher } from '../password-hasher.js'
import {
  isValidEmail,
  validatePassword,
  normalizeEmail,
  generateSecureToken,
  createAuthError,
} from './utils.js'

const defaultPasswordHasher = createPbkdf2PasswordHasher()

/**
 * Email verification token expiration (24 hours)
 */
const VERIFICATION_TOKEN_EXPIRY = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * Register a new user with email and password
 *
 * Creates a new user account with the provided email and password.
 * The password is hashed using Argon2id before storage.
 * An email verification token is generated and stored.
 * An initial session is created for the user.
 *
 * @param db - Kysely database instance
 * @param email - User's email address
 * @param password - User's password (plain text, will be hashed)
 * @param context - Optional request context (IP address, user agent)
 * @returns User record, session ID, and verification token
 * @throws {AuthError} If validation fails or user already exists
 *
 * @example
 * ```ts
 * const result = await registerUser(db, 'user@example.com', 'SecurePass123!', {
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...'
 * })
 * console.log(result.user.id, result.sessionId, result.verificationToken)
 * ```
 */
export async function registerUser(
  db: Kysely<Database>,
  email: string,
  password: string,
  context?: RequestContext,
  passwordHasher?: PasswordHasher
): Promise<{ user: User; sessionId: string; verificationToken: string }> {
  const hasher = passwordHasher ?? defaultPasswordHasher

  // Validate email
  if (!isValidEmail(email)) {
    throw createAuthError('Invalid email address', 'INVALID_EMAIL', 400)
  }

  // Validate password
  const passwordError = validatePassword(password)
  if (passwordError) {
    throw createAuthError(passwordError, 'INVALID_PASSWORD', 400)
  }

  // Normalize email
  const normalizedEmail = normalizeEmail(email)

  // Check if user already exists
  const existingUser = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', normalizedEmail)
    .executeTakeFirst()

  if (existingUser) {
    throw createAuthError('User with this email already exists', 'EMAIL_EXISTS', 409)
  }

  // Hash password
  const passwordHash = await hasher.hash(password)

  // Create user
  const newUser: NewUser = {
    email: normalizedEmail,
    email_verified: false,
    password_hash: passwordHash,
    github_id: null,
    google_id: null,
    name: null,
    avatar_url: null,
  }

  const user = await db.insertInto('users').values(newUser).returningAll().executeTakeFirstOrThrow()

  // Generate email verification token
  const verificationToken = generateSecureToken(32) // 256 bits of entropy
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY)

  const newToken: NewEmailVerificationToken = {
    token: verificationToken,
    user_id: user.id,
    email: normalizedEmail,
    expires_at: expiresAt,
  }

  await db.insertInto('email_verification_tokens').values(newToken).execute()

  // Create initial session
  const sessionId = await createSession(db, user.id, 2592000, {
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
  })

  return {
    user,
    sessionId,
    verificationToken,
  }
}

/**
 * Register user result type (for HTTP responses)
 */
export interface RegisterUserResult {
  user: {
    id: string
    email: string
    email_verified: boolean
    name: string | null
    avatar_url: string | null
    created_at: Date
  }
  sessionId: string
  verificationToken: string
}

/**
 * Convert registration result to public format
 *
 * Removes sensitive fields like password_hash and provider IDs.
 *
 * @param result - Registration result
 * @returns Public registration result
 * @internal
 */
export function toPublicRegisterResult(result: {
  user: User
  sessionId: string
  verificationToken: string
}): RegisterUserResult {
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
    verificationToken: result.verificationToken,
  }
}
