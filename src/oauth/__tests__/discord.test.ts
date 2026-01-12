import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateDiscordAuthUrl, handleDiscordCallback } from '../discord.js'
import type { ClearAuthConfig } from '../../types.js'
import * as arcticFactory from '../arctic-providers.js'

describe('Discord OAuth', () => {
  const mockConfig: ClearAuthConfig = {
    database: {} as any,
    secret: 'test-secret',
    baseUrl: 'https://example.com',
    oauth: {
      discord: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://example.com/auth/callback/discord'
      }
    }
  }

  it('should generate a valid authorization URL', async () => {
    const { url, state } = await generateDiscordAuthUrl(mockConfig)
    expect(url.toString()).toContain('discord.com/oauth2/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('scope')).toBe('identify email')
    expect(state).toBeDefined()
  })

  it('should handle callback and fetch user profile', async () => {
    const mockAccessToken = 'test-token'
    const mockUser = {
      id: '12345',
      username: 'testuser',
      email: 'test@example.com',
      avatar: 'avatar-hash',
      verified: true
    }

    // Mock Arctic Discord provider
    const mockDiscordProvider = {
      validateAuthorizationCode: vi.fn().mockResolvedValue({
        accessToken: () => mockAccessToken
      })
    }
    vi.spyOn(arcticFactory, 'createDiscordProvider').mockReturnValue(mockDiscordProvider as any)

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockUser
    })

    const result = await handleDiscordCallback(mockConfig, 'code', 'state', 'state')

    expect(result.profile.id).toBe('12345')
    expect(result.profile.email).toBe('test@example.com')
    expect(result.accessToken).toBe(mockAccessToken)
    expect(global.fetch).toHaveBeenCalledWith('https://discord.com/api/users/@me', expect.any(Object))
  })

  it('should throw error when email is not verified', async () => {
    const mockUser = {
      id: '12345',
      username: 'testuser',
      email: 'test@example.com',
      verified: false
    }

    const mockDiscordProvider = {
      validateAuthorizationCode: vi.fn().mockResolvedValue({
        accessToken: () => 'token'
      })
    }
    vi.spyOn(arcticFactory, 'createDiscordProvider').mockReturnValue(mockDiscordProvider as any)

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockUser
    })

    await expect(handleDiscordCallback(mockConfig, 'code', 'state', 'state'))
      .rejects.toThrow('Discord account must have a verified email')
  })
})
