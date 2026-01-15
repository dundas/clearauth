-- Migration: Create challenges table
-- Description: Nonce-based challenges for replay-proof device authentication
-- Author: DatabaseArchitect
-- Date: 2026-01-15

-- Create challenges table (idempotent)
CREATE TABLE IF NOT EXISTS challenges (
  -- Primary key - unique nonce (32 bytes hex)
  nonce VARCHAR(64) PRIMARY KEY,

  -- Full challenge string (nonce|timestamp format)
  challenge VARCHAR(128) NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Create index for cleanup of expired challenges (idempotent)
CREATE INDEX IF NOT EXISTS idx_challenges_expires_at ON challenges(expires_at);

-- Comments for documentation
COMMENT ON TABLE challenges IS 'Nonce-based challenges for replay-proof device authentication';
COMMENT ON COLUMN challenges.nonce IS 'Primary key - unique random nonce (32 bytes hex-encoded)';
COMMENT ON COLUMN challenges.challenge IS 'Full challenge string in format: nonce|timestamp';
COMMENT ON COLUMN challenges.created_at IS 'Timestamp when challenge was created';
COMMENT ON COLUMN challenges.expires_at IS 'Timestamp when challenge expires (typically 10 minutes)';

-- Note: Challenge validation:
-- 1. Challenge exists in database
-- 2. expires_at > NOW()
-- 3. Challenge consumed (deleted) after successful verification
-- Expired challenges should be periodically cleaned up using expires_at index
