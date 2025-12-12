/**
 * Type definitions for Mech Auth
 *
 * Core configuration types and OAuth-related interfaces for the authentication system.
 */

import type { Kysely } from 'kysely'
import type { Database } from './database/schema.js'
import type { PasswordHasher } from './password-hasher.js'

/**
 * OAuth Provider Configuration
 */
export interface OAuthProviderConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * OAuth Providers Configuration
 */
export interface OAuthProvidersConfig {
  github?: OAuthProviderConfig
  google?: OAuthProviderConfig
}

/**
 * Session Configuration
 */
export interface SessionConfig {
  /**
   * Session expiration time in seconds
   * @default 2592000 (30 days)
   */
  expiresIn?: number

  /**
   * Cookie configuration
   */
  cookie?: {
    name?: string
    sameSite?: 'strict' | 'lax' | 'none'
    httpOnly?: boolean
    secure?: boolean
    path?: string
  }
}

/**
 * Email/Password Configuration
 */
export interface EmailPasswordConfig {
  enabled: boolean
  requireEmailVerification?: boolean
}

/**
 * Password Validation Configuration
 */
export interface PasswordConfig {
  /**
   * Minimum password length
   * @default 8
   */
  minLength?: number
}

/**
 * CORS Configuration
 */
export interface CorsConfig {
  /**
   * Allowed origins for CORS requests
   * - Single origin: "https://example.com"
   * - Multiple origins: ["https://example.com", "https://app.example.com"]
   * - Allow all: "*"
   * @default "*"
   */
  origin?: string | string[]

  /**
   * Whether to allow credentials (cookies, authorization headers)
   * @default true
   */
  credentials?: boolean

  /**
   * Allowed HTTP methods
   * @default ["GET", "POST", "OPTIONS"]
   */
  methods?: string[]

  /**
   * Allowed headers
   * @default ["Content-Type", "Authorization"]
   */
  allowedHeaders?: string[]

  /**
   * Exposed headers
   */
  exposedHeaders?: string[]

  /**
   * Max age for preflight cache (in seconds)
   * @default 86400 (24 hours)
   */
  maxAge?: number
}

/**
 * Main Mech Auth Configuration
 */
export interface MechAuthConfig {
  /**
   * Database instance (Kysely)
   */
  database: Kysely<Database>

  /**
   * Secret key for session signing
   */
  secret: string

  /**
   * Base URL for the application (used for OAuth redirects)
   */
  baseUrl: string

  /**
   * OAuth providers configuration
   */
  oauth?: OAuthProvidersConfig

  /**
   * Session configuration
   */
  session?: SessionConfig

  /**
   * Email/password authentication configuration
   */
  emailPassword?: EmailPasswordConfig

  /**
   * Password validation configuration
   */
  password?: PasswordConfig

  /**
   * Password hashing implementation
   */
  passwordHasher?: PasswordHasher

  /**
   * CORS configuration for browser clients
   */
  cors?: CorsConfig

  /**
   * Production mode flag
   */
  isProduction?: boolean
}

/**
 * Standardized OAuth User Profile
 *
 * Normalized user data from OAuth providers (GitHub, Google, etc.)
 */
export interface OAuthUserProfile {
  /** Provider-specific user ID */
  id: string

  /** User's email address */
  email: string

  /** User's full name (may be null) */
  name: string | null

  /** User's avatar URL (may be null) */
  avatar_url: string | null

  /** Whether email is verified by provider */
  email_verified?: boolean
}

/**
 * OAuth State Parameter (CSRF protection)
 */
export interface OAuthState {
  /** Random state value */
  state: string

  /** Timestamp when state was created */
  createdAt: number
}

/**
 * OAuth Callback Result
 */
export interface OAuthCallbackResult {
  /** User profile from OAuth provider */
  profile: OAuthUserProfile

  /** Access token from provider (optional) */
  accessToken?: string

  /** Refresh token from provider (optional) */
  refreshToken?: string
}

/**
 * Request Context
 *
 * Information about the incoming HTTP request (for session creation)
 */
export interface RequestContext {
  /** Client IP address */
  ipAddress?: string

  /** User agent string */
  userAgent?: string
}
