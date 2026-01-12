import { describe, it, expect, vi } from 'vitest'
import { generateLinkedInAuthUrl, handleLinkedInCallback } from '../linkedin.js'
import type { ClearAuthConfig } from '../../types.js'
import * as arcticFactory from '../arctic-providers.js'

describe('LinkedIn OAuth', () => {
  const mockConfig: ClearAuthConfig = {
    database: {} as any,
    secret: 'test-secret',
    baseUrl: 'https://example.com',
    oauth: {
      linkedin: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://example.com/auth/callback/linkedin'
      }
    }
  }

  it('should generate a valid authorization URL', async () => {
    const { url, state } = await generateLinkedInAuthUrl(mockConfig)
    expect(url.toString()).toContain('linkedin.com/oauth/v2/authorization')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('scope')).toBe('openid profile email')
    expect(state).toBeDefined()
  })
})
