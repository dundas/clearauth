-- Migration: Create OAuth transactions table
-- Description: Server-side, one-time OAuth callback transactions

CREATE TABLE IF NOT EXISTS oauth_transactions (
  id VARCHAR(64) PRIMARY KEY,
  provider_key VARCHAR(64) NOT NULL,
  state_hash CHAR(64) NOT NULL,
  code_verifier TEXT,
  redirect_uri TEXT NOT NULL,
  expected_issuer TEXT,
  adapter_metadata TEXT,
  browser_binding_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expires_at ON oauth_transactions(expires_at);

COMMENT ON TABLE oauth_transactions IS 'One-time server-side OAuth transactions. State and browser-binding values are stored only as hashes.';
COMMENT ON COLUMN oauth_transactions.code_verifier IS 'Server-side PKCE verifier. Never expose through a browser-facing API.';
