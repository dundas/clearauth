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
import { Logger, getDefaultLogger } from '../logger.js'

// Re-export from canonical location so existing callers continue to work
export { validateSession, parseCookies } from '../utils/session.js'

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
 * Result of resolving an external OAuth identity to a ClearAuth user.
 * `linked` is returned only for an explicit link request or a verified-email
 * compatibility link made by the legacy wrapper.
 */
export type OAuthAccountOutcome = 'created' | 'linked' | 'returning'

export interface OAuthAccountResolution {
  user: User
  outcome: OAuthAccountOutcome
}

export interface ResolveOAuthAccountOptions {
  /** Link this identity to a known, authenticated ClearAuth user. */
  linkToUserId?: string
  /**
   * Transitional compatibility option for conventional providers. This must
   * never link an unverified provider email to an existing account.
   */
  allowVerifiedEmailLinking?: boolean
}

export class OAuthAccountLinkingRequiredError extends Error {
  constructor() {
    super('An OAuth account with this email must be linked by an authenticated user')
    this.name = 'OAuthAccountLinkingRequiredError'
  }
}

const LEGACY_PROVIDER_ID_COLUMNS: Record<string, keyof User & string> = {
  github: 'github_id',
  google: 'google_id',
  discord: 'discord_id',
  apple: 'apple_id',
  microsoft: 'microsoft_id',
  linkedin: 'linkedin_id',
  meta: 'meta_id',
}

function legacyProviderIdColumn(providerKey: string): (keyof User & string) | undefined {
  return LEGACY_PROVIDER_ID_COLUMNS[providerKey]
}

async function updateOAuthProfile(db: Kysely<Database>, user: User, profile: OAuthUserProfile): Promise<User> {
  return db
    .updateTable('users')
    .set({
      // An unverified provider address must not replace the account email.
      email: profile.email_verified === true ? profile.email : user.email,
      name: profile.name ?? user.name,
      avatar_url: profile.avatar_url ?? user.avatar_url,
      email_verified: profile.email_verified ?? user.email_verified,
    })
    .where('id', '=', user.id)
    .returningAll()
    .executeTakeFirstOrThrow()
}

async function createOAuthAccount(
  db: Kysely<Database>,
  providerKey: string,
  subject: string,
  userId: string
): Promise<boolean> {
  const inserted = await db
    .insertInto('oauth_accounts')
    .values({ provider_key: providerKey, subject, user_id: userId })
    .onConflict((conflict) => conflict.columns(['provider_key', 'subject']).doNothing())
    .returning(['id'])
    .executeTakeFirst()

  return Boolean(inserted)
}

async function findOAuthAccountUser(
  db: Kysely<Database>,
  providerKey: string,
  subject: string
): Promise<User | undefined> {
  const account = await db
    .selectFrom('oauth_accounts')
    .select(['user_id'])
    .where('provider_key', '=', providerKey)
    .where('subject', '=', subject)
    .executeTakeFirst()

  if (!account) return undefined

  return db.selectFrom('users').selectAll().where('id', '=', account.user_id).executeTakeFirst()
}

async function createNewOAuthUserWithAccount(
  db: Kysely<Database>,
  providerKey: string,
  profile: OAuthUserProfile,
  legacyColumn: (keyof User & string) | undefined,
): Promise<User> {
  return db.transaction().execute(async (transaction) => {
    const newUser: NewUser = {
      email: profile.email,
      email_verified: profile.email_verified ?? false,
      password_hash: null,
      ...(legacyColumn ? { [legacyColumn]: profile.id } : {}),
      name: profile.name,
      avatar_url: profile.avatar_url,
    }
    const user = await transaction.insertInto('users').values(newUser).returningAll().executeTakeFirstOrThrow()
    const inserted = await createOAuthAccount(transaction, providerKey, profile.id, user.id)
    if (!inserted) throw new Error('OAuth account subject already exists')
    return user
  })
}

async function linkOAuthAccountAndUpdateUser(
  db: Kysely<Database>,
  providerKey: string,
  profile: OAuthUserProfile,
  user: User,
  legacyColumn: (keyof User & string) | undefined,
  outcome: OAuthAccountOutcome,
): Promise<OAuthAccountResolution> {
  return db.transaction().execute(async (transaction) => {
    const inserted = await createOAuthAccount(transaction, providerKey, profile.id, user.id)
    if (!inserted) {
      const racedUser = await findOAuthAccountUser(transaction, providerKey, profile.id)
      if (!racedUser) throw new Error('Unable to create OAuth account identity')
      return { user: await updateOAuthProfile(transaction, racedUser, profile), outcome: 'returning' }
    }

    let linkedUser = user
    if (legacyColumn && linkedUser[legacyColumn] !== profile.id) {
      linkedUser = await transaction
        .updateTable('users')
        .set({ [legacyColumn]: profile.id })
        .where('id', '=', linkedUser.id)
        .returningAll()
        .executeTakeFirstOrThrow()
    }

    return { user: await updateOAuthProfile(transaction, linkedUser, profile), outcome }
  })
}

/**
 * Resolve an OAuth profile through the generic provider/subject account table.
 * Existing legacy provider columns are consulted only to backfill an account
 * during the additive migration period.
 */
export async function resolveOAuthAccount(
  db: Kysely<Database>,
  providerKey: string,
  profile: OAuthUserProfile,
  options: ResolveOAuthAccountOptions = {}
): Promise<OAuthAccountResolution> {
  const existingAccountUser = await findOAuthAccountUser(db, providerKey, profile.id)
  if (existingAccountUser) {
    return { user: await updateOAuthProfile(db, existingAccountUser, profile), outcome: 'returning' }
  }

  const legacyColumn = legacyProviderIdColumn(providerKey)
  if (legacyColumn) {
    const legacyUser = await db
      .selectFrom('users')
      .selectAll()
      .where(legacyColumn, '=', profile.id)
      .executeTakeFirst()

    if (legacyUser) {
      return linkOAuthAccountAndUpdateUser(db, providerKey, profile, legacyUser, legacyColumn, 'returning')
    }
  }

  let user: User | undefined
  let outcome: OAuthAccountOutcome

  if (options.linkToUserId) {
    user = await db.selectFrom('users').selectAll().where('id', '=', options.linkToUserId).executeTakeFirst()
    if (!user) throw new Error('OAuth account link target was not found')
    outcome = 'linked'
  } else {
    const userByEmail = await db.selectFrom('users').selectAll().where('email', '=', profile.email).executeTakeFirst()
    if (userByEmail) {
      if (!options.allowVerifiedEmailLinking || profile.email_verified !== true) {
        throw new OAuthAccountLinkingRequiredError()
      }
      user = userByEmail
      outcome = 'linked'
    } else {
      try {
        return { user: await createNewOAuthUserWithAccount(db, providerKey, profile, legacyColumn), outcome: 'created' }
      } catch (error) {
        const racedUser = await findOAuthAccountUser(db, providerKey, profile.id)
        if (racedUser) return { user: await updateOAuthProfile(db, racedUser, profile), outcome: 'returning' }

        const racedEmailUser = await db.selectFrom('users').selectAll().where('email', '=', profile.email).executeTakeFirst()
        if (!racedEmailUser) throw error
        if (!options.allowVerifiedEmailLinking || profile.email_verified !== true) {
          throw new OAuthAccountLinkingRequiredError()
        }
        return linkOAuthAccountAndUpdateUser(db, providerKey, profile, racedEmailUser, legacyColumn, 'linked')
      }
    }
  }

  return linkOAuthAccountAndUpdateUser(db, providerKey, profile, user, legacyColumn, outcome)
}

/**
 * Legacy compatibility wrapper. Conventional providers retain their existing
 * email-link behavior only where the upstream provider explicitly verifies the
 * email address. New integrations should use resolveOAuthAccount() and pass an
 * authenticated linkToUserId when linking an identity.
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
  const result = await resolveOAuthAccount(db, provider, profile, { allowVerifiedEmailLinking: true })
  return result.user
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
