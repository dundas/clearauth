-- Migration: Harden OAuth transaction adapter metadata storage
-- Description: Forward migration for installations that applied an early 009 preview.

ALTER TABLE oauth_transactions
  ADD COLUMN IF NOT EXISTS adapter_metadata_hash CHAR(64);

-- Raw adapter metadata must not remain in the transaction table.
ALTER TABLE oauth_transactions
  DROP COLUMN IF EXISTS adapter_metadata;

COMMENT ON COLUMN oauth_transactions.adapter_metadata_hash IS 'Hash of opaque adapter callback metadata; raw metadata is never persisted in this table.';
