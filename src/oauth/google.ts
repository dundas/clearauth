/**
 * Google OAuth Flow Implementation
 *
 * Handles Google OAuth authentication using Arctic.
 * Implements authorization URL generation and callback handling with PKCE.
 */

import { generateState, generateCodeVerifier } from 'arctic'
import type { ClearAuthConfig, OAuthUserProfile, OAuthCallbackResult } from '../types.js'
import { createGoogleProvider } from './arctic-providers.js'

/**
 * Google API User Response
 */
interface GoogleUser {
  sub: string // User ID
  email: string
  email_verified: boolean
  name?: string
  picture?: string
  given_name?: string
  family_name?: string
}

/**
 * Generate Google OAuth authorization URL
 *
 * Creates the URL to redirect users to Google for authentication.
 * Includes state and code verifier parameters for CSRF protection and PKCE.
 *
 * @param config - Mech Auth configuration
 * @returns Object containing the authorization URL, state parameter, and code verifier
 *
 * @example
 * ```ts
 * const { url, state, codeVerifier } = await generateGoogleAuthUrl(config)
 * // Store state and codeVerifier in cookies for validation
 * // Redirect user to url
 * ```
 */
export async function generateGoogleAuthUrl(config: ClearAuthConfig): Promise<{
  url: URL
  state: string
  codeVerifier: string
}> {
  const google = createGoogleProvider(config)
  const state = generateState()
  const codeVerifier = generateCodeVerifier()

  // Request email and profile scopes
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile'])

  return { url, state, codeVerifier }
}

/**
 * Handle Google OAuth callback
 *
 * Validates the OAuth callback, exchanges the authorization code for tokens,
 * and fetches the user's profile from Google.
 *
 * @param config - Mech Auth configuration
 * @param code - Authorization code from Google
 * @param storedState - State parameter stored in cookie
 * @param returnedState - State parameter returned by Google
 * @param codeVerifier - Code verifier stored in cookie (for PKCE)
 * @returns OAuth callback result with user profile and tokens
 * @throws Error if state validation fails or API requests fail
 *
 * @example
 * ```ts
 * const result = await handleGoogleCallback(config, code, storedState, returnedState, codeVerifier)
 * // Use result.profile to create or update user
 * ```
 */
export async function handleGoogleCallback(
  config: ClearAuthConfig,
  code: string,
  storedState: string,
  returnedState: string,
  codeVerifier: string
): Promise<OAuthCallbackResult> {
  // Validate state parameter (CSRF protection)
  if (storedState !== returnedState) {
    throw new Error('Invalid OAuth state parameter')
  }

  const google = createGoogleProvider(config)

  // Exchange authorization code for access token (with PKCE)
  const tokens = await google.validateAuthorizationCode(code, codeVerifier)
  const accessToken = tokens.accessToken()

  // Try to get refresh token (Google only provides it on first auth or with access_type=offline)
  let refreshToken: string | undefined = undefined
  try {
    refreshToken = tokens.refreshToken()
  } catch {
    // Refresh token not provided - this is expected for web apps without offline access
    console.log('Google OAuth: No refresh token provided (not needed for session-based auth)')
  }

  // Fetch user profile from Google API
  const profile = await fetchGoogleUserProfile(accessToken)

  return {
    profile,
    accessToken,
    refreshToken,
  }
}

/**
 * Fetch user profile from Google API
 *
 * Retrieves the user's profile information from Google's userinfo endpoint.
 *
 * @param accessToken - Google access token
 * @returns Normalized user profile
 * @throws Error if API request fails
 *
 * @internal
 */
async function fetchGoogleUserProfile(accessToken: string): Promise<OAuthUserProfile> {
  // Fetch user profile from Google's userinfo endpoint
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status} ${response.statusText}`)
  }

  const user: GoogleUser = await response.json()

  if (!user.email) {
    throw new Error('No email found in Google account')
  }

  return {
    id: user.sub,
    email: user.email,
    name: user.name || null,
    avatar_url: user.picture || null,
    email_verified: user.email_verified,
  }
}
