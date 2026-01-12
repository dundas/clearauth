/**
 * Arctic OAuth Provider Factory
 *
 * Creates Arctic OAuth provider instances for GitHub and Google authentication.
 * Arctic is a lightweight OAuth library that works across all JavaScript runtimes
 * including Cloudflare Workers.
 *
 * @see https://arcticjs.dev/
 */

import { GitHub, Google, Discord, Apple, MicrosoftEntraId, LinkedIn, Facebook } from 'arctic'
import type { ClearAuthConfig } from '../types.js'

/**
 * Create GitHub OAuth provider instance
 *
 * @param config - ClearAuth configuration
 * @returns Arctic GitHub provider instance
 * @throws Error if GitHub OAuth is not configured
 *
 * @example
 * ```ts
 * const github = createGitHubProvider(config)
 * const url = await github.createAuthorizationURL(state, { scopes: ['user:email'] })
 * ```
 */
export function createGitHubProvider(config: ClearAuthConfig): GitHub {
  if (!config.oauth?.github) {
    throw new Error('GitHub OAuth is not configured')
  }

  const { clientId, clientSecret, redirectUri } = config.oauth.github

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GitHub OAuth configuration is incomplete (missing clientId, clientSecret, or redirectUri)')
  }

  return new GitHub(clientId, clientSecret, redirectUri)
}

/**
 * Create Google OAuth provider instance
 *
 * @param config - ClearAuth configuration
 * @returns Arctic Google provider instance
 * @throws Error if Google OAuth is not configured
 *
 * @example
 * ```ts
 * const google = createGoogleProvider(config)
 * const url = await google.createAuthorizationURL(state, codeVerifier, { scopes: ['email', 'profile'] })
 * ```
 */
export function createGoogleProvider(config: ClearAuthConfig): Google {
  if (!config.oauth?.google) {
    throw new Error('Google OAuth is not configured')
  }

  const { clientId, clientSecret, redirectUri } = config.oauth.google

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth configuration is incomplete (missing clientId, clientSecret, or redirectUri)')
  }

  return new Google(clientId, clientSecret, redirectUri)
}

/**
 * Create Discord OAuth provider instance
 */
export function createDiscordProvider(config: ClearAuthConfig): Discord {
  if (!config.oauth?.discord) {
    throw new Error('Discord OAuth is not configured')
  }

  const { clientId, clientSecret, redirectUri } = config.oauth.discord

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Discord OAuth configuration is incomplete')
  }

  return new Discord(clientId, clientSecret, redirectUri)
}

/**
 * Create Apple OAuth provider instance
 */
export function createAppleProvider(config: ClearAuthConfig): Apple {
  if (!config.oauth?.apple) {
    throw new Error('Apple OAuth is not configured')
  }

  const { clientId, teamId, keyId, privateKey, redirectUri } = config.oauth.apple

  if (!clientId || !teamId || !keyId || !privateKey || !redirectUri) {
    throw new Error('Apple OAuth configuration is incomplete (missing clientId, teamId, keyId, privateKey, or redirectUri)')
  }

  const encoder = new TextEncoder()
  const privateKeyBytes = encoder.encode(privateKey)

  return new Apple(clientId, teamId, keyId, privateKeyBytes, redirectUri)
}

/**
 * Create Microsoft Entra ID OAuth provider instance
 */
export function createMicrosoftProvider(config: ClearAuthConfig): MicrosoftEntraId {
  if (!config.oauth?.microsoft) {
    throw new Error('Microsoft OAuth is not configured')
  }

  const { clientId, clientSecret, redirectUri } = config.oauth.microsoft as any
  const tenantId = (config.oauth.microsoft as any).tenantId ?? 'common'

  return new MicrosoftEntraId(tenantId, clientId, clientSecret, redirectUri)
}

/**
 * Create LinkedIn OAuth provider instance
 */
export function createLinkedInProvider(config: ClearAuthConfig): LinkedIn {
  if (!config.oauth?.linkedin) {
    throw new Error('LinkedIn OAuth is not configured')
  }

  const { clientId, clientSecret, redirectUri } = config.oauth.linkedin

  return new LinkedIn(clientId, clientSecret, redirectUri)
}

/**
 * Create Meta (Facebook) OAuth provider instance
 */
export function createMetaProvider(config: ClearAuthConfig): Facebook {
  if (!config.oauth?.meta) {
    throw new Error('Meta OAuth is not configured')
  }

  const { clientId, clientSecret, redirectUri } = config.oauth.meta

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Meta OAuth configuration is incomplete')
  }

  return new Facebook(clientId, clientSecret, redirectUri)
}

/**
 * Get configured OAuth providers
 *
 * Returns a map of provider names to Arctic provider instances.
 * Only includes providers that are configured.
 *
 * @param config - ClearAuth configuration
 * @returns Map of provider names to Arctic provider instances
 *
 * @example
 * ```ts
 * const providers = getConfiguredProviders(config)
 * if (providers.github) {
 *   // GitHub is configured
 * }
 * ```
 */
export function getConfiguredProviders(config: ClearAuthConfig): {
  github?: GitHub
  google?: Google
  discord?: Discord
  apple?: Apple
  microsoft?: MicrosoftEntraId
  linkedin?: LinkedIn
  meta?: Facebook
} {
  const providers: { 
    github?: GitHub; 
    google?: Google;
    discord?: Discord;
    apple?: Apple;
    microsoft?: MicrosoftEntraId;
    linkedin?: LinkedIn;
    meta?: Facebook;
  } = {}

  if (config.oauth?.github) {
    try {
      providers.github = createGitHubProvider(config)
    } catch (err) {
      console.error('Failed to create GitHub provider:', err)
    }
  }

  if (config.oauth?.google) {
    try {
      providers.google = createGoogleProvider(config)
    } catch (err) {
      console.error('Failed to create Google provider:', err)
    }
  }

  if (config.oauth?.discord) {
    try {
      providers.discord = createDiscordProvider(config)
    } catch (err) {
      console.error('Failed to create Discord provider:', err)
    }
  }

  if (config.oauth?.apple) {
    try {
      providers.apple = createAppleProvider(config)
    } catch (err) {
      console.error('Failed to create Apple provider:', err)
    }
  }

  if (config.oauth?.microsoft) {
    try {
      providers.microsoft = createMicrosoftProvider(config)
    } catch (err) {
      console.error('Failed to create Microsoft provider:', err)
    }
  }

  if (config.oauth?.linkedin) {
    try {
      providers.linkedin = createLinkedInProvider(config)
    } catch (err) {
      console.error('Failed to create LinkedIn provider:', err)
    }
  }

  if (config.oauth?.meta) {
    try {
      providers.meta = createMetaProvider(config)
    } catch (err) {
      console.error('Failed to create Meta provider:', err)
    }
  }

  return providers
}
