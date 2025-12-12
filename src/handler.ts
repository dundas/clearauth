/**
 * Unified HTTP request handler for LightAuth
 *
 * This module provides a single entry point for handling all authentication requests,
 * automatically routing to the appropriate handler (OAuth or email/password).
 *
 * @module handler
 */

import { handleOAuthRequest } from './oauth/handler.js'
import { handleAuthRequest } from './auth/handler.js'
import type { MechAuthConfig } from './types.js'
import { handleCorsPreflightRequest, addCorsHeaders } from './utils/cors.js'
import { normalizeAuthPath } from './utils/normalize-auth-path.js'

/**
 * Unified authentication request handler
 *
 * Automatically routes requests to the appropriate handler based on the URL path:
 * - OAuth routes: `/auth/oauth/*`, `/auth/github/*`, `/auth/google/*`, `/auth/callback/*`
 * - Email/password routes: All other `/auth/*` routes
 *
 * @param request - The HTTP request to handle
 * @param config - Mech auth configuration
 * @returns HTTP response
 *
 * @example
 * ```typescript
 * // Cloudflare Workers
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     const config: MechAuthConfig = {
 *       database: createMechKysely({ appId: env.MECH_APP_ID, apiKey: env.MECH_API_KEY }),
 *       secret: env.AUTH_SECRET,
 *       baseUrl: 'https://yourdomain.com',
 *       oauth: {
 *         github: {
 *           clientId: env.GITHUB_CLIENT_ID,
 *           clientSecret: env.GITHUB_CLIENT_SECRET,
 *           redirectUri: 'https://yourdomain.com/auth/callback/github',
 *         },
 *       },
 *     }
 *     return handleMechAuthRequest(request, config)
 *   },
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Next.js API route
 * import { handleMechAuthRequest } from 'lightauth'
 * import { config } from '@/lib/auth-config'
 *
 * export async function GET(request: Request) {
 *   return handleMechAuthRequest(request, config)
 * }
 *
 * export async function POST(request: Request) {
 *   return handleMechAuthRequest(request, config)
 * }
 * ```
 */
export async function handleMechAuthRequest(
  request: Request,
  config: MechAuthConfig
): Promise<Response> {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS' && config.cors) {
    return handleCorsPreflightRequest(request, config.cors)
  }

  const url = new URL(request.url)
  const pathname = url.pathname

  let response: Response

  // Determine which handler to use based on path
  if (isOAuthRoute(pathname)) {
    response = await handleOAuthRequest(request, config)
  } else if (isAuthRoute(pathname)) {
    response = await handleAuthRequest(request, config)
  } else {
    response = new Response(
      JSON.stringify({
        error: 'Not Found',
        message: `Authentication route not found: ${pathname}`,
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // Add CORS headers to response if configured
  if (config.cors) {
    response = addCorsHeaders(response, request, config.cors)
  }

  return response
}

/**
 * Check if the path is an OAuth route
 *
 * OAuth routes include:
 * - `/auth/oauth/github` - GitHub OAuth login
 * - `/auth/oauth/google` - Google OAuth login
 * - `/auth/github/login` - GitHub OAuth login (alternative)
 * - `/auth/google/login` - Google OAuth login (alternative)
 * - `/auth/callback/github` - GitHub OAuth callback
 * - `/auth/callback/google` - Google OAuth callback
 * - `/auth/github/callback` - GitHub OAuth callback (alternative)
 * - `/auth/google/callback` - Google OAuth callback (alternative)
 *
 * @param pathname - URL pathname to check
 * @returns True if the path is an OAuth route
 */
function isOAuthRoute(pathname: string): boolean {
  const normalizedPath = normalizeAuthPath(pathname)

  // OAuth-specific patterns
  const oauthPatterns = [
    /^\/auth\/oauth\/(github|google)$/,           // /auth/oauth/github, /auth/oauth/google
    /^\/auth\/(github|google)\/login$/,           // /auth/github/login, /auth/google/login
    /^\/auth\/callback\/(github|google)$/,        // /auth/callback/github, /auth/callback/google
    /^\/auth\/(github|google)\/callback$/,        // /auth/github/callback, /auth/google/callback
  ]

  return oauthPatterns.some(pattern => pattern.test(normalizedPath))
}

/**
 * Check if the path is an email/password auth route
 *
 * Email/password routes include:
 * - POST `/auth/register` - User registration
 * - POST `/auth/verify-email` - Email verification
 * - POST `/auth/resend-verification` - Resend verification email
 * - POST `/auth/login` - User login
 * - POST `/auth/logout` - User logout
 * - POST `/auth/request-reset` - Request password reset token
 * - POST `/auth/reset-password` - Reset password with token
 * - GET  `/auth/session` - Get current user session
 *
 * @param pathname - URL pathname to check
 * @returns True if the path is an auth route
 */
function isAuthRoute(pathname: string): boolean {
  const normalizedPath = normalizeAuthPath(pathname)

  // Email/password auth patterns
  const authPatterns = [
    /^\/auth\/session$/,
    /^\/auth\/register$/,
    /^\/auth\/verify-email$/,
    /^\/auth\/resend-verification$/,
    /^\/auth\/login$/,
    /^\/auth\/logout$/,
    /^\/auth\/request-reset$/,
    /^\/auth\/reset-password$/,
  ]

  return authPatterns.some(pattern => pattern.test(normalizedPath))
}

/**
 * Get a list of all supported routes
 *
 * Useful for debugging and documentation purposes.
 *
 * @returns Object containing OAuth and auth routes
 *
 * @example
 * ```typescript
 * const routes = getSupportedRoutes()
 * console.log('OAuth routes:', routes.oauth)
 * console.log('Auth routes:', routes.auth)
 * ```
 */
export function getSupportedRoutes() {
  return {
    oauth: [
      { method: 'GET', path: '/auth/oauth/github', description: 'Initiate GitHub OAuth flow' },
      { method: 'GET', path: '/auth/github/login', description: 'Initiate GitHub OAuth flow (alternative)' },
      { method: 'GET', path: '/auth/callback/github', description: 'GitHub OAuth callback' },
      { method: 'GET', path: '/auth/github/callback', description: 'GitHub OAuth callback (alternative)' },
      { method: 'GET', path: '/auth/oauth/google', description: 'Initiate Google OAuth flow' },
      { method: 'GET', path: '/auth/google/login', description: 'Initiate Google OAuth flow (alternative)' },
      { method: 'GET', path: '/auth/callback/google', description: 'Google OAuth callback' },
      { method: 'GET', path: '/auth/google/callback', description: 'Google OAuth callback (alternative)' },
    ],
    auth: [
      { method: 'GET', path: '/auth/session', description: 'Get current user session (from cookie)' },
      { method: 'POST', path: '/auth/register', description: 'User registration with email and password' },
      { method: 'POST', path: '/auth/verify-email', description: 'Verify email with token' },
      { method: 'POST', path: '/auth/resend-verification', description: 'Resend email verification token' },
      { method: 'POST', path: '/auth/login', description: 'User login with email and password' },
      { method: 'POST', path: '/auth/logout', description: 'User logout (delete session)' },
      { method: 'POST', path: '/auth/request-reset', description: 'Request password reset token' },
      { method: 'POST', path: '/auth/reset-password', description: 'Reset password with token' },
    ],
  }
}

/**
 * Health check endpoint
 *
 * Returns a simple health check response to verify the auth service is running.
 *
 * @returns HTTP response with health status
 *
 * @example
 * ```typescript
 * // In your handler
 * if (url.pathname === '/auth/health') {
 *   return healthCheck()
 * }
 * ```
 */
export function healthCheck(): Response {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'lightauth',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
