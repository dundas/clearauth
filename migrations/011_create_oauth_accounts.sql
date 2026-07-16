-- Migration: Create provider-neutral OAuth account identities
-- Description: Additive identity mapping and PostgreSQL legacy-provider bridge.

-- PostgreSQL's original migration only created GitHub and Google columns, while
-- the runtime supports all seven conventional providers. Keep every legacy
-- column during the deprecation window so OAuth-only user inserts remain valid.
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS meta_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id_unique ON users(discord_id) WHERE discord_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_id_unique ON users(apple_id) WHERE apple_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_microsoft_id_unique ON users(microsoft_id) WHERE microsoft_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_linkedin_id_unique ON users(linkedin_id) WHERE linkedin_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_meta_id_unique ON users(meta_id) WHERE meta_id IS NOT NULL;

-- OAuth authentication is now expressed by oauth_accounts, which a PostgreSQL
-- CHECK constraint cannot inspect. Retire the old row-local provider check so
-- arbitrary provider keys can create OAuth-only users.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_method_check;

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_key VARCHAR(128) NOT NULL,
  subject VARCHAR(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oauth_accounts_provider_subject_unique UNIQUE (provider_key, subject)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);

COMMENT ON TABLE oauth_accounts IS 'Provider-neutral OAuth identities. Legacy users provider ID columns remain populated during the deprecation window.';
