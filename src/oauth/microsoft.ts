/**
 * Microsoft Entra ID OAuth Flow Implementation
 */

import { generateState, generateCodeVerifier } from 'arctic'
import type { ClearAuthConfig, OAuthUserProfile, OAuthCallbackResult } from '../types.js'
import { createMicrosoftProvider } from './arctic-providers.js'
import { decodeIdToken } from 'arctic'

export async function generateMicrosoftAuthUrl(config: ClearAuthConfig): Promise<{
  url: URL
  state: string
  codeVerifier: string
}> {
  const microsoft = createMicrosoftProvider(config)
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = microsoft.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email', 'User.Read'])
  return { url, state, codeVerifier }
}

export async function handleMicrosoftCallback(
  config: ClearAuthConfig,
  code: string,
  storedState: string,
  returnedState: string,
  codeVerifier: string
): Promise<OAuthCallbackResult> {
  if (storedState !== returnedState) {
    throw new Error('Invalid OAuth state parameter')
  }

  const microsoft = createMicrosoftProvider(config)
  const tokens = await microsoft.validateAuthorizationCode(code, codeVerifier)
  const idToken = tokens.idToken()
  
  const claims = decodeIdToken(idToken) as {
    sub: string
    email?: string
    preferred_username?: string
    name?: string
  }

  const profile: OAuthUserProfile = {
    id: claims.sub,
    email: claims.email || claims.preferred_username || '',
    name: claims.name || null,
    avatar_url: null,
    email_verified: true // Microsoft verified the email if it's in the token
  }

  if (!profile.email) {
    throw new Error('Microsoft account must have an email address')
  }

  return { 
    profile, 
    accessToken: tokens.accessToken() 
  }
}
