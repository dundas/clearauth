/**
 * Cookie Utilities
 *
 * Edge-compatible cookie parsing and creation utilities.
 * These utilities work in Cloudflare Workers, Vercel Edge, and other edge runtimes.
 *
 * @module utils/cookies
 */

/**
 * Parse a Cookie header into a Map of cookie names and values
 *
 * @param cookieHeader - The Cookie header string (from request.headers.get('Cookie'))
 * @returns Map of cookie name to value
 *
 * @example
 * ```typescript
 * const cookies = parseCookies(request.headers.get('Cookie'));
 * const sessionToken = cookies.get('session');
 * ```
 */
export function parseCookies(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>()

  if (!cookieHeader) {
    return cookies
  }

  for (const pair of cookieHeader.split(';')) {
    const trimmed = pair.trim()
    if (!trimmed) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue // Skip cookies without =

    const name = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()

    if (name) {
      cookies.set(name, value)
    }
  }

  return cookies
}

/**
 * Session cookie configuration options
 */
export interface SessionCookieConfig {
  /** Session configuration */
  session?: {
    /** Session expiration in seconds */
    expiresIn?: number
    /** Cookie settings */
    cookie?: {
      /** Cookie name (default: 'session') */
      name?: string
      /** SameSite attribute (default: 'lax') */
      sameSite?: 'strict' | 'lax' | 'none'
      /** Cookie path (default: '/') */
      path?: string
      /** Cookie domain for cross-subdomain sharing */
      domain?: string
    }
  }
  /** Production mode - enables Secure flag */
  isProduction?: boolean
}

/**
 * Create a Set-Cookie header value for a session cookie
 *
 * @param sessionId - The session ID to store in the cookie
 * @param config - Cookie configuration options
 * @returns Set-Cookie header value
 *
 * @example
 * ```typescript
 * const cookie = createSessionCookie(sessionId, {
 *   isProduction: true,
 *   session: {
 *     expiresIn: 60 * 60 * 24 * 7, // 7 days
 *     cookie: {
 *       name: 'session',
 *       domain: '.example.com',
 *     }
 *   }
 * });
 *
 * return new Response('OK', {
 *   headers: { 'Set-Cookie': cookie }
 * });
 * ```
 */
export function createSessionCookie(
  sessionId: string,
  config: SessionCookieConfig
): string {
  const { session, isProduction } = config

  const name = session?.cookie?.name ?? 'session'
  const path = session?.cookie?.path ?? '/'
  const sameSite = session?.cookie?.sameSite ?? 'lax'
  const domain = session?.cookie?.domain
  const maxAge = session?.expiresIn ?? 60 * 60 * 24 * 7 // Default: 7 days

  // Capitalize first letter of sameSite for cookie header
  const sameSiteFormatted = sameSite.charAt(0).toUpperCase() + sameSite.slice(1)

  const parts = [
    `${name}=${sessionId}`,
    `Path=${path}`,
    'HttpOnly',
    `SameSite=${sameSiteFormatted}`,
    `Max-Age=${maxAge}`,
  ]

  if (isProduction) {
    parts.push('Secure')
  }

  if (domain) {
    parts.push(`Domain=${domain}`)
  }

  return parts.join('; ')
}
