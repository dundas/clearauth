/**
 * Session utilities
 *
 * Session validation and cookie parsing helpers. Kept in a shared utils module
 * so the main request handler (and other non-OAuth code) can import them without
 * creating a direct dependency on the OAuth callbacks module.
 */

import type { Kysely } from 'kysely'
import type { Database, User } from '../database/schema.js'
import { Logger, getDefaultLogger } from '../logger.js'

/**
 * Validate session
 *
 * Checks if a session exists and is not expired.
 *
 * @param db - Kysely database instance
 * @param sessionId - Session ID to validate
 * @param logger - Optional logger for error reporting
 * @returns User if session is valid, null otherwise
 */
export async function validateSession(
  db: Kysely<Database>,
  sessionId: string,
  logger: Logger = getDefaultLogger()
): Promise<User | null> {
  try {
    const result = await db
      .selectFrom('sessions')
      .innerJoin('users', 'users.id', 'sessions.user_id')
      .selectAll('users')
      .where('sessions.id', '=', sessionId)
      .where('sessions.expires_at', '>', new Date())
      .executeTakeFirst()

    return result || null
  } catch (error) {
    // Redact sessionId to avoid exposing sensitive tokens in logs
    const redactedSessionId = sessionId ? `${sessionId.slice(0, 8)}...` : 'unknown'
    logger.error('Session validation error', { error, sessionId: redactedSessionId })
    return null
  }
}

/**
 * Parse cookie header
 *
 * Parses the Cookie header and returns a map of cookie names to values.
 *
 * @param cookieHeader - Cookie header string
 * @returns Map of cookie names to values
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}

  if (!cookieHeader) {
    return cookies
  }

  const pairs = cookieHeader.split(';')
  for (const pair of pairs) {
    const trimmed = pair.trim()
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const name = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1)
    if (name) {
      try {
        cookies[name] = decodeURIComponent(value)
      } catch {
        cookies[name] = value
      }
    }
  }

  return cookies
}
