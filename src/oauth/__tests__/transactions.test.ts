import { describe, expect, it } from 'vitest'
import {
  createOAuthTransaction,
  createOAuthTransactionStore,
  getOAuthTransactionCookieName,
  parseOAuthTransactionState,
} from '../transactions.js'

describe('OAuth transaction core', () => {
  it('creates independent, provider-namespaced browser bindings for concurrent flows', async () => {
    const first = await createOAuthTransaction({
      providerKey: 'github',
      redirectUri: 'https://app.example.com/auth/callback/github',
    })
    const second = await createOAuthTransaction({
      providerKey: 'github',
      redirectUri: 'https://app.example.com/auth/callback/github',
    })
    const google = await createOAuthTransaction({
      providerKey: 'google',
      redirectUri: 'https://app.example.com/auth/callback/google',
      codeVerifier: 'pkce-verifier',
    })

    expect(first.id).not.toBe(second.id)
    expect(first.state).not.toBe(second.state)
    expect(first.browserBindingSecret).not.toBe(second.browserBindingSecret)
    expect(getOAuthTransactionCookieName('github', first.id)).not.toBe(getOAuthTransactionCookieName('github', second.id))
    expect(getOAuthTransactionCookieName('github', first.id)).not.toBe(getOAuthTransactionCookieName('google', google.id))
    expect(parseOAuthTransactionState(first.state)).toEqual({ id: first.id, state: first.state })
    expect(google.codeVerifier).toBe('pkce-verifier')
  })

  it('rejects malformed transaction state before cookie lookup', () => {
    expect(parseOAuthTransactionState('')).toBeNull()
    expect(parseOAuthTransactionState('only-an-id')).toBeNull()
    expect(parseOAuthTransactionState('.missing-id')).toBeNull()
    expect(parseOAuthTransactionState('id.')).toBeNull()
    expect(parseOAuthTransactionState('bad.id.extra')).toBeNull()
  })

  it('uses one conditional update containing every callback invariant', async () => {
    const prepared = await createOAuthTransaction({
      providerKey: 'github',
      redirectUri: 'https://app.example.com/auth/callback/github',
    })
    const whereCalls: unknown[][] = []
    const row = { ...prepared.transaction, created_at: new Date(), consumed_at: new Date() }
    const query: any = {
      set: () => query,
      where: (...args: unknown[]) => {
        whereCalls.push(args)
        return query
      },
      returningAll: () => ({ executeTakeFirst: async () => row }),
    }
    const db = { updateTable: (...args: unknown[]) => {
      expect(args).toEqual(['oauth_transactions'])
      return query
    } }

    const consumed = await createOAuthTransactionStore(db as any).validateAndConsume(prepared.id, {
      returnedState: prepared.state,
      providerKey: 'github',
      redirectUri: 'https://app.example.com/auth/callback/github',
      browserBindingSecret: prepared.browserBindingSecret,
      now: new Date(),
    })

    expect(consumed).toEqual(row)
    expect(whereCalls).toContainEqual(['id', '=', prepared.id])
    expect(whereCalls).toContainEqual(['provider_key', '=', 'github'])
    expect(whereCalls).toContainEqual(['redirect_uri', '=', 'https://app.example.com/auth/callback/github'])
    expect(whereCalls).toContainEqual(['expected_issuer', 'is', null])
    expect(whereCalls).toContainEqual(['expires_at', '>', expect.any(Date)])
    expect(whereCalls).toContainEqual(['consumed_at', 'is', null])
    expect(whereCalls.some(([column]) => column === 'state_hash')).toBe(true)
    expect(whereCalls.some(([column]) => column === 'browser_binding_hash')).toBe(true)
    expect(whereCalls.flat()).not.toContain(prepared.browserBindingSecret)
  })
})
