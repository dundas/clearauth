import { describe, expect, it, vi } from 'vitest'
import { handleOAuthRequest } from '../handler.js'
import { getOAuthTransactionCookieName, parseOAuthTransactionState } from '../transactions.js'

function oauthConfig(database: any, onAccountResolved?: (event: any) => Promise<void> | void) {
  return {
    database,
    secret: 'test-secret',
    baseUrl: 'https://app.example.com',
    isProduction: false,
    oauth: {
      github: {
        clientId: 'github-client',
        clientSecret: 'github-secret',
        redirectUri: 'https://app.example.com/auth/callback/github',
      },
      google: {
        clientId: 'google-client',
        clientSecret: 'google-secret',
        redirectUri: 'https://app.example.com/auth/callback/google',
      },
      onAccountResolved,
    },
  }
}

function transactionInsertDb() {
  const transactions: any[] = []
  return {
    transactions,
    insertInto: vi.fn(() => ({
      values: (value: any) => ({
        returningAll: () => ({
          executeTakeFirstOrThrow: async () => {
            const row = { ...value, created_at: new Date() }
            transactions.push(row)
            return row
          },
        }),
      }),
    })),
  }
}

function successfulCallbackDb(transaction: any) {
  const user = {
    id: 'user-1', email: 'person@example.com', email_verified: true, password_hash: null,
    github_id: '123', google_id: null, discord_id: null, apple_id: null, microsoft_id: null, linkedin_id: null, meta_id: null,
    name: 'Person', avatar_url: null, created_at: new Date(), updated_at: new Date(),
  }
  const noAccount = { select: () => noAccount, where: () => noAccount, executeTakeFirst: async () => undefined }
  const legacyUser = { selectAll: () => legacyUser, where: () => legacyUser, executeTakeFirst: async () => user }
  const transactionQuery: any = {
    set: () => transactionQuery,
    where: () => transactionQuery,
    returningAll: () => ({ executeTakeFirst: async () => transaction }),
  }
  const userQuery: any = {
    set: () => userQuery,
    where: () => userQuery,
    returningAll: () => ({ executeTakeFirstOrThrow: async () => user }),
  }
  return {
    updateTable: vi.fn((table: string) => table === 'oauth_transactions' ? transactionQuery : userQuery),
    selectFrom: vi.fn((table: string) => table === 'oauth_accounts' ? noAccount : legacyUser),
    insertInto: vi.fn((table: string) => ({
      values: () => {
        if (table === 'users') return { returningAll: () => ({ executeTakeFirstOrThrow: async () => user }) }
        if (table === 'oauth_accounts') return { onConflict: () => ({ returning: () => ({ executeTakeFirst: async () => ({ id: 'account-1' }) }) }) }
        return { execute: async () => undefined }
      },
    })),
  }
}

describe('OAuth transaction HTTP bridge', () => {
  it('creates distinct transaction binding cookies for same-provider and cross-provider flows', async () => {
    const db = transactionInsertDb()

    const first = await handleOAuthRequest(new Request('https://app.example.com/auth/oauth/github'), oauthConfig(db) as any)
    const second = await handleOAuthRequest(new Request('https://app.example.com/auth/oauth/github'), oauthConfig(db) as any)
    const google = await handleOAuthRequest(new Request('https://app.example.com/auth/oauth/google'), oauthConfig(db) as any)

    expect(first.status).toBe(302)
    expect(second.status).toBe(302)
    expect(google.status).toBe(302)
    expect(db.transactions).toHaveLength(3)
    expect(db.transactions[0].state_hash).not.toBe(db.transactions[1].state_hash)
    expect(db.transactions[0].browser_binding_hash).not.toBe(db.transactions[1].browser_binding_hash)

    const firstState = parseOAuthTransactionState(new URL(first.headers.get('Location')!).searchParams.get('state')!)!
    const secondState = parseOAuthTransactionState(new URL(second.headers.get('Location')!).searchParams.get('state')!)!
    const googleState = parseOAuthTransactionState(new URL(google.headers.get('Location')!).searchParams.get('state')!)!
    expect(first.headers.get('Set-Cookie')).toContain(`${getOAuthTransactionCookieName('github', firstState.id)}=`)
    expect(second.headers.get('Set-Cookie')).toContain(`${getOAuthTransactionCookieName('github', secondState.id)}=`)
    expect(google.headers.get('Set-Cookie')).toContain(`${getOAuthTransactionCookieName('google', googleState.id)}=`)
    expect(google.headers.get('Set-Cookie')).not.toContain(getOAuthTransactionCookieName('github', firstState.id))
    expect(first.headers.get('Set-Cookie')).not.toContain('oauth_state=')
    expect(first.headers.get('Set-Cookie')).not.toContain('oauth_code_verifier=')
  })

  it('fails a binding mismatch before provider token exchange', async () => {
    const id = 'a'.repeat(32)
    const state = `${id}.${'b'.repeat(43)}`
    const where = vi.fn(() => query)
    const query: any = {
      set: vi.fn(() => query),
      where,
      returningAll: vi.fn(() => ({ executeTakeFirst: async () => undefined })),
    }
    const db = { updateTable: vi.fn(() => query) }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const response = await handleOAuthRequest(
      new Request(`https://app.example.com/auth/callback/github?code=code&state=${state}`, {
        headers: { Cookie: `${getOAuthTransactionCookieName('github', id)}=wrong-binding` },
      }),
      oauthConfig(db) as any,
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Invalid OAuth callback')
    expect(db.updateTable).toHaveBeenCalledWith('oauth_transactions')
    expect(where).toHaveBeenCalledWith('provider_key', '=', 'github')
    expect(where).toHaveBeenCalledWith('redirect_uri', '=', 'https://app.example.com/auth/callback/github')
    expect(where).toHaveBeenCalledWith('consumed_at', 'is', null)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('does not reflect provider authorization error details', async () => {
    const response = await handleOAuthRequest(
      new Request('https://app.example.com/auth/callback/github?error=access_denied&error_description=private-provider-detail'),
      oauthConfig({}) as any,
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe('OAuth authorization was denied')
  })

  it('deletes only the consumed transaction cookie and rejects a replay before exchange', async () => {
    const startDb = transactionInsertDb()
    const start = await handleOAuthRequest(new Request('https://app.example.com/auth/oauth/github'), oauthConfig(startDb) as any)
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!
    const reference = parseOAuthTransactionState(state)!
    const transaction = startDb.transactions[0]
    const db = successfulCallbackDb(transaction)
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token', token_type: 'bearer' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 123, login: 'person', email: 'person@example.com', name: 'Person', avatar_url: null }), { status: 200 }))
    globalThis.fetch = fetchSpy as typeof fetch
    const bindingCookie = getOAuthTransactionCookieName('github', reference.id)

    const callback = await handleOAuthRequest(
      new Request(`https://app.example.com/auth/callback/github?code=code&state=${state}`, { headers: { Cookie: `${bindingCookie}=binding` } }),
      oauthConfig(db) as any,
    )

    expect(callback.status).toBe(302)
    expect(callback.headers.get('Set-Cookie')).toContain(`${bindingCookie}=;`)
    expect(callback.headers.get('Set-Cookie')).not.toContain('oauth_state=')
    expect(callback.headers.get('Set-Cookie')).not.toContain('oauth_code_verifier=')
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    const replayQuery: any = {
      set: () => replayQuery,
      where: () => replayQuery,
      returningAll: () => ({ executeTakeFirst: async () => undefined }),
    }
    ;(db.updateTable as any).mockImplementation(() => replayQuery)
    fetchSpy.mockClear()
    const replay = await handleOAuthRequest(
      new Request(`https://app.example.com/auth/callback/github?code=code&state=${state}`, { headers: { Cookie: `${bindingCookie}=binding` } }),
      oauthConfig(db) as any,
    )
    expect(replay.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
    globalThis.fetch = originalFetch
  })

  it('emits only a redacted account outcome and does not block auth when the hook fails', async () => {
    const startDb = transactionInsertDb()
    const start = await handleOAuthRequest(new Request('https://app.example.com/auth/oauth/github'), oauthConfig(startDb) as any)
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!
    const reference = parseOAuthTransactionState(state)!
    const db = successfulCallbackDb(startDb.transactions[0])
    const hook = vi.fn().mockRejectedValue(new Error('observer unavailable'))
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token', token_type: 'bearer' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 123, login: 'person', email: 'person@example.com', name: 'Person', avatar_url: null }), { status: 200 })) as typeof fetch
    const bindingCookie = getOAuthTransactionCookieName('github', reference.id)

    const callback = await handleOAuthRequest(
      new Request(`https://app.example.com/auth/callback/github?code=code&state=${state}`, { headers: { Cookie: `${bindingCookie}=binding` } }),
      oauthConfig(db, hook) as any,
    )

    expect(callback.status).toBe(302)
    expect(hook).toHaveBeenCalledWith({ userId: 'user-1', providerKey: 'github', outcome: 'returning' })
    expect(hook.mock.calls[0][0]).toEqual({ userId: expect.any(String), providerKey: 'github', outcome: 'returning' })
    globalThis.fetch = originalFetch
  })

  it('clears the consumed transaction cookie when token exchange fails', async () => {
    const startDb = transactionInsertDb()
    const start = await handleOAuthRequest(new Request('https://app.example.com/auth/oauth/github'), oauthConfig(startDb) as any)
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!
    const reference = parseOAuthTransactionState(state)!
    const db = successfulCallbackDb(startDb.transactions[0])
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('provider unavailable')) as typeof fetch
    const bindingCookie = getOAuthTransactionCookieName('github', reference.id)

    const callback = await handleOAuthRequest(
      new Request(`https://app.example.com/auth/callback/github?code=code&state=${state}`, { headers: { Cookie: `${bindingCookie}=binding` } }),
      oauthConfig(db) as any,
    )

    expect(callback.status).toBe(400)
    expect(callback.headers.get('Set-Cookie')).toContain(`${bindingCookie}=;`)
    globalThis.fetch = originalFetch
  })
})
