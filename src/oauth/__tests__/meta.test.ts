import { describe, it, expect, vi } from 'vitest'
import { generateMetaAuthUrl, handleMetaCallback } from '../meta.js'
import type { ClearAuthConfig } from '../../types.js'
import * as arcticFactory from '../arctic-providers.js'

describe('Meta OAuth', () => {
  const mockConfig: ClearAuthConfig = {
    database: {} as any,
    secret: 'test-secret',
    baseUrl: 'https://example.com',
    oauth: {
      meta: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://example.com/auth/callback/meta'
      }
    }
  }

  it('should generate a valid authorization URL', async () => {
    const { url, state } = await generateMetaAuthUrl(mockConfig)
    expect(url.toString()).toContain('facebook.com')
    expect(url.toString()).toContain('/dialog/oauth')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('scope')).toBe('public_profile email')
    expect(state).toBeDefined()
  })
})
