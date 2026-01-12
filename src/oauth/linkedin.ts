/**
 * LinkedIn OAuth Flow Implementation
 */

import { generateState } from 'arctic'
import type { ClearAuthConfig, OAuthUserProfile, OAuthCallbackResult } from '../types.js'
import { createLinkedInProvider } from './arctic-providers.js'

interface LinkedInUser {
  sub: string
  name: string
  given_name: string
  family_name: string
  picture: string
  email: string
  email_verified: boolean
}

export async function generateLinkedInAuthUrl(config: ClearAuthConfig): Promise<{
  url: URL
  state: string
}> {
  const linkedin = createLinkedInProvider(config)
  const state = generateState()
  const url = linkedin.createAuthorizationURL(state, ['openid', 'profile', 'email'])
  return { url, state }
}

export async function handleLinkedInCallback(
  config: ClearAuthConfig,
  code: string,
  storedState: string,
  returnedState: string
): Promise<OAuthCallbackResult> {
  if (storedState !== returnedState) {
    throw new Error('Invalid OAuth state parameter')
  }

  const linkedin = createLinkedInProvider(config)
  const tokens = await linkedin.validateAuthorizationCode(code)
  const accessToken = tokens.accessToken()

  // LinkedIn OIDC userinfo endpoint
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.status}`)
  }

  const user: LinkedInUser = await response.json()

  const profile: OAuthUserProfile = {
    id: user.sub,
    email: user.email,
    name: user.name,
    avatar_url: user.picture || null,
    email_verified: user.email_verified
  }

  return { profile, accessToken }
}
