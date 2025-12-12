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

import type { MechAuthConfig } from '../types.js'
import { registerUser, toPublicRegisterResult } from './register.js'
import { verifyEmail, resendVerificationEmail } from './verify-email.js'
import { loginUser, toPublicLoginResult } from './login.js'
import { requestPasswordReset, resetPassword } from './reset-password.js'
import {
  deleteSession,
  validateSession,
  parseCookies,
  createDeleteCookieHeader,
  createCookieHeader,
} from '../oauth/callbacks.js'
import { AuthError } from './utils.js'
import { toPublicUser } from '../database/schema.js'

/**
 * Parse JSON request body
 *
 * @param request - HTTP request
 * @returns Parsed JSON body
 * @internal
 */
async function parseJsonBody(request: Request): Promise<any> {
  try {
    return await request.json()
  } catch (error) {
    throw new AuthError('Invalid JSON body', 'INVALID_JSON', 400)
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
async function handleRegister(request: Request, config: MechAuthConfig): Promise<Response> {
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
async function handleVerifyEmail(request: Request, config: MechAuthConfig): Promise<Response> {
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
async function handleResendVerification(request: Request, config: MechAuthConfig): Promise<Response> {
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
async function handleLogin(request: Request, config: MechAuthConfig): Promise<Response> {
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
async function handleLogout(request: Request, config: MechAuthConfig): Promise<Response> {
  let sessionId: string | undefined
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
    }
  }

  const cookieName = config.session?.cookie?.name || 'session'
  const cookiePath = config.session?.cookie?.path ?? '/'

  if (sessionId) {
    await deleteSession(config.database, sessionId)
  }

  const deleteSessionCookie = createDeleteCookieHeader(cookieName, { path: cookiePath })
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
async function handleRequestReset(request: Request, config: MechAuthConfig): Promise<Response> {
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
async function handleResetPassword(request: Request, config: MechAuthConfig): Promise<Response> {
  const body = await parseJsonBody(request)
  const { token, password } = body

  if (!token || !password) {
    throw new AuthError('Token and password are required', 'MISSING_FIELDS', 400)
  }

  const result = await resetPassword(config.database, token, password, config.passwordHasher)
  return jsonResponse(result)
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
async function handleSession(request: Request, config: MechAuthConfig): Promise<Response> {
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
 * - POST /auth/register - Register new user
 * - POST /auth/verify-email - Verify email with token
 * - POST /auth/resend-verification - Resend verification email
 * - POST /auth/login - Login with email/password
 * - POST /auth/logout - Logout user
 * - POST /auth/request-reset - Request password reset
 * - POST /auth/reset-password - Reset password with token
 *
 * @param request - HTTP request
 * @param config - Mech Auth configuration
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
  config: MechAuthConfig
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const path = url.pathname.startsWith('/api/auth') ? url.pathname.replace(/^\/api/, '') : url.pathname

    // Handle GET /auth/session
    if (request.method === 'GET' && path === '/auth/session') {
      return await handleSession(request, config)
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

      default:
        return jsonResponse({ error: 'Not found' }, 404)
    }
  } catch (error) {
    return errorResponse(error)
  }
}
