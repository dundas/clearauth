-- Rollback: Drop refresh_tokens table
-- Description: Rollback migration 006 - removes refresh tokens table
-- Author: DatabaseArchitect
-- Date: 2026-01-15

-- Drop indexes first (in reverse order of creation)
DROP INDEX IF EXISTS idx_refresh_tokens_user_valid;
DROP INDEX IF EXISTS idx_refresh_tokens_token_hash;
DROP INDEX IF EXISTS idx_refresh_tokens_user_id;

-- Drop table
DROP TABLE IF EXISTS refresh_tokens;
