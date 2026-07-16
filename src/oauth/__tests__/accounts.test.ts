import { describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database, User } from '../../database/schema.js'
import {
  OAuthAccountLinkingRequiredError,
  resolveOAuthAccount,
  upsertOAuthUser,
} from '../callbacks.js'

type Row = Record<string, any>

function createDatabase(users: User[] = []) {
  const state = { users: [...users] as Row[], oauth_accounts: [] as Row[] }
  let nextUserId = 1
  let nextAccountId = 1

  const selectFrom = (table: keyof typeof state) => {
    const conditions: Array<[string, unknown]> = []
    const query = {
      selectAll: () => query,
      select: () => query,
      where: (column: string, _operator: string, value: unknown) => {
        conditions.push([column, value])
        return query
      },
      executeTakeFirst: async () => state[table].find((row) => conditions.every(([column, value]) => row[column] === value)),
    }
    return query
  }

  const insertInto = (table: keyof typeof state) => {
    let values: Row = {}
    let ignoreConflict = false
    const query = {
      values: (input: Row) => {
        values = input
        return query
      },
      onConflict: (callback: (conflict: any) => unknown) => {
        callback({ columns: () => ({ doNothing: () => { ignoreConflict = true } }) })
        return query
      },
      returning: () => query,
      returningAll: () => query,
      executeTakeFirst: async () => {
        if (table === 'oauth_accounts') {
          const existing = state.oauth_accounts.find((account) => account.provider_key === values.provider_key && account.subject === values.subject)
          if (existing && ignoreConflict) return undefined
          if (existing) throw new Error('duplicate OAuth account')
          const row = { id: `account-${nextAccountId++}`, ...values }
          state.oauth_accounts.push(row)
          return row
        }
        const row = {
          id: `user-${nextUserId++}`,
          github_id: null,
          google_id: null,
          discord_id: null,
          apple_id: null,
          microsoft_id: null,
          linkedin_id: null,
          meta_id: null,
          created_at: new Date(),
          updated_at: new Date(),
          ...values,
        }
        state.users.push(row)
        return row
      },
      executeTakeFirstOrThrow: async () => {
        const row = await query.executeTakeFirst()
        if (!row) throw new Error('expected inserted row')
        return row
      },
    }
    return query
  }

  const updateTable = (table: keyof typeof state) => {
    let values: Row = {}
    let condition: [string, unknown] | undefined
    const query = {
      set: (input: Row) => {
        values = input
        return query
      },
      where: (column: string, _operator: string, value: unknown) => {
        condition = [column, value]
        return query
      },
      returningAll: () => query,
      executeTakeFirstOrThrow: async () => {
        const row = state[table].find((item) => item[condition![0]] === condition![1])
        if (!row) throw new Error('expected updated row')
        Object.assign(row, values)
        return row
      },
    }
    return query
  }

  let transactionCalls = 0
  const db = {
    selectFrom,
    insertInto,
    updateTable,
    transaction: () => ({
      execute: async (callback: (transaction: typeof db) => Promise<unknown>) => {
        transactionCalls += 1
        return callback(db)
      },
    }),
  }
  return {
    db: db as unknown as Kysely<Database>,
    state,
    get transactionCalls() { return transactionCalls },
  }
}

const profile = (id: string, email = `${id}@example.com`, verified = true) => ({
  id,
  email,
  email_verified: verified,
  name: 'OAuth User',
  avatar_url: null,
})

describe('generic OAuth account resolution', () => {
  it('creates a generic account and reports a created outcome', async () => {
    const database = createDatabase()
    const { db, state } = database
    const result = await resolveOAuthAccount(db, 'example', profile('subject-1'))

    expect(result.outcome).toBe('created')
    expect(database.transactionCalls).toBe(1)
    expect(state.oauth_accounts).toMatchObject([{ provider_key: 'example', subject: 'subject-1', user_id: result.user.id }])
  })

  it('links an identity to an explicit authenticated target user', async () => {
    const existing = { id: 'existing-user', email: 'local@example.com', email_verified: true, password_hash: 'hash', name: null, avatar_url: null } as User
    const { db, state } = createDatabase([existing])
    const result = await resolveOAuthAccount(db, 'example', profile('subject-2'), { linkToUserId: existing.id })

    expect(result.outcome).toBe('linked')
    expect(state.oauth_accounts[0]).toMatchObject({ user_id: existing.id, provider_key: 'example', subject: 'subject-2' })
  })

  it('returns the existing generic identity on subsequent login', async () => {
    const existing = { id: 'existing-user', email: 'existing@example.com', email_verified: true, password_hash: null, name: null, avatar_url: null } as User
    const { db, state } = createDatabase([existing])
    state.oauth_accounts.push({ id: 'account-1', user_id: existing.id, provider_key: 'example', subject: 'subject-3' })

    const result = await resolveOAuthAccount(db, 'example', profile('subject-3'))
    expect(result.outcome).toBe('returning')
    expect(result.user.id).toBe(existing.id)
  })

  it('does not attach a duplicate provider subject to a different target user', async () => {
    const first = { id: 'first-user', email: 'first@example.com', email_verified: true, password_hash: null, name: null, avatar_url: null } as User
    const second = { id: 'second-user', email: 'second@example.com', email_verified: true, password_hash: null, name: null, avatar_url: null } as User
    const { db, state } = createDatabase([first, second])
    await resolveOAuthAccount(db, 'example', profile('subject-4'), { linkToUserId: first.id })
    const repeated = await resolveOAuthAccount(db, 'example', profile('subject-4'), { linkToUserId: second.id })

    expect(repeated).toMatchObject({ outcome: 'returning', user: { id: first.id } })
    expect(state.oauth_accounts).toHaveLength(1)
  })

  it('returns the winning account after a concurrent user-creation uniqueness failure', async () => {
    const { db, state } = createDatabase()
    const winner = { id: 'winner-user', email: 'race@example.com', email_verified: true, password_hash: null, name: null, avatar_url: null } as User
    ;(db as any).transaction = () => ({
      execute: async () => {
        state.users.push(winner)
        state.oauth_accounts.push({ id: 'account-race', user_id: winner.id, provider_key: 'example', subject: 'subject-race' })
        throw new Error('duplicate key value violates unique constraint users_email_key')
      },
    })

    const result = await resolveOAuthAccount(db, 'example', profile('subject-race', winner.email))
    expect(result).toMatchObject({ outcome: 'returning', user: { id: winner.id } })
  })

  it('links a verified cross-provider email winner after a user-creation race', async () => {
    const { db, state } = createDatabase()
    const winner = { id: 'winner-user', email: 'cross-provider@example.com', email_verified: true, password_hash: null, name: null, avatar_url: null } as User
    const originalTransaction = (db as any).transaction
    let firstTransaction = true
    ;(db as any).transaction = () => ({
      execute: async (callback: (transaction: any) => Promise<unknown>) => {
        if (!firstTransaction) return originalTransaction().execute(callback)
        firstTransaction = false
        state.users.push(winner)
        state.oauth_accounts.push({ id: 'google-account', user_id: winner.id, provider_key: 'google', subject: 'google-subject' })
        throw new Error('duplicate key value violates unique constraint users_email_key')
      },
    })

    const result = await resolveOAuthAccount(db, 'github', profile('github-subject', winner.email), { allowVerifiedEmailLinking: true })
    expect(result).toMatchObject({ outcome: 'linked', user: { id: winner.id } })
    expect(state.oauth_accounts).toMatchObject([
      { provider_key: 'google', subject: 'google-subject', user_id: winner.id },
      { provider_key: 'github', subject: 'github-subject', user_id: winner.id },
    ])
  })

  it('rejects an unverified cross-provider email winner after a user-creation race', async () => {
    const { db, state } = createDatabase()
    const winner = { id: 'winner-user', email: 'cross-provider@example.com', email_verified: true, password_hash: null, name: null, avatar_url: null } as User
    ;(db as any).transaction = () => ({
      execute: async () => {
        state.users.push(winner)
        state.oauth_accounts.push({ id: 'google-account', user_id: winner.id, provider_key: 'google', subject: 'google-subject' })
        throw new Error('duplicate key value violates unique constraint users_email_key')
      },
    })

    await expect(resolveOAuthAccount(db, 'github', profile('github-subject', winner.email, false), { allowVerifiedEmailLinking: true }))
      .rejects.toBeInstanceOf(OAuthAccountLinkingRequiredError)
    expect(state.oauth_accounts).toHaveLength(1)
  })

  it('rejects an unverified email collision but preserves verified legacy linking', async () => {
    const existing = { id: 'existing-user', email: 'shared@example.com', email_verified: true, password_hash: 'hash', name: null, avatar_url: null } as User
    const { db, state } = createDatabase([existing])

    await expect(resolveOAuthAccount(db, 'github', profile('subject-5', existing.email, false))).rejects.toBeInstanceOf(OAuthAccountLinkingRequiredError)
    expect(state.oauth_accounts).toHaveLength(0)
    const linked: User = await upsertOAuthUser(db, 'github', profile('subject-6', existing.email, true))

    expect(linked.id).toBe(existing.id)
    expect(state.oauth_accounts).toMatchObject([{ provider_key: 'github', subject: 'subject-6', user_id: existing.id }])
  })
})
