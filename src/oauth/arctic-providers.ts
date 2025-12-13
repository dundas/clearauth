/**
 * Arctic OAuth Provider Factory
 *
 * Creates Arctic OAuth provider instances for GitHub and Google authentication.
 * Arctic is a lightweight OAuth library that works across all JavaScript runtimes
 * including Cloudflare Workers.
 *
 * @see https://arcticjs.dev/
 */

import { GitHub, Google } from 'arctic'
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
} {
  const providers: { github?: GitHub; google?: Google } = {}

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

  return providers
}
