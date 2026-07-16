-- Migration: Create provider-neutral OAuth account identities
-- Description: Additive identity mapping while legacy users.*_id columns remain supported.

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
