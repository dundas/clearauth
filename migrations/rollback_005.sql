-- Rollback: Drop magic_link_tokens table
-- Description: Rollback migration 005 - removes magic link tokens table
-- Author: DatabaseArchitect
-- Date: 2026-01-12

-- Drop indexes first
DROP INDEX IF EXISTS idx_magic_link_expires_at;
DROP INDEX IF EXISTS idx_magic_link_user_id;

-- Drop table
DROP TABLE IF EXISTS magic_link_tokens;
