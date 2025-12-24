/**
 * OAuth HTTP Request Handler
 *
 * Handles OAuth-related HTTP requests for GitHub and Google authentication.
 * Provides login initiation and callback handling endpoints.
 */

import type { ClearAuthConfig, RequestContext } from '../types.js'
import { generateGitHubAuthUrl, handleGitHubCallback } from './github.js'
import { generateGoogleAuthUrl, handleGoogleCallback } from './google.js'
import { normalizeAuthPath } from '../utils/normalize-auth-path.js'
import {
  upsertOAuthUser,
  createSession,
  parseCookies,
  createCookieHeader,
  createDeleteCookieHeader,
} from './callbacks.js'

/**
 * Helper to create Headers with multiple Set-Cookie headers
 *
 * HTTP spec requires each cookie to be a separate Set-Cookie header entry,
 * not comma-separated in a single header.
 *
 * @param cookies - Array of cookie header strings
 * @param location - Redirect location URL
 * @returns Headers object with proper Set-Cookie headers
 */
function createHeadersWithCookies(cookies: string[], location?: string): Headers {
  const headers = new Headers()
  if (location) {
    headers.set('Location', location)
  }
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie)
  }
  return headers
}

/**
 * OAuth Request Handler
 *
 * Main handler for OAuth-related requests. Routes requests to appropriate
 * provider handlers based on URL path.
 *
 * @param request - HTTP request
 * @param config - Clear Auth configuration
 * @returns HTTP response
 *
 * @example
 * ```ts
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const url = new URL(request.url)
 *     if (url.pathname.startsWith('/auth/oauth/')) {
 *       return handleOAuthRequest(request, config)
 *     }
 *     // ... other routes
 *   }
 * }
 * ```
 */
export async function handleOAuthRequest(
  request: Request,
  config: ClearAuthConfig
): Promise<Response> {
  const url = new URL(request.url)
  const pathname = normalizeAuthPath(url.pathname)

  // GitHub OAuth routes
  if (pathname === '/auth/oauth/github' || pathname === '/auth/github/login') {
    return handleGitHubLogin(request, config)
  }

  if (pathname === '/auth/callback/github' || pathname === '/auth/github/callback') {
    return handleGitHubCallbackRequest(request, config)
  }

  // Google OAuth routes
  if (pathname === '/auth/oauth/google' || pathname === '/auth/google/login') {
    return handleGoogleLogin(request, config)
  }

  if (pathname === '/auth/callback/google' || pathname === '/auth/google/callback') {
    return handleGoogleCallbackRequest(request, config)
  }

  return new Response('Not Found', { status: 404 })
}

/**
 * Handle GitHub login initiation
 *
 * Generates GitHub OAuth URL and redirects user to GitHub for authentication.
 * Stores state parameter in cookie for CSRF protection.
 */
async function handleGitHubLogin(request: Request, config: ClearAuthConfig): Promise<Response> {
  try {
    const { url, state } = await generateGitHubAuthUrl(config)

    // Store state in cookie for validation
    const stateCookie = createCookieHeader('oauth_state', state, {
      httpOnly: true,
      secure: config.isProduction ?? true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    })

    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        'Set-Cookie': stateCookie,
      },
    })
  } catch (error) {
    console.error('GitHub login error:', error)
    return new Response('OAuth configuration error', { status: 500 })
  }
}

/**
 * Handle GitHub OAuth callback
 *
 * Validates OAuth callback, creates/updates user, and creates session.
 */
async function handleGitHubCallbackRequest(
  request: Request,
  config: ClearAuthConfig
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    // Check for OAuth errors
    if (error) {
      return new Response(`OAuth error: ${error}`, { status: 400 })
    }

    if (!code || !returnedState) {
      return new Response('Missing code or state parameter', { status: 400 })
    }

    // Get stored state from cookie
    const cookies = parseCookies(request.headers.get('Cookie') || '')
    const storedState = cookies['oauth_state']

    if (!storedState) {
      return new Response('Missing state cookie', { status: 400 })
    }

    // Handle OAuth callback
    const result = await handleGitHubCallback(config, code, storedState, returnedState)

    // Upsert user
    const user = await upsertOAuthUser(config.database, 'github', result.profile)

    // Create session
    const context = getRequestContext(request)
    const expiresInSeconds = config.session?.expiresIn ?? 2592000 // 30 days
    const sessionId = await createSession(config.database, user.id, expiresInSeconds, context)

    // Create session cookie
    const cookieName = config.session?.cookie?.name ?? 'session'
    const sessionCookie = createCookieHeader(cookieName, sessionId, {
      httpOnly: config.session?.cookie?.httpOnly ?? true,
      secure: config.session?.cookie?.secure ?? config.isProduction ?? true,
      sameSite: config.session?.cookie?.sameSite ?? 'lax',
      path: config.session?.cookie?.path ?? '/',
      domain: config.session?.cookie?.domain,
      maxAge: expiresInSeconds,
    })

    // Clear state cookie
    const deleteStateCookie = createDeleteCookieHeader('oauth_state', { path: '/' })

    // Redirect to success page or home
    const headers = createHeadersWithCookies(
      [sessionCookie, deleteStateCookie],
      '/' // TODO: Make this configurable
    )

    return new Response(null, {
      status: 302,
      headers,
    })
  } catch (error) {
    console.error('GitHub callback error:', error)
    const message = error instanceof Error ? error.message : 'OAuth callback failed'
    return new Response(message, { status: 400 })
  }
}

/**
 * Handle Google login initiation
 *
 * Generates Google OAuth URL and redirects user to Google for authentication.
 * Stores state and code verifier in cookies for CSRF protection and PKCE.
 */
async function handleGoogleLogin(request: Request, config: ClearAuthConfig): Promise<Response> {
  try {
    const { url, state, codeVerifier } = await generateGoogleAuthUrl(config)

    // Store state and code verifier in cookies for validation
    const stateCookie = createCookieHeader('oauth_state', state, {
      httpOnly: true,
      secure: config.isProduction ?? true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    })

    const verifierCookie = createCookieHeader('oauth_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: config.isProduction ?? true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    })

    const headers = createHeadersWithCookies([stateCookie, verifierCookie], url.toString())

    return new Response(null, {
      status: 302,
      headers,
    })
  } catch (error) {
    console.error('Google login error:', error)
    return new Response('OAuth configuration error', { status: 500 })
  }
}

/**
 * Handle Google OAuth callback
 *
 * Validates OAuth callback, creates/updates user, and creates session.
 */
async function handleGoogleCallbackRequest(
  request: Request,
  config: ClearAuthConfig
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    // Check for OAuth errors
    if (error) {
      return new Response(`OAuth error: ${error}`, { status: 400 })
    }

    if (!code || !returnedState) {
      return new Response('Missing code or state parameter', { status: 400 })
    }

    // Get stored state and code verifier from cookies
    const cookies = parseCookies(request.headers.get('Cookie') || '')
    const storedState = cookies['oauth_state']
    const codeVerifier = cookies['oauth_code_verifier']

    if (!storedState) {
      return new Response('Missing state cookie', { status: 400 })
    }

    if (!codeVerifier) {
      return new Response('Missing code verifier cookie', { status: 400 })
    }

    // Handle OAuth callback
    const result = await handleGoogleCallback(config, code, storedState, returnedState, codeVerifier)

    // Upsert user
    const user = await upsertOAuthUser(config.database, 'google', result.profile)

    // Create session
    const context = getRequestContext(request)
    const expiresInSeconds = config.session?.expiresIn ?? 2592000 // 30 days
    const sessionId = await createSession(config.database, user.id, expiresInSeconds, context)

    // Create session cookie
    const cookieName = config.session?.cookie?.name ?? 'session'
    const sessionCookie = createCookieHeader(cookieName, sessionId, {
      httpOnly: config.session?.cookie?.httpOnly ?? true,
      secure: config.session?.cookie?.secure ?? config.isProduction ?? true,
      sameSite: config.session?.cookie?.sameSite ?? 'lax',
      path: config.session?.cookie?.path ?? '/',
      maxAge: expiresInSeconds,
    })

    // Clear state and verifier cookies
    const deleteStateCookie = createDeleteCookieHeader('oauth_state', { path: '/' })
    const deleteVerifierCookie = createDeleteCookieHeader('oauth_code_verifier', { path: '/' })

    // Redirect to success page or home
    const headers = createHeadersWithCookies(
      [sessionCookie, deleteStateCookie, deleteVerifierCookie],
      '/' // TODO: Make this configurable
    )

    return new Response(null, {
      status: 302,
      headers,
    })
  } catch (error) {
    console.error('Google callback error:', error)
    const message = error instanceof Error ? error.message : 'OAuth callback failed'
    return new Response(message, { status: 400 })
  }
}

/**
 * Extract request context from HTTP request
 *
 * Extracts IP address and user agent from request headers.
 *
 * @internal
 */
function getRequestContext(request: Request): RequestContext {
  // Try various headers for IP address
  const headers = request.headers
  const ipAddress =
    headers.get('cf-connecting-ip') || // Cloudflare
    headers.get('x-real-ip') || // Nginx
    headers.get('x-forwarded-for')?.split(',')[0] || // Standard proxy header
    undefined

  const userAgent = headers.get('user-agent') || undefined

  return {
    ipAddress,
    userAgent,
  }
}
