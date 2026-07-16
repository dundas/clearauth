import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  fileURLToPath(new URL('../../../migrations/011_create_oauth_accounts.sql', import.meta.url)),
  'utf8',
)

describe('OAuth accounts PostgreSQL migration contract', () => {
  it('bridges conventional provider columns while retiring the non-generic auth check', () => {
    for (const column of ['discord_id', 'apple_id', 'microsoft_id', 'linkedin_id', 'meta_id']) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column} TEXT`)
      expect(migration).toContain(`idx_users_${column}_unique`)
    }
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS users_auth_method_check')
    expect(migration).not.toContain('ADD CONSTRAINT users_auth_method_check')
    expect(migration).toContain('UNIQUE (provider_key, subject)')
  })
})
