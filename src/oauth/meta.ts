/**
 * Meta (Facebook) OAuth Flow Implementation
 */

import { generateState } from 'arctic'
import { Facebook } from 'arctic'
import type { ClearAuthConfig, OAuthUserProfile, OAuthCallbackResult } from '../types.js'

export function createMetaProvider(config: ClearAuthConfig): Facebook {
  if (!config.oauth?.meta) {
    throw new Error('Meta OAuth is not configured')
  }
  const { clientId, clientSecret, redirectUri } = config.oauth.meta
  return new Facebook(clientId, clientSecret, redirectUri)
}

interface MetaUser {
  id: string
  name: string
  email?: string
  picture?: {
    data: {
      url: string
    }
  }
}

export async function generateMetaAuthUrl(config: ClearAuthConfig): Promise<{
  url: URL
  state: string
}> {
  const meta = createMetaProvider(config)
  const state = generateState()
  const url = meta.createAuthorizationURL(state, ['public_profile', 'email'])
  return { url, state }
}

export async function handleMetaCallback(
  config: ClearAuthConfig,
  code: string,
  storedState: string,
  returnedState: string
): Promise<OAuthCallbackResult> {
  if (storedState !== returnedState) {
    throw new Error('Invalid OAuth state parameter')
  }

  const meta = createMetaProvider(config)
  const tokens = await meta.validateAuthorizationCode(code)
  const accessToken = tokens.accessToken()

  const response = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`)

  if (!response.ok) {
    throw new Error(`Meta API error: ${response.status}`)
  }

  const user: MetaUser = await response.json()

  if (!user.email) {
    throw new Error('Meta account must have an email address')
  }

  const profile: OAuthUserProfile = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.picture?.data.url || null,
    email_verified: true // Meta verifies email
  }

  return { profile, accessToken }
}
