/**
 * Session Validation Utilities
 *
 * Edge-compatible session validation functions that work without native dependencies.
 * These utilities can be used in Cloudflare Workers, Vercel Edge, and other edge runtimes.
 *
 * @module session/validate
 */

import type { Kysely } from 'kysely'
import type { Database, Session, PublicUser } from '../database/schema.js'
import { parseCookies } from '../utils/cookies.js'

/**
 * Result of session validation
 */
export interface ValidateSessionResult {
  /** Public user data (no sensitive fields) */
  user: PublicUser
  /** Session data */
  session: Session
}

/**
 * Validate a session token and return the associated user
 *
 * This function is edge-compatible and can be used in middleware to validate
 * session cookies before processing requests.
 *
 * @param sessionToken - The session token from cookie
 * @param db - Kysely database instance
 * @returns User and session if valid, null otherwise
 *
 * @example
 * ```typescript
 * import { validateSession, parseCookies, createMechKysely } from 'clearauth/edge';
 *
 * // In Cloudflare Workers middleware
 * const cookies = parseCookies(request.headers.get('Cookie'));
 * const sessionToken = cookies.get('session');
 *
 * if (sessionToken) {
 *   const db = createMechKysely({ appId, apiKey });
 *   const result = await validateSession(sessionToken, db);
 *
 *   if (result) {
 *     // User is authenticated
 *     console.log('User:', result.user.email);
 *   }
 * }
 * ```
 */
export async function validateSession(
  sessionToken: string,
  db: Kysely<Database>
): Promise<ValidateSessionResult | null> {
  // Empty token is invalid
  if (!sessionToken) {
    return null
  }

  // Look up session in database
  const session = await db
    .selectFrom('sessions')
    .selectAll()
    .where('id', '=', sessionToken)
    .executeTakeFirst()

  if (!session) {
    return null
  }

  // Check if session is expired
  const expiresAt = session.expires_at instanceof Date
    ? session.expires_at
    : new Date(session.expires_at)

  if (expiresAt <= new Date()) {
    return null
  }

  // Look up user
  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'email_verified', 'name', 'avatar_url', 'created_at'])
    .where('id', '=', session.user_id)
    .executeTakeFirst()

  if (!user) {
    return null
  }

  // Return public user data (no password_hash or other sensitive fields)
  return {
    user: {
      id: user.id,
      email: user.email,
      email_verified: user.email_verified,
      name: user.name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    },
    session,
  }
}

/**
 * Options for getSessionFromCookie
 */
export interface GetSessionFromCookieOptions {
  /** Cookie name to read session from (default: 'session') */
  cookieName?: string
}

/**
 * Get session from a request's Cookie header
 *
 * Convenience function that combines cookie parsing and session validation.
 * Useful for middleware that needs to validate authentication on every request.
 *
 * @param request - The HTTP request object
 * @param db - Kysely database instance
 * @param options - Optional configuration
 * @returns User and session if valid, null otherwise
 *
 * @example
 * ```typescript
 * import { getSessionFromCookie, createMechKysely } from 'clearauth/edge';
 *
 * // In Cloudflare Workers
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const db = createMechKysely({ appId: env.MECH_APP_ID, apiKey: env.MECH_API_KEY });
 *     const session = await getSessionFromCookie(request, db);
 *
 *     if (!session) {
 *       return new Response('Unauthorized', { status: 401 });
 *     }
 *
 *     return new Response(`Hello, ${session.user.email}!`);
 *   }
 * }
 * ```
 */
export async function getSessionFromCookie(
  request: Request,
  db: Kysely<Database>,
  options?: GetSessionFromCookieOptions
): Promise<ValidateSessionResult | null> {
  const cookieName = options?.cookieName ?? 'session'
  const cookieHeader = request.headers.get('Cookie')

  if (!cookieHeader) {
    return null
  }

  const cookies = parseCookies(cookieHeader)
  const sessionToken = cookies.get(cookieName)

  if (!sessionToken) {
    return null
  }

  return validateSession(sessionToken, db)
}
