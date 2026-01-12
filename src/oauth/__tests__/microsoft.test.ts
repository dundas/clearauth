import { describe, it, expect, vi } from 'vitest'
import { generateMicrosoftAuthUrl, handleMicrosoftCallback } from '../microsoft.js'
import type { ClearAuthConfig } from '../../types.js'
import * as arcticFactory from '../arctic-providers.js'

describe('Microsoft OAuth', () => {
  const mockConfig: ClearAuthConfig = {
    database: {} as any,
    secret: 'test-secret',
    baseUrl: 'https://example.com',
    oauth: {
      microsoft: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://example.com/auth/callback/microsoft'
      }
    }
  }

  it('should generate a valid authorization URL with code verifier', async () => {
    const { url, state, codeVerifier } = await generateMicrosoftAuthUrl(mockConfig)
    expect(url.toString()).toContain('login.microsoftonline.com/common/oauth2/v2.0/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('code_challenge')).toBeDefined()
    expect(state).toBeDefined()
    expect(codeVerifier).toBeDefined()
  })
})
