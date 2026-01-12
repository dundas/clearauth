/**
 * Apple OAuth Flow Implementation
 */

import { generateState } from 'arctic'
import type { ClearAuthConfig, OAuthUserProfile, OAuthCallbackResult } from '../types.js'
import { createAppleProvider } from './arctic-providers.js'
import { decodeIdToken } from 'arctic'

export async function generateAppleAuthUrl(config: ClearAuthConfig): Promise<{
  url: URL
  state: string
}> {
  const apple = createAppleProvider(config)
  const state = generateState()
  const url = apple.createAuthorizationURL(state, ['name', 'email'])
  return { url, state }
}

export async function handleAppleCallback(
  config: ClearAuthConfig,
  code: string,
  storedState: string,
  returnedState: string
): Promise<OAuthCallbackResult> {
  if (storedState !== returnedState) {
    throw new Error('Invalid OAuth state parameter')
  }

  const apple = createAppleProvider(config)
  const tokens = await apple.validateAuthorizationCode(code)
  const idToken = tokens.idToken()
  
  // Apple returns user info in the ID token
  const claims = decodeIdToken(idToken) as {
    sub: string
    email: string
    email_verified?: string | boolean
  }

  const profile: OAuthUserProfile = {
    id: claims.sub,
    email: claims.email,
    name: null, // Apple only sends name on first login in a separate 'user' parameter
    avatar_url: null,
    email_verified: claims.email_verified === 'true' || claims.email_verified === true
  }

  return { 
    profile, 
    accessToken: tokens.accessToken() 
  }
}
