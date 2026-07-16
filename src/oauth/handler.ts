/**
 * OAuth HTTP Request Handler
 *
 * Handles OAuth-related HTTP requests for various providers.
 * Provides login initiation and callback handling endpoints.
 */

import type { ClearAuthConfig, RequestContext } from '../types.js'
import { issueTokenPair } from '../jwt/issue-token-pair.js'
import { generateGitHubAuthUrl, handleGitHubCallback } from './github.js'
import { generateGoogleAuthUrl, handleGoogleCallback } from './google.js'
import { generateDiscordAuthUrl, handleDiscordCallback } from './discord.js'
import { generateAppleAuthUrl, handleAppleCallback } from './apple.js'
import { generateMicrosoftAuthUrl, handleMicrosoftCallback } from './microsoft.js'
import { generateLinkedInAuthUrl, handleLinkedInCallback } from './linkedin.js'
import { generateMetaAuthUrl, handleMetaCallback } from './meta.js'
import { normalizeAuthPath } from '../utils/normalize-auth-path.js'
import {
  upsertOAuthUser,
  createSession,
  parseCookies,
  createCookieHeader,
  createDeleteCookieHeader,
} from './callbacks.js'
import {
  createOAuthTransaction,
  createOAuthTransactionStore,
  getOAuthTransactionCookieName,
  parseOAuthTransactionState,
} from './transactions.js'

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
 * Helper to handle generic OAuth login initiation
 *
 * @param config - ClearAuth configuration
 * @param providerName - Human-readable provider name for logging
 * @param authUrlGenerator - Function to generate authorization URL and state
 */
async function handleOAuthLogin(
  config: ClearAuthConfig,
  providerKey: string,
  providerName: string,
  authUrlGenerator: (config: ClearAuthConfig) => Promise<{ url: URL; state: string; codeVerifier?: string }>
): Promise<Response> {
  try {
    const { url, state, codeVerifier } = await authUrlGenerator(config)
    const redirectUri = getRedirectUri(config, providerKey)
    const prepared = await createOAuthTransaction({ providerKey, redirectUri, codeVerifier })
    const store = createOAuthTransactionStore(config.database)
    await store.create(prepared.transaction)
    url.searchParams.set('state', prepared.state)

    const cookieName = getOAuthTransactionCookieName(providerKey, prepared.id)
    const cookies = [createCookieHeader(cookieName, prepared.browserBindingSecret, {
      httpOnly: true,
      secure: config.isProduction ?? true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    })]

    const headers = createHeadersWithCookies(cookies, url.toString())
    return new Response(null, { status: 302, headers })
  } catch (error) {
    console.error(providerName + ' login error:', error) // nosemgrep
    return new Response('OAuth configuration error', { status: 500 })
  }
}

/**
 * Helper to handle generic OAuth callback
 *
 * @param request - Incoming HTTP request
 * @param config - ClearAuth configuration
 * @param providerName - Provider key for upsertOAuthUser (e.g., 'github', 'discord')
 * @param callbackHandler - Function to exchange code for profile
 */
async function handleOAuthCallbackRequest(
  request: Request,
  config: ClearAuthConfig,
  providerName: string,
  callbackHandler: (config: ClearAuthConfig, code: string, storedState: string, returnedState: string, codeVerifier?: string) => Promise<any>
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      return new Response(`OAuth error: ${error}`, { status: 400 })
    }

    if (!code || !returnedState) {
      return new Response('Missing code or state parameter', { status: 400 })
    }

    const stateReference = parseOAuthTransactionState(returnedState)
    if (!stateReference) {
      return new Response('Invalid OAuth state parameter', { status: 400 })
    }

    const cookies = parseCookies(request.headers.get('Cookie') || '')
    const bindingCookieName = getOAuthTransactionCookieName(providerName, stateReference.id)
    const browserBindingSecret = cookies[bindingCookieName]
    if (!browserBindingSecret) {
      return new Response('Invalid OAuth callback', { status: 400 })
    }

    const transaction = await createOAuthTransactionStore(config.database).validateAndConsume(stateReference.id, {
      returnedState,
      providerKey: providerName,
      redirectUri: getRedirectUri(config, providerName),
      browserBindingSecret,
      now: new Date(),
    })
    if (!transaction) {
      return new Response('Invalid OAuth callback', {
        status: 400,
        headers: createHeadersWithCookies([createDeleteCookieHeader(bindingCookieName, { path: '/' })]),
      })
    }

    // Provider callbacks retain their state-equality guard; the transaction store performed the real validation.
    const result = await callbackHandler(config, code, returnedState, returnedState, transaction.code_verifier ?? undefined)
    const user = await upsertOAuthUser(config.database, providerName as any, result.profile)
    const context = getRequestContext(request)
    const expiresInSeconds = config.session?.expiresIn ?? 2592000 // 30 days
    const sessionId = await createSession(config.database, user.id, expiresInSeconds, context)

    const cookieName = config.session?.cookie?.name ?? 'session'
    const sessionCookie = createCookieHeader(cookieName, sessionId, {
      httpOnly: config.session?.cookie?.httpOnly ?? true,
      secure: config.session?.cookie?.secure ?? config.isProduction ?? true,
      sameSite: config.session?.cookie?.sameSite ?? 'lax',
      path: config.session?.cookie?.path ?? '/',
      domain: config.session?.cookie?.domain,
      maxAge: expiresInSeconds,
    })

    const deleteCookies = [createDeleteCookieHeader(bindingCookieName, { path: '/' })]

    const additionalCookies: string[] = []
    if (config.jwt) {
      const tokens = await issueTokenPair(config.database, user, config.jwt)
      const jwtCookieBase = {
        httpOnly: true,
        secure: config.session?.cookie?.secure ?? config.isProduction ?? true,
        sameSite: config.session?.cookie?.sameSite ?? 'lax',
        path: config.session?.cookie?.path ?? '/',
        domain: config.session?.cookie?.domain,
      } as const
      additionalCookies.push(createCookieHeader('jwt_access_token', tokens.accessToken, {
        ...jwtCookieBase,
        maxAge: tokens.expiresIn,
      }))
      additionalCookies.push(createCookieHeader('jwt_refresh_token', tokens.refreshToken, {
        ...jwtCookieBase,
        maxAge: tokens.refreshTokenExpiresIn,
      }))
    }

    const headers = createHeadersWithCookies([sessionCookie, ...additionalCookies, ...deleteCookies], '/')
    return new Response(null, { status: 302, headers })
  } catch (error) {
    console.error(providerName + ' callback error:', error) // nosemgrep
    return new Response('OAuth callback failed', { status: 400 })
  }
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
 */
export async function handleOAuthRequest(
  request: Request,
  config: ClearAuthConfig
): Promise<Response> {
  const url = new URL(request.url)
  const pathname = normalizeAuthPath(url.pathname)

  // GitHub
  if (pathname === '/auth/oauth/github' || pathname === '/auth/github/login') {
    return handleOAuthLogin(config, 'github', 'GitHub', generateGitHubAuthUrl)
  }
  if (pathname === '/auth/callback/github' || pathname === '/auth/github/callback') {
    return handleOAuthCallbackRequest(request, config, 'github', handleGitHubCallback)
  }

  // Google
  if (pathname === '/auth/oauth/google' || pathname === '/auth/google/login') {
    return handleOAuthLogin(config, 'google', 'Google', generateGoogleAuthUrl)
  }
  if (pathname === '/auth/callback/google' || pathname === '/auth/google/callback') {
    return handleOAuthCallbackRequest(request, config, 'google', (c, code, s, r, v) => handleGoogleCallback(c, code, s, r, v!))
  }

  // Discord
  if (pathname === '/auth/oauth/discord' || pathname === '/auth/discord/login') {
    return handleOAuthLogin(config, 'discord', 'Discord', generateDiscordAuthUrl)
  }
  if (pathname === '/auth/callback/discord' || pathname === '/auth/discord/callback') {
    return handleOAuthCallbackRequest(request, config, 'discord', handleDiscordCallback)
  }

  // Apple
  if (pathname === '/auth/oauth/apple' || pathname === '/auth/apple/login') {
    return handleOAuthLogin(config, 'apple', 'Apple', generateAppleAuthUrl)
  }
  if (pathname === '/auth/callback/apple' || pathname === '/auth/apple/callback') {
    return handleOAuthCallbackRequest(request, config, 'apple', handleAppleCallback)
  }

  // Microsoft
  if (pathname === '/auth/oauth/microsoft' || pathname === '/auth/microsoft/login') {
    return handleOAuthLogin(config, 'microsoft', 'Microsoft', generateMicrosoftAuthUrl)
  }
  if (pathname === '/auth/callback/microsoft' || pathname === '/auth/microsoft/callback') {
    return handleOAuthCallbackRequest(request, config, 'microsoft', (c, code, s, r, v) => handleMicrosoftCallback(c, code, s, r, v!))
  }

  // LinkedIn
  if (pathname === '/auth/oauth/linkedin' || pathname === '/auth/linkedin/login') {
    return handleOAuthLogin(config, 'linkedin', 'LinkedIn', generateLinkedInAuthUrl)
  }
  if (pathname === '/auth/callback/linkedin' || pathname === '/auth/linkedin/callback') {
    return handleOAuthCallbackRequest(request, config, 'linkedin', handleLinkedInCallback)
  }

  // Meta
  if (pathname === '/auth/oauth/meta' || pathname === '/auth/meta/login') {
    return handleOAuthLogin(config, 'meta', 'Meta', generateMetaAuthUrl)
  }
  if (pathname === '/auth/callback/meta' || pathname === '/auth/meta/callback') {
    return handleOAuthCallbackRequest(request, config, 'meta', handleMetaCallback)
  }

  return new Response('Not Found', { status: 404 })
}

function getRedirectUri(config: ClearAuthConfig, providerKey: string): string {
  const provider = config.oauth?.[providerKey as keyof NonNullable<ClearAuthConfig['oauth']>]
  if (!provider) throw new Error(`OAuth provider ${providerKey} is not configured`)
  return provider.redirectUri
}

/**
 * Extract request context from HTTP request
 *
 * Extracts IP address and user agent from request headers.
 *
 * @internal
 */
function getRequestContext(request: Request): RequestContext {
  const headers = request.headers
  const ipAddress =
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0] ||
    undefined

  const userAgent = headers.get('user-agent') || undefined

  return { ipAddress, userAgent }
}
