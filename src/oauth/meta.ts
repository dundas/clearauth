/**
 * Meta (Facebook) OAuth Flow Implementation
 */

import { generateState } from 'arctic'
import type { ClearAuthConfig, OAuthUserProfile, OAuthCallbackResult } from '../types.js'
import { createMetaProvider } from './arctic-providers.js'

  interface MetaUser {
  id: string
  name: string
  email?: string
  email_verified?: boolean
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

  const response = await fetch('https://graph.facebook.com/me?fields=id,name,email,email_verified,picture', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

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
    email_verified: user.email_verified ?? false
  }

  return { profile, accessToken }
}
