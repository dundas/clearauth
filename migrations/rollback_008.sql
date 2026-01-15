-- Rollback: Drop challenges table
-- Description: Rollback migration 008 - removes challenges table
-- Author: DatabaseArchitect
-- Date: 2026-01-15

-- Drop index first
DROP INDEX IF EXISTS idx_challenges_expires_at;

-- Drop table
DROP TABLE IF EXISTS challenges;
