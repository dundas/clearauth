/**
 * Email/Password Authentication HTTP Handler
 *
 * Handles HTTP requests for email/password authentication:
 * - POST /auth/register - User registration
 * - POST /auth/verify-email - Email verification
 * - POST /auth/login - User login
 * - POST /auth/logout - Session deletion
 * - POST /auth/request-reset - Request password reset
 * - POST /auth/reset-password - Reset password with token
 */

import type { ClearAuthConfig } from '../types.js'
import { registerUser, toPublicRegisterResult } from './register.js'
import { verifyEmail, resendVerificationEmail } from './verify-email.js'
import { loginUser, toPublicLoginResult } from './login.js'
import { requestPasswordReset, resetPassword } from './reset-password.js'
import { requestMagicLink, consumeMagicLink } from './magic-link.js'
import {
  deleteSession,
  validateSession,
  parseCookies,
  createDeleteCookieHeader,
  createCookieHeader,
} from '../oauth/callbacks.js'
import { AuthError, isValidReturnTo } from './utils.js'
import { toPublicUser } from '../database/schema.js'

/**
 * Parse JSON request body
 *
 * This implementation uses request.text() + JSON.parse() instead of request.json()
 * to ensure compatibility with Cloudflare Pages Functions and other edge runtimes
 * where the request body stream may be consumed or locked.
 *
 * @param request - HTTP request
 * @returns Parsed JSON body
 * @throws {AuthError} If body is empty, already consumed, or contains invalid JSON
 * @internal
 */
async function parseJsonBody(request: Request): Promise<any> {
  try {
    // Check if body has already been consumed
    if (request.bodyUsed) {
      throw new AuthError('Request body has already been consumed', 'BODY_CONSUMED', 400)
    }

    // Read body as text first (more reliable across different runtimes)
    const bodyText = await request.text()

    // Check if body is empty
    if (!bodyText || !bodyText.trim()) {
      throw new AuthError('Request body is empty', 'EMPTY_BODY', 400)
    }

    // Parse JSON manually with better error messages
    try {
      return JSON.parse(bodyText)
    } catch (parseError) {
      throw new AuthError(
        `Invalid JSON in request body: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        'INVALID_JSON',
        400
      )
    }
  } catch (error) {
    // If it's already an AuthError, re-throw it
    if (error instanceof AuthError) {
      throw error
    }

    // Handle other errors (e.g., network issues, stream errors)
    throw new AuthError(
      `Failed to read request body: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'BODY_READ_ERROR',
      400
    )
  }
}

/**
 * Extract request context from headers
 *
 * @param request - HTTP request
 * @returns Request context (IP address, user agent)
 * @internal
 */
function getRequestContext(request: Request): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  }
}

/**
 * Create JSON response
 *
 * @param data - Response data
 * @param status - HTTP status code
 * @returns JSON response
 * @internal
 */
function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Create error response
 *
 * @param error - Error object
 * @returns JSON error response
 * @internal
 */
function errorResponse(error: any): Response {
  if (error instanceof AuthError) {
    return jsonResponse(
      {
        error: error.message,
        code: error.code,
      },
      error.statusCode
    )
  }

  // Unknown error
  console.error('Unexpected error:', error)
  return jsonResponse(
    {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    500
  )
}

/**
 * Handle POST /auth/register
 *
 * Register a new user with email and password.
 *
 * Request body:
 * ```json
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePass123!"
 * }
 * ```
 *
 * Response:
 * ```json
 * {
 *   "user": {
 *     "id": "uuid",
 *     "email": "user@example.com",
 *     "email_verified": false,
 *     "name": null,
 *     "avatar_url": null,
 *     "created_at": "2025-01-01T00:00:00.000Z"
 *   },
 *   "sessionId": "session_id",
 *   "verificationToken": "token"
 * }
 * ```
 */
async function handleRegister(request: Request, config: ClearAuthConfig): Promise<Response> {
  const body = await parseJsonBody(request)
  const { email, password } = body

  if (!email || !password) {
    throw new AuthError('Email and password are required', 'MISSING_FIELDS', 400)
  }

  const context = getRequestContext(request)
  const result = await registerUser(config.database, email, password, context, config.passwordHasher)
  const publicResult = toPublicRegisterResult(result)

  const cookieName = config.session?.cookie?.name ?? 'session'
  const expiresInSeconds = config.session?.expiresIn ?? 2592000
  const sessionCookie = createCookieHeader(cookieName, result.sessionId, {
    httpOnly: config.session?.cookie?.httpOnly ?? true,
    secure: config.session?.cookie?.secure ?? config.isProduction ?? true,
    sameSite: config.session?.cookie?.sameSite ?? 'lax',
    path: config.session?.cookie?.path ?? '/',
    domain: config.session?.cookie?.domain,
    maxAge: expiresInSeconds,
  })

  return new Response(JSON.stringify(publicResult), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie,
    },
  })
}

/**
 * Handle POST /auth/verify-email
 *
 * Verify user's email address with a token.
 *
 * Request body:
 * ```json
 * {
 *   "token": "verification_token"
 * }
 * ```
 *
 * Response:
 * ```json
 * {
 *   "success": true,
 *   "userId": "uuid"
 * }
 * ```
 */
async function handleVerifyEmail(request: Request, config: ClearAuthConfig): Promise<Response> {
  const body = await parseJsonBody(request)
  const { token } = body

  if (!token) {
    throw new AuthError('Verification token is required', 'MISSING_TOKEN', 400)
  }

  const result = await verifyEmail(config.database, token)
  return jsonResponse(result)
}

/**
 * Handle POST /auth/resend-verification
 *
 * Resend verification email.
 *
 * Request body:
 * ```json
 * {
 *   "email": "user@example.com"
 * }
 * ```
 *
 * Response:
 * ```json
 * {
 *   "token": "new_verification_token"
 * }
 * ```
 */
async function handleResendVerification(request: Request, config: ClearAuthConfig): Promise<Response> {
  const body = await parseJsonBody(request)
  const { email } = body

  if (!email) {
    throw new AuthError('Email is required', 'MISSING_EMAIL', 400)
  }

  const result = await resendVerificationEmail(config.database, email)
  return jsonResponse(result)
}

/**
 * Handle POST /auth/login
 *
 * Login user with email and password.
 *
 * Request body:
 * ```json
 * {
 *   "email": "user@example.com",
 *   "password": "SecurePass123!"
 * }
 * ```
 *
 * Response:
 * ```json
 * {
 *   "user": {
 *     "id": "uuid",
 *     "email": "user@example.com",
 *     "email_verified": true,
 *     "name": null,
 *     "avatar_url": null,
 *     "created_at": "2025-01-01T00:00:00.000Z"
 *   },
 *   "sessionId": "session_id"
 * }
 * ```
 */
async function handleLogin(request: Request, config: ClearAuthConfig): Promise<Response> {
  const body = await parseJsonBody(request)
  const { email, password } = body

  if (!email || !password) {
    throw new AuthError('Email and password are required', 'MISSING_FIELDS', 400)
  }

  const context = getRequestContext(request)
  const result = await loginUser(config.database, email, password, context, config.passwordHasher)
  const publicResult = toPublicLoginResult(result)

  const cookieName = config.session?.cookie?.name ?? 'session'
  const expiresInSeconds = config.session?.expiresIn ?? 2592000
  const sessionCookie = createCookieHeader(cookieName, result.sessionId, {
    httpOnly: config.session?.cookie?.httpOnly ?? true,
    secure: config.session?.cookie?.secure ?? config.isProduction ?? true,
    sameSite: config.session?.cookie?.sameSite ?? 'lax',
    path: config.session?.cookie?.path ?? '/',
    domain: config.session?.cookie?.domain,
    maxAge: expiresInSeconds,
  })

  return new Response(JSON.stringify(publicResult), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie,
    },
  })
}

/**
 * Handle POST /auth/logout
 *
 * Logout user by deleting their session.
 *
 * Request body:
 * ```json
 * {
 *   "sessionId": "session_id"
 * }
 * ```
 *
 * Response:
 * ```json
 * {
 *   "success": true
 * }
 * ```
 */
async function handleLogout(request: Request, config: ClearAuthConfig): Promise<Response> {
  let sessionId: string | undefined
  let usedCookieFallback = false
  try {
    const body = await request.json()
    sessionId = body?.sessionId
  } catch {
    // Allow empty/invalid JSON body for cookie-based logout
  }

  if (!sessionId) {
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader)
      const cookieName = config.session?.cookie?.name || 'session'
      sessionId = cookies[cookieName]
      usedCookieFallback = Boolean(sessionId)
    }
  }

  if (usedCookieFallback) {
    const origin = request.headers.get('origin')
    if (origin) {
      const requestOrigin = new URL(request.url).origin
      if (origin !== requestOrigin) {
        throw new AuthError('Forbidden', 'FORBIDDEN', 403)
      }
    }
  }

  const cookieName = config.session?.cookie?.name || 'session'
  const cookiePath = config.session?.cookie?.path ?? '/'
  const cookieDomain = config.session?.cookie?.domain

  if (sessionId) {
    await deleteSession(config.database, sessionId)
  }

  const deleteSessionCookie = createDeleteCookieHeader(cookieName, { path: cookiePath, domain: cookieDomain })
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': deleteSessionCookie,
    },
  })
}

/**
 * Handle POST /auth/request-reset
 *
 * Request password reset.
 *
 * **Security Note:** This endpoint always returns success, even if the email doesn't exist.
 * This prevents email enumeration attacks. The token is never returned in the response.
 *
 * Request body:
 * ```json
 * {
 *   "email": "user@example.com"
 * }
 * ```
 *
 * Response (always):
 * ```json
 * {
 *   "success": true,
 *   "message": "If your email is registered, you will receive a password reset link."
 * }
 * ```
 */
async function handleRequestReset(request: Request, config: ClearAuthConfig): Promise<Response> {
  const body = await parseJsonBody(request)
  const { email } = body

  if (!email) {
    throw new AuthError('Email is required', 'MISSING_EMAIL', 400)
  }

  // Note: onTokenGenerated callback should be provided by config for email sending
  // For now, we just store the token - users need to implement email sending
  await requestPasswordReset(config.database, email)

  // Always return success to prevent email enumeration
  return jsonResponse({
    success: true,
    message: 'If your email is registered, you will receive a password reset link.',
  })
}

/**
 * Handle POST /auth/reset-password
 *
 * Reset password with token.
 *
 * Request body:
 * ```json
 * {
 *   "token": "reset_token",
 *   "password": "NewSecurePass123!"
 * }
 * ```
 *
 * Response:
 * ```json
 * {
 *   "success": true
 * }
 * ```
 */
async function handleResetPassword(request: Request, config: ClearAuthConfig): Promise<Response> {
  const body = await parseJsonBody(request)
  const { token, password, newPassword } = body
  // Backward compatibility: Accept both 'password' (canonical) and 'newPassword' (deprecated)
  // TODO: Remove 'newPassword' support in v2.0.0
  const resolvedPassword = password ?? newPassword

  if (!token || !resolvedPassword) {
    throw new AuthError('Token and password are required', 'MISSING_FIELDS', 400)
  }

  const result = await resetPassword(config.database, token, resolvedPassword, config.passwordHasher)
  return jsonResponse(result)
}

/**
 * Handle POST /auth/request-magic-link
 *
 * Request a magic link for passwordless login.
 *
 * **Security Note:** This endpoint always returns success, even if the email doesn't exist.
 * This prevents email enumeration attacks.
 *
 * Request body:
 * ```json
 * {
 *   "email": "user@example.com",
 *   "returnTo": "/dashboard"
 * }
 * ```
 *
 * Response (always):
 * ```json
 * {
 *   "success": true,
 *   "message": "If your email is registered, you will receive a magic link to sign in."
 * }
 * ```
 */
async function handleRequestMagicLink(request: Request, config: ClearAuthConfig): Promise<Response> {
  const body = await parseJsonBody(request)
  const { email, returnTo } = body

  if (!email) {
    throw new AuthError('Email is required', 'MISSING_EMAIL', 400)
  }

  // Validate returnTo if provided
  if (returnTo && !isValidReturnTo(returnTo, config.baseUrl)) {
    throw new AuthError('Invalid returnTo URL', 'INVALID_RETURN_TO', 400)
  }

  // Pass email callback from config
  await requestMagicLink(config.database, email, returnTo, config.email?.sendMagicLink)

  // Always return success to prevent email enumeration
  return jsonResponse({
    success: true,
    message: 'If your email is registered, you will receive a magic link to sign in.',
  })
}

/**
 * Handle GET /auth/magic-link/verify
 *
 * Verify magic link token and log user in with HTTP redirect.
 *
 * Query parameters:
 * - token: Magic link token (required)
 * - returnTo: URL to redirect to after login (optional)
 *
 * Success: 302 redirect to returnTo (or default)
 * Error: 400/404 with JSON error
 */
async function handleVerifyMagicLink(request: Request, config: ClearAuthConfig): Promise<Response> {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const returnTo = url.searchParams.get('returnTo')

  if (!token) {
    throw new AuthError('Magic link token is required', 'MISSING_TOKEN', 400)
  }

  const context = getRequestContext(request)
  const result = await consumeMagicLink(config.database, token, context)

  // Determine redirect URL
  let redirectUrl = '/'
  if (returnTo && isValidReturnTo(returnTo, config.baseUrl)) {
    redirectUrl = returnTo
  } else if (result.returnTo && isValidReturnTo(result.returnTo, config.baseUrl)) {
    redirectUrl = result.returnTo
  }

  // Create session cookie
  const cookieName = config.session?.cookie?.name ?? 'session'
  const expiresInSeconds = config.session?.expiresIn ?? 2592000
  const sessionCookie = createCookieHeader(cookieName, result.sessionId, {
    httpOnly: config.session?.cookie?.httpOnly ?? true,
    secure: config.session?.cookie?.secure ?? config.isProduction ?? true,
    sameSite: config.session?.cookie?.sameSite ?? 'lax',
    path: config.session?.cookie?.path ?? '/',
    domain: config.session?.cookie?.domain,
    maxAge: expiresInSeconds,
  })

  // HTTP 302 redirect with session cookie
  return new Response(null, {
    status: 302,
    headers: {
      'Location': redirectUrl,
      'Set-Cookie': sessionCookie,
    },
  })
}

/**
 * Handle GET /auth/session
 *
 * Get current session/user from cookie.
 *
 * Response (authenticated):
 * ```json
 * {
 *   "user": {
 *     "id": "uuid",
 *     "email": "user@example.com",
 *     "email_verified": true,
 *     "name": "User Name",
 *     "avatar_url": "https://...",
 *     "created_at": "2025-01-01T00:00:00.000Z"
 *   }
 * }
 * ```
 *
 * Response (not authenticated):
 * ```json
 * {
 *   "user": null
 * }
 * ```
 */
async function handleSession(request: Request, config: ClearAuthConfig): Promise<Response> {
  // Get session ID from cookie
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) {
    return jsonResponse({ user: null })
  }

  const cookies = parseCookies(cookieHeader)
  const sessionId = cookies[config.session?.cookie?.name || 'session']

  if (!sessionId) {
    return jsonResponse({ user: null })
  }

  // Validate session
  const user = await validateSession(config.database, sessionId)

  if (!user) {
    return jsonResponse({ user: null })
  }

  return jsonResponse({ user: toPublicUser(user) })
}

/**
 * Main authentication request handler
 *
 * Routes incoming requests to the appropriate handler based on the URL path.
 *
 * Supported routes:
 * - GET  /auth/session - Get current user session
 * - GET  /auth/magic-link/verify - Verify magic link and redirect
 * - POST /auth/register - Register new user
 * - POST /auth/verify-email - Verify email with token
 * - POST /auth/resend-verification - Resend verification email
 * - POST /auth/login - Login with email/password
 * - POST /auth/logout - Logout user
 * - POST /auth/request-reset - Request password reset
 * - POST /auth/reset-password - Reset password with token
 * - POST /auth/request-magic-link - Request magic link for passwordless login
 *
 * @param request - HTTP request
 * @param config - Clear Auth configuration
 * @returns HTTP response
 *
 * @example
 * ```ts
 * const response = await handleAuthRequest(request, config)
 * return response
 * ```
 */
export async function handleAuthRequest(
  request: Request,
  config: ClearAuthConfig
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const path = url.pathname.startsWith('/api/auth') ? url.pathname.replace(/^\/api/, '') : url.pathname

    // Handle GET requests
    if (request.method === 'GET') {
      if (path === '/auth/session') {
        return await handleSession(request, config)
      }
      if (path === '/auth/magic-link/verify') {
        return await handleVerifyMagicLink(request, config)
      }
      return jsonResponse({ error: 'Not found' }, 404)
    }

    // Only handle POST requests for other routes
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    // Route to appropriate handler
    switch (path) {
      case '/auth/register':
        return await handleRegister(request, config)

      case '/auth/verify-email':
        return await handleVerifyEmail(request, config)

      case '/auth/resend-verification':
        return await handleResendVerification(request, config)

      case '/auth/login':
        return await handleLogin(request, config)

      case '/auth/logout':
        return await handleLogout(request, config)

      case '/auth/request-reset':
        return await handleRequestReset(request, config)

      case '/auth/reset-password':
        return await handleResetPassword(request, config)

      case '/auth/request-magic-link':
        return await handleRequestMagicLink(request, config)

      default:
        return jsonResponse({ error: 'Not found' }, 404)
    }
  } catch (error) {
    return errorResponse(error)
  }
}
