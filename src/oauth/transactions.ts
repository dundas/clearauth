import type { Kysely } from 'kysely'
import type { Database, NewOAuthTransaction, OAuthTransaction } from '../database/schema.js'

const TRANSACTION_TTL_MS = 10 * 60 * 1000
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/

export interface OAuthCallbackEvidence {
  returnedState: string
  providerKey: string
  redirectUri: string
  returnedIssuer?: string
  adapterMetadata?: string
  browserBindingSecret: string
  now: Date
}

export interface OAuthTransactionStore {
  create(transaction: NewOAuthTransaction): Promise<OAuthTransaction>
  validateAndConsume(id: string, evidence: OAuthCallbackEvidence): Promise<OAuthTransaction | null>
  cleanupExpired(now?: Date): Promise<number>
}

export interface CreateOAuthTransactionInput {
  providerKey: string
  redirectUri: string
  codeVerifier?: string
  expectedIssuer?: string
  adapterMetadata?: string
  expiresAt?: Date
}

export interface PreparedOAuthTransaction {
  id: string
  state: string
  browserBindingSecret: string
  codeVerifier?: string
  transaction: NewOAuthTransaction
}

function randomBase64Url(bytes: number): string {
  const value = new Uint8Array(bytes)
  crypto.getRandomValues(value)
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Create server-side transaction material. Never expose the verifier or binding secret in a response body. */
export async function createOAuthTransaction(input: CreateOAuthTransactionInput): Promise<PreparedOAuthTransaction> {
  const id = randomBase64Url(24)
  const state = `${id}.${randomBase64Url(32)}`
  const browserBindingSecret = randomBase64Url(32)
  const expiresAt = input.expiresAt ?? new Date(Date.now() + TRANSACTION_TTL_MS)

  return {
    id,
    state,
    browserBindingSecret,
    codeVerifier: input.codeVerifier,
    transaction: {
      id,
      provider_key: input.providerKey,
      state_hash: await sha256(state),
      code_verifier: input.codeVerifier ?? null,
      redirect_uri: input.redirectUri,
      expected_issuer: input.expectedIssuer ?? null,
      adapter_metadata_hash: input.adapterMetadata ? await sha256(input.adapterMetadata) : null,
      browser_binding_hash: await sha256(browserBindingSecret),
      expires_at: expiresAt,
      consumed_at: null,
    },
  }
}

/** State deliberately includes the opaque transaction ID so the callback can locate its binding cookie. */
export function parseOAuthTransactionState(state: string): { id: string; state: string } | null {
  const [id, secret, ...rest] = state.split('.')
  if (rest.length > 0 || !id || !secret || !TRANSACTION_ID_PATTERN.test(id) || !TRANSACTION_ID_PATTERN.test(secret)) {
    return null
  }
  return { id, state }
}

export function getOAuthTransactionCookieName(providerKey: string, transactionId: string): string {
  if (!/^[a-z0-9_-]+$/.test(providerKey) || !TRANSACTION_ID_PATTERN.test(transactionId)) {
    throw new Error('Invalid OAuth transaction cookie reference')
  }
  return `oauth_tx_${providerKey}_${transactionId}`
}

export function createOAuthTransactionStore(db: Kysely<Database>): OAuthTransactionStore {
  return {
    async create(transaction) {
      return db.insertInto('oauth_transactions').values(transaction).returningAll().executeTakeFirstOrThrow()
    },

    async validateAndConsume(id, evidence) {
      // This conditional update is the sole validation/consumption operation. It is safe under concurrent callbacks.
      const transaction = await db
        .updateTable('oauth_transactions')
        .set({ consumed_at: evidence.now })
        .where('id', '=', id)
        .where('state_hash', '=', await sha256(evidence.returnedState))
        .where('provider_key', '=', evidence.providerKey)
        .where('redirect_uri', '=', evidence.redirectUri)
        .where('expected_issuer', 'is', evidence.returnedIssuer ?? null)
        .where('adapter_metadata_hash', 'is', evidence.adapterMetadata ? await sha256(evidence.adapterMetadata) : null)
        .where('browser_binding_hash', '=', await sha256(evidence.browserBindingSecret))
        .where('expires_at', '>', evidence.now)
        .where('consumed_at', 'is', null)
        .returningAll()
        .executeTakeFirst()
      return transaction ?? null
    },

    async cleanupExpired(now = new Date()) {
      const result = await db.deleteFrom('oauth_transactions').where('expires_at', '<=', now).executeTakeFirst()
      return Number(result.numDeletedRows ?? 0)
    },
  }
}
