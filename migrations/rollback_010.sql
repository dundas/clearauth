-- Rollback: Remove hardened OAuth transaction metadata hash
ALTER TABLE oauth_transactions
  DROP COLUMN IF EXISTS adapter_metadata_hash;
