-- Migration: Create users table (SQLite)
-- Description: Core users table with email/password and OAuth support
-- Compatible with: Turso, Cloudflare D1
-- Date: 2026-01-12

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  -- Primary key (UUID stored as TEXT in SQLite)
  id TEXT PRIMARY KEY,

  -- Email authentication
  email TEXT UNIQUE NOT NULL,
  email_verified INTEGER DEFAULT 0,  -- SQLite uses INTEGER for boolean (0=false, 1=true)
  password_hash TEXT,  -- NULL for OAuth-only users

  -- OAuth providers (expanded to include all supported providers)
  github_id TEXT UNIQUE,
  google_id TEXT UNIQUE,
  discord_id TEXT UNIQUE,
  apple_id TEXT UNIQUE,
  microsoft_id TEXT UNIQUE,
  linkedin_id TEXT UNIQUE,
  meta_id TEXT UNIQUE,

  -- User profile metadata
  name TEXT,
  avatar_url TEXT,

  -- Timestamps (stored as INTEGER unix timestamps in SQLite)
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),

  -- Constraint: Ensure at least one authentication method exists
  CHECK (
    password_hash IS NOT NULL OR
    github_id IS NOT NULL OR
    google_id IS NOT NULL OR
    discord_id IS NOT NULL OR
    apple_id IS NOT NULL OR
    microsoft_id IS NOT NULL OR
    linkedin_id IS NOT NULL OR
    meta_id IS NOT NULL
  )
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Partial indexes for OAuth IDs (only index non-null values)
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id) WHERE discord_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_microsoft_id ON users(microsoft_id) WHERE microsoft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_linkedin_id ON users(linkedin_id) WHERE linkedin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_meta_id ON users(meta_id) WHERE meta_id IS NOT NULL;

-- Create trigger for automatic updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_users_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = unixepoch() WHERE id = NEW.id;
END;
