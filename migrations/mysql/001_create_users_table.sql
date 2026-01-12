-- Migration: Create users table (MySQL)
-- Description: Core users table with email/password and OAuth support
-- Compatible with: PlanetScale
-- Date: 2026-01-12

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  -- Primary key (UUID stored as CHAR(36) in MySQL)
  id CHAR(36) PRIMARY KEY,

  -- Email authentication
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified TINYINT(1) DEFAULT 0,  -- MySQL uses TINYINT(1) for boolean
  password_hash TEXT,  -- NULL for OAuth-only users

  -- OAuth providers (expanded to include all supported providers)
  github_id VARCHAR(255) UNIQUE,
  google_id VARCHAR(255) UNIQUE,
  discord_id VARCHAR(255) UNIQUE,
  apple_id VARCHAR(255) UNIQUE,
  microsoft_id VARCHAR(255) UNIQUE,
  linkedin_id VARCHAR(255) UNIQUE,
  meta_id VARCHAR(255) UNIQUE,

  -- User profile metadata
  name VARCHAR(255),
  avatar_url TEXT,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Constraint: Ensure at least one authentication method exists
  CONSTRAINT users_auth_method_check CHECK (
    password_hash IS NOT NULL OR
    github_id IS NOT NULL OR
    google_id IS NOT NULL OR
    discord_id IS NOT NULL OR
    apple_id IS NOT NULL OR
    microsoft_id IS NOT NULL OR
    linkedin_id IS NOT NULL OR
    meta_id IS NOT NULL
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create indexes for fast lookups
CREATE INDEX idx_users_email ON users(email);

-- Indexes for OAuth IDs
CREATE INDEX idx_users_github_id ON users(github_id);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_discord_id ON users(discord_id);
CREATE INDEX idx_users_apple_id ON users(apple_id);
CREATE INDEX idx_users_microsoft_id ON users(microsoft_id);
CREATE INDEX idx_users_linkedin_id ON users(linkedin_id);
CREATE INDEX idx_users_meta_id ON users(meta_id);
