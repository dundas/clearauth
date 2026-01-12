/**
 * Discord OAuth Flow Implementation
 */

import { generateState } from 'arctic'
import type { ClearAuthConfig, OAuthUserProfile, OAuthCallbackResult } from '../types.js'
import { createDiscordProvider } from './arctic-providers.js'

interface DiscordUser {
  id: string
  username: string
  email: string | null
  avatar: string | null
  verified: boolean
}

export async function generateDiscordAuthUrl(config: ClearAuthConfig): Promise<{
  url: URL
  state: string
}> {
  const discord = createDiscordProvider(config)
  const state = generateState()
  const url = discord.createAuthorizationURL(state, {
    scopes: ['identify', 'email']
  })
  return { url, state }
}

export async function handleDiscordCallback(
  config: ClearAuthConfig,
  code: string,
  storedState: string,
  returnedState: string
): Promise<OAuthCallbackResult> {
  if (storedState !== returnedState) {
    throw new Error('Invalid OAuth state parameter')
  }

  const discord = createDiscordProvider(config)
  const tokens = await discord.validateAuthorizationCode(code)
  const accessToken = tokens.accessToken()

  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Discord API error: ${response.status}`)
  }

  const user: DiscordUser = await response.json()

  if (!user.email || !user.verified) {
    throw new Error('Discord account must have a verified email')
  }

  const profile: OAuthUserProfile = {
    id: user.id,
    email: user.email,
    name: user.username,
    avatar_url: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
    email_verified: user.verified
  }

  return { profile, accessToken }
}
