/**
 * GitHub OAuth Flow Implementation
 *
 * Handles GitHub OAuth authentication using Arctic.
 * Implements authorization URL generation and callback handling.
 */

import { generateState } from 'arctic'
import type { ClearAuthConfig, OAuthUserProfile, OAuthCallbackResult } from '../types.js'
import { createGitHubProvider } from './arctic-providers.js'

/**
 * GitHub API User Response
 */
interface GitHubUser {
  id: number
  login: string
  email: string | null
  name: string | null
  avatar_url: string | null
}

/**
 * GitHub API Email Response
 */
interface GitHubEmail {
  email: string
  primary: boolean
  verified: boolean
  visibility: string | null
}

/**
 * Generate GitHub OAuth authorization URL
 *
 * Creates the URL to redirect users to GitHub for authentication.
 * Includes a state parameter for CSRF protection.
 *
 * @param config - Mech Auth configuration
 * @returns Object containing the authorization URL and state parameter
 *
 * @example
 * ```ts
 * const { url, state } = await generateGitHubAuthUrl(config)
 * // Store state in cookie for validation
 * // Redirect user to url
 * ```
 */
export async function generateGitHubAuthUrl(config: ClearAuthConfig): Promise<{
  url: URL
  state: string
}> {
  const github = createGitHubProvider(config)
  const state = generateState()

  // Request user:email scope to access user's email addresses
  const url = github.createAuthorizationURL(state, ['user:email'])

  return { url, state }
}

/**
 * Handle GitHub OAuth callback
 *
 * Validates the OAuth callback, exchanges the authorization code for tokens,
 * and fetches the user's profile from GitHub.
 *
 * @param config - Mech Auth configuration
 * @param code - Authorization code from GitHub
 * @param storedState - State parameter stored in cookie
 * @param returnedState - State parameter returned by GitHub
 * @returns OAuth callback result with user profile and tokens
 * @throws Error if state validation fails or API requests fail
 *
 * @example
 * ```ts
 * const result = await handleGitHubCallback(config, code, storedState, returnedState)
 * // Use result.profile to create or update user
 * ```
 */
export async function handleGitHubCallback(
  config: ClearAuthConfig,
  code: string,
  storedState: string,
  returnedState: string
): Promise<OAuthCallbackResult> {
  // Validate state parameter (CSRF protection)
  if (storedState !== returnedState) {
    throw new Error('Invalid OAuth state parameter')
  }

  const github = createGitHubProvider(config)

  // Exchange authorization code for access token
  const tokens = await github.validateAuthorizationCode(code)
  const accessToken = tokens.accessToken()

  // Fetch user profile from GitHub API
  const profile = await fetchGitHubUserProfile(accessToken)

  return {
    profile,
    accessToken,
  }
}

/**
 * Fetch user profile from GitHub API
 *
 * Retrieves the user's profile information and email addresses from GitHub.
 * If the user's email is not public, fetches it from the emails endpoint.
 *
 * @param accessToken - GitHub access token
 * @returns Normalized user profile
 * @throws Error if API requests fail or email cannot be found
 *
 * @internal
 */
async function fetchGitHubUserProfile(accessToken: string): Promise<OAuthUserProfile> {
  // Fetch user profile
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Mech-Auth',
    },
  })

  if (!userResponse.ok) {
    throw new Error(`GitHub API error: ${userResponse.status} ${userResponse.statusText}`)
  }

  const user: GitHubUser = await userResponse.json()

  // If email is not public, fetch from emails endpoint
  let email = user.email
  let emailVerified = false

  if (!email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Mech-Auth',
      },
    })

    if (!emailsResponse.ok) {
      throw new Error(`GitHub API error (emails): ${emailsResponse.status} ${emailsResponse.statusText}`)
    }

    const emails: GitHubEmail[] = await emailsResponse.json()

    // Find primary verified email
    const primaryEmail = emails.find((e) => e.primary && e.verified)
    if (primaryEmail) {
      email = primaryEmail.email
      emailVerified = primaryEmail.verified
    } else {
      // Fall back to first verified email
      const verifiedEmail = emails.find((e) => e.verified)
      if (verifiedEmail) {
        email = verifiedEmail.email
        emailVerified = verifiedEmail.verified
      } else {
        throw new Error('No verified email found in GitHub account')
      }
    }
  }

  if (!email) {
    throw new Error('No email found in GitHub account')
  }

  return {
    id: user.id.toString(),
    email,
    name: user.name,
    avatar_url: user.avatar_url,
    email_verified: emailVerified,
  }
}
