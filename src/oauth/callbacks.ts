/**
 * OAuth Callback Utilities
 *
 * Shared logic for OAuth callback handling including:
 * - State parameter validation (CSRF protection)
 * - User upsert (create or update user by OAuth provider ID)
 * - Session creation after successful OAuth
 * - Error handling
 */

import { base64url } from 'oslo/encoding'
import type { Kysely } from 'kysely'
import type { Database, User, NewUser, NewSession } from '../database/schema.js'
import type { OAuthUserProfile, RequestContext, OAuthProvider } from '../types.js'

/**
 * Generate a secure random session ID
 * @param entropySize Number of bytes of entropy (default: 25 = 200 bits)
 * @internal
 */
function generateSessionId(entropySize: number = 25): string {
  const bytes = new Uint8Array(entropySize)
  crypto.getRandomValues(bytes)
  return base64url.encode(bytes).replace(/=/g, '')
}

/**
 * Upsert user from OAuth profile
 *
 * Creates a new user or updates an existing user based on the OAuth provider ID.
 * Uses github_id or google_id column to identify existing users.
 *
 * @param db - Kysely database instance
 * @param provider - OAuth provider name
 * @param profile - Normalized OAuth user profile
 * @returns User record from database
 *
 * @example
 * ```ts
 * const user = await upsertOAuthUser(db, 'github', profile)
 * ```
 */
export async function upsertOAuthUser(
  db: Kysely<Database>,
  provider: OAuthProvider,
  profile: OAuthUserProfile
): Promise<User> {
  const providerIdColumn = `${provider}_id` as keyof User & string

  // Check if user exists by provider ID
  const existingUser = await db
    .selectFrom('users')
    .selectAll()
    .where(providerIdColumn, '=', profile.id)
    .executeTakeFirst()

  if (existingUser) {
    // Update existing user with latest profile data
    const updatedUser = await db
      .updateTable('users')
      .set({
        email: profile.email,
        name: profile.name,
        avatar_url: profile.avatar_url,
        email_verified: profile.email_verified ?? existingUser.email_verified,
      })
      .where('id', '=', existingUser.id)
      .returningAll()
      .executeTakeFirstOrThrow()

    return updatedUser
  }

  // Check if user exists by email (linking accounts)
  const userByEmail = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', profile.email)
    .executeTakeFirst()

  if (userByEmail) {
    // Link OAuth provider to existing email account
    const updatedUser = await db
      .updateTable('users')
      .set({
        [providerIdColumn]: profile.id,
        name: profile.name || userByEmail.name,
        avatar_url: profile.avatar_url || userByEmail.avatar_url,
        email_verified: profile.email_verified || userByEmail.email_verified,
      })
      .where('id', '=', userByEmail.id)
      .returningAll()
      .executeTakeFirstOrThrow()

    return updatedUser
  }

  // Create new user
  const newUser: NewUser = {
    email: profile.email,
    email_verified: profile.email_verified ?? false,
    password_hash: null, // OAuth-only user
    [providerIdColumn]: profile.id,
    name: profile.name,
    avatar_url: profile.avatar_url,
  }

  const createdUser = await db
    .insertInto('users')
    .values(newUser)
    .returningAll()
    .executeTakeFirstOrThrow()

  return createdUser
}

/**
 * Create session for user
 *
 * Creates a new session record in the database and returns the session ID.
 * Sessions expire after the configured duration (default: 30 days).
 *
 * @param db - Kysely database instance
 * @param userId - User ID to create session for
 * @param expiresInSeconds - Session expiration time in seconds (default: 2592000 = 30 days)
 * @param context - Optional request context (IP address, user agent)
 * @returns Session ID
 *
 * @example
 * ```ts
 * const sessionId = await createSession(db, user.id, 2592000, { ipAddress, userAgent })
 * ```
 */
export async function createSession(
  db: Kysely<Database>,
  userId: string,
  expiresInSeconds: number = 2592000, // 30 days
  context?: RequestContext
): Promise<string> {
  // Generate secure random session ID
  const sessionId = generateSessionId(25) // 200 bits of entropy

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

  const newSession: NewSession = {
    id: sessionId,
    user_id: userId,
    expires_at: expiresAt,
    ip_address: context?.ipAddress || null,
    user_agent: context?.userAgent || null,
  }

  await db.insertInto('sessions').values(newSession).execute()

  return sessionId
}

/**
 * Validate session
 *
 * Checks if a session exists and is not expired.
 *
 * @param db - Kysely database instance
 * @param sessionId - Session ID to validate
 * @returns User if session is valid, null otherwise
 *
 * @example
 * ```ts
 * const user = await validateSession(db, sessionId)
 * if (!user) {
 *   return new Response('Unauthorized', { status: 401 })
 * }
 * ```
 */
export async function validateSession(
  db: Kysely<Database>,
  sessionId: string
): Promise<User | null> {
  const result = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .selectAll('users')
    .where('sessions.id', '=', sessionId)
    .where('sessions.expires_at', '>', new Date())
    .executeTakeFirst()

  return result || null
}

/**
 * Delete session (logout)
 *
 * Removes a session from the database.
 *
 * @param db - Kysely database instance
 * @param sessionId - Session ID to delete
 *
 * @example
 * ```ts
 * await deleteSession(db, sessionId)
 * ```
 */
export async function deleteSession(db: Kysely<Database>, sessionId: string): Promise<void> {
  await db.deleteFrom('sessions').where('id', '=', sessionId).execute()
}

/**
 * Delete all sessions for a user
 *
 * Removes all sessions for a specific user (useful for password changes, etc.)
 *
 * @param db - Kysely database instance
 * @param userId - User ID to delete sessions for
 *
 * @example
 * ```ts
 * await deleteAllUserSessions(db, userId)
 * ```
 */
export async function deleteAllUserSessions(
  db: Kysely<Database>,
  userId: string
): Promise<void> {
  await db.deleteFrom('sessions').where('user_id', '=', userId).execute()
}

/**
 * Clean up expired sessions
 *
 * Removes all expired sessions from the database.
 * This should be run periodically as a background job.
 *
 * @param db - Kysely database instance
 * @returns Number of sessions deleted
 *
 * @example
 * ```ts
 * const deleted = await cleanupExpiredSessions(db)
 * console.log(`Cleaned up ${deleted} expired sessions`)
 * ```
 */
export async function cleanupExpiredSessions(db: Kysely<Database>): Promise<number> {
  const result = await db
    .deleteFrom('sessions')
    .where('expires_at', '<=', new Date())
    .executeTakeFirst()

  return Number(result.numDeletedRows ?? 0)
}

/**
 * Parse cookie header
 *
 * Parses the Cookie header and returns a map of cookie names to values.
 *
 * @param cookieHeader - Cookie header string
 * @returns Map of cookie names to values
 *
 * @internal
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}

  if (!cookieHeader) {
    return cookies
  }

  const pairs = cookieHeader.split(';')
  for (const pair of pairs) {
    const [name, value] = pair.trim().split('=')
    if (name && value) {
      cookies[name] = decodeURIComponent(value)
    }
  }

  return cookies
}

/**
 * Create cookie header
 *
 * Creates a Set-Cookie header string with appropriate security attributes.
 *
 * @param name - Cookie name
 * @param value - Cookie value
 * @param options - Cookie options
 * @returns Set-Cookie header string
 *
 * @internal
 */
export function createCookieHeader(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
    path?: string
    domain?: string
    maxAge?: number
    expires?: Date
  } = {}
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]

  if (options.httpOnly !== false) {
    parts.push('HttpOnly')
  }

  if (options.secure !== false) {
    parts.push('Secure')
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`)
  }

  if (options.path) {
    parts.push(`Path=${options.path}`)
  }

  if (options.domain) {
    parts.push(`Domain=${options.domain}`)
  }

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`)
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }

  return parts.join('; ')
}

/**
 * Create delete cookie header
 *
 * Creates a Set-Cookie header that deletes a cookie.
 *
 * @param name - Cookie name
 * @param options - Cookie options (path, etc.)
 * @returns Set-Cookie header string
 *
 * @internal
 */
export function createDeleteCookieHeader(
  name: string,
  options: {
    path?: string
    domain?: string
  } = {}
): string {
  return createCookieHeader(name, '', {
    ...options,
    maxAge: 0,
    expires: new Date(0),
  })
}
