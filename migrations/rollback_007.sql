-- Rollback: Drop devices table
-- Description: Rollback migration 007 - removes devices table
-- Author: DatabaseArchitect
-- Date: 2026-01-15

-- Drop indexes first (in reverse order of creation)
DROP INDEX IF EXISTS idx_devices_user_active;
DROP INDEX IF EXISTS idx_devices_status;
DROP INDEX IF EXISTS idx_devices_device_id;
DROP INDEX IF EXISTS idx_devices_user_id;

-- Drop table
DROP TABLE IF EXISTS devices;
