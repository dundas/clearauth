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
      expectedIssuer: 'https://issuer.example.com',
      adapterMetadata: 'adapter-callback-binding',
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
      returnedIssuer: 'https://issuer.example.com',
      browserBindingSecret: prepared.browserBindingSecret,
      adapterMetadata: 'adapter-callback-binding',
      now: new Date(),
    })

    expect(consumed).toEqual(row)
    expect(whereCalls).toContainEqual(['id', '=', prepared.id])
    expect(whereCalls).toContainEqual(['provider_key', '=', 'github'])
    expect(whereCalls).toContainEqual(['redirect_uri', '=', 'https://app.example.com/auth/callback/github'])
    expect(whereCalls).toContainEqual(['expected_issuer', '=', 'https://issuer.example.com'])
    expect(whereCalls.some(([column, operator]) => column === 'adapter_metadata_hash' && operator === '=')).toBe(true)
    expect(whereCalls).toContainEqual(['expires_at', '>', expect.any(Date)])
    expect(whereCalls).toContainEqual(['consumed_at', 'is', null])
    expect(whereCalls.some(([column]) => column === 'state_hash')).toBe(true)
    expect(whereCalls.some(([column]) => column === 'browser_binding_hash')).toBe(true)
    expect(whereCalls.flat()).not.toContain(prepared.browserBindingSecret)
    expect(whereCalls.flat()).not.toContain('adapter-callback-binding')
  })

  it('rejects expired, issuer, redirect, metadata, and replayed callback evidence', async () => {
    const createStore = async (input: Parameters<typeof createOAuthTransaction>[0]) => {
      const prepared = await createOAuthTransaction(input)
      let row: any = { ...prepared.transaction, created_at: new Date() }
      const db = {
        updateTable: () => {
          const whereCalls: unknown[][] = []
          let consumedAt: Date | undefined
          const query: any = {
            set: (value: { consumed_at: Date }) => {
              consumedAt = value.consumed_at
              return query
            },
            where: (...args: unknown[]) => {
              whereCalls.push(args)
              return query
            },
            returningAll: () => ({
              executeTakeFirst: async () => {
                const matches = whereCalls.every(([column, operator, value]) => {
                  if (column === 'expires_at' && operator === '>') return row.expires_at > value
                  if (column === 'consumed_at' && operator === 'is') return row.consumed_at === value
                  return row[column] === value
                })
                if (!matches) return undefined
                row = { ...row, consumed_at: consumedAt }
                return row
              },
            }),
          }
          return query
        },
      }
      return { prepared, store: createOAuthTransactionStore(db as any) }
    }

    const now = new Date('2026-07-15T12:00:00Z')
    const validInput = {
      providerKey: 'github', redirectUri: 'https://app.example.com/auth/callback/github',
      expectedIssuer: 'https://issuer.example.com', adapterMetadata: 'metadata', expiresAt: new Date(now.getTime() + 60_000),
    }
    const evidence = (prepared: Awaited<ReturnType<typeof createOAuthTransaction>>) => ({
      returnedState: prepared.state, providerKey: 'github', redirectUri: validInput.redirectUri,
      returnedIssuer: validInput.expectedIssuer, adapterMetadata: 'metadata', browserBindingSecret: prepared.browserBindingSecret, now,
    })

    const expired = await createStore({ ...validInput, expiresAt: new Date(now.getTime() - 1) })
    expect(await expired.store.validateAndConsume(expired.prepared.id, evidence(expired.prepared))).toBeNull()

    const issuer = await createStore(validInput)
    expect(await issuer.store.validateAndConsume(issuer.prepared.id, { ...evidence(issuer.prepared), returnedIssuer: 'https://other.example.com' })).toBeNull()

    const redirect = await createStore(validInput)
    expect(await redirect.store.validateAndConsume(redirect.prepared.id, { ...evidence(redirect.prepared), redirectUri: 'https://attacker.example.com/callback' })).toBeNull()

    const metadata = await createStore(validInput)
    expect(await metadata.store.validateAndConsume(metadata.prepared.id, { ...evidence(metadata.prepared), adapterMetadata: 'modified' })).toBeNull()

    const replay = await createStore(validInput)
    const [first, second] = await Promise.all([
      replay.store.validateAndConsume(replay.prepared.id, evidence(replay.prepared)),
      replay.store.validateAndConsume(replay.prepared.id, evidence(replay.prepared)),
    ])
    expect([first, second].filter(Boolean)).toHaveLength(1)
  })
})
