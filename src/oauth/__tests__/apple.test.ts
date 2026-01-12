import { describe, it, expect, vi } from 'vitest'
import { generateAppleAuthUrl, handleAppleCallback } from '../apple.js'
import type { ClearAuthConfig } from '../../types.js'
import * as arcticFactory from '../arctic-providers.js'

describe('Apple OAuth', () => {
  const mockConfig: ClearAuthConfig = {
    database: {} as any,
    secret: 'test-secret',
    baseUrl: 'https://example.com',
    oauth: {
      apple: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        teamId: 'team-id',
        keyId: 'key-id',
        privateKey: 'private-key',
        redirectUri: 'https://example.com/auth/callback/apple'
      }
    }
  }

  it('should generate a valid authorization URL', async () => {
    const { url, state } = await generateAppleAuthUrl(mockConfig)
    expect(url.toString()).toContain('appleid.apple.com/auth/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('scope')).toBe('name email')
    expect(state).toBeDefined()
  })

  it('should handle callback and return profile from ID token', async () => {
    const mockIdToken = 'mock-id-token'
    const mockClaims = {
      sub: 'apple-user-123',
      email: 'user@example.com',
      email_verified: 'true'
    }

    // Mock Arctic provider
    const mockAppleProvider = {
      validateAuthorizationCode: vi.fn().mockResolvedValue({
        idToken: () => mockIdToken,
        accessToken: () => 'access-token'
      })
    }
    vi.spyOn(arcticFactory, 'createAppleProvider').mockReturnValue(mockAppleProvider as any)
    
    // Mock decodeIdToken which is used in handleAppleCallback
    // We need to import it to mock it if it was exported from a module, 
    // but handleAppleCallback imports it from 'arctic'.
    // Since it's a named import, we might need to mock the entire arctic module or just the specific functions.
    // For now, let's assume the implementation uses the real decodeIdToken but we provide a valid-looking mock token or mock the function.
  })
})
