/**
 * Factory function to create a complete ClearAuth configuration
 *
 * This module provides a convenient way to create a fully configured ClearAuthConfig
 * with sensible defaults for session management, cookies, and security settings.
 *
 * @module createClearAuth
 */

import { createMechKysely, type MechKyselyConfig } from "./mech-kysely.js"
import { ClearAuthConfigError } from "./errors.js"
import { getDefaultLogger } from "./logger.js"
import type { ClearAuthConfig } from "./types.js"
import { createPbkdf2PasswordHasher } from "./password-hasher.js"

// ============================================================================
// Session & Cookie Presets
// ============================================================================

/**
 * Default session configuration
 * - 7 day expiration
 * - Secure cookies in production
 * - SameSite: lax
 */
export const defaultSessionConfig = {
  expiresIn: 60 * 60 * 24 * 7, // 7 days
  cookie: {
    name: 'session',
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
  },
} as const

/**
 * Short-lived session configuration (for high-security apps)
 * - 1 hour expiration
 * - Strict cookies
 */
export const shortSessionConfig = {
  expiresIn: 60 * 60, // 1 hour
  cookie: {
    name: 'session',
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/',
  },
} as const

/**
 * Long-lived session configuration (for consumer apps)
 * - 30 day expiration
 * - Lax cookies for better UX
 */
export const longSessionConfig = {
  expiresIn: 60 * 60 * 24 * 30, // 30 days
  cookie: {
    name: 'session',
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
  },
} as const

// ============================================================================
// Database Configuration
// ============================================================================

/**
 * Simplified database configuration
 * Only appId and apiKey are required - everything else has smart defaults
 */
export type SimpleDatabaseConfig = {
  /** Mech App ID (required) */
  appId: string
  /** Mech API Key (required) */
  apiKey: string
  /** Base URL for Mech Storage. Defaults to "https://storage.mechdna.net" */
  baseUrl?: string
  /** App Schema ID. Defaults to appId */
  appSchemaId?: string
  /** Request timeout in ms. Defaults to 30000 */
  timeout?: number
  /** Max retry attempts. Defaults to 2 */
  maxRetries?: number
}

export type CreateClearAuthOptions = {
  /** Secret key for session signing (required) */
  secret: string
  /**
   * Database configuration. Can be:
   * - Simplified: { appId, apiKey } (recommended)
   * - Full config: { config: MechKyselyConfig }
   */
  database: SimpleDatabaseConfig | { config: MechKyselyConfig }
  /** Base URL for your application (required for OAuth redirects) */
  baseUrl: string
  /** Set to true if running in production */
  isProduction?: boolean
  /** Session configuration (optional, uses defaults if not provided) */
  session?: ClearAuthConfig['session']
  /** OAuth provider configuration (optional) */
  oauth?: ClearAuthConfig['oauth']
  /** Password validation configuration (optional) */
  password?: ClearAuthConfig['password']
  /** Password hashing implementation (optional) */
  passwordHasher?: ClearAuthConfig['passwordHasher']
}

/**
 * Helper to check if database config is the simplified format
 */
function isSimpleDatabaseConfig(db: unknown): db is SimpleDatabaseConfig {
  return db !== null && typeof db === 'object' && 'appId' in db && 'apiKey' in db
}

/**
 * Create a complete ClearAuth configuration
 *
 * All configuration must be provided explicitly - no environment variables are read.
 *
 * Configuration formats:
 *
 * 1. **Simplified config (recommended)**:
 *    ```ts
 *    const config = createClearAuth({
 *      secret: "your-secret-key",
 *      baseUrl: "https://yourdomain.com",
 *      database: { appId: "...", apiKey: "..." },
 *      isProduction: true,
 *      oauth: {
 *        github: {
 *          clientId: env.GITHUB_CLIENT_ID,
 *          clientSecret: env.GITHUB_CLIENT_SECRET,
 *          redirectUri: 'https://yourdomain.com/auth/callback/github',
 *        },
 *      },
 *    })
 *    ```
 *
 * 2. **With session presets**:
 *    ```ts
 *    const config = createClearAuth({
 *      secret: "your-secret-key",
 *      baseUrl: "https://yourdomain.com",
 *      database: { appId: "...", apiKey: "..." },
 *      session: longSessionConfig, // Use 30-day sessions
 *    })
 *    ```
 *
 * @param options - Configuration options
 * @returns A configured ClearAuthConfig object
 * @throws ClearAuthConfigError if required config is missing or invalid
 *
 * @example Cloudflare Workers setup
 * ```ts
 * import { createClearAuth, defaultSessionConfig } from 'clearauth'
 *
 * // ClearAuth automatically detects Cloudflare Workers and uses 100,000 PBKDF2 iterations
 * // (instead of the default 600,000) to comply with Cloudflare's WebCrypto limits
 * const config = createClearAuth({
 *   secret: env.AUTH_SECRET,
 *   baseUrl: 'https://yourdomain.com',
 *   database: {
 *     appId: env.MECH_APP_ID,
 *     apiKey: env.MECH_API_KEY,
 *   },
 *   isProduction: true,
 *   session: defaultSessionConfig,
 *   oauth: {
 *     github: {
 *       clientId: env.GITHUB_CLIENT_ID,
 *       clientSecret: env.GITHUB_CLIENT_SECRET,
 *       redirectUri: 'https://yourdomain.com/auth/callback/github',
 *     },
 *   },
 * })
 * ```
 *
 * @example Next.js setup
 * ```ts
 * import { createClearAuth } from 'clearauth'
 *
 * export const authConfig = createClearAuth({
 *   secret: process.env.AUTH_SECRET!,
 *   baseUrl: process.env.NEXT_PUBLIC_BASE_URL!,
 *   database: {
 *     appId: process.env.MECH_APP_ID!,
 *     apiKey: process.env.MECH_API_KEY!,
 *   },
 *   oauth: {
 *     github: {
 *       clientId: process.env.GITHUB_CLIENT_ID!,
 *       clientSecret: process.env.GITHUB_CLIENT_SECRET!,
 *       redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/auth/callback/github`,
 *     },
 *   },
 * })
 * ```
 */
export function createClearAuth(options: CreateClearAuthOptions): ClearAuthConfig {
  const logger = getDefaultLogger()

  // Validate required fields
  if (!options.secret) {
    throw new ClearAuthConfigError("secret is required", { isProduction: options.isProduction })
  }

  if (!options.baseUrl) {
    throw new ClearAuthConfigError("baseUrl is required", { isProduction: options.isProduction })
  }

  // Warn about development defaults
  if (options.secret === "better-auth-secret-123456789" || options.secret === "dev-secret-key") {
    if (options.isProduction) {
      throw new ClearAuthConfigError(
        "Cannot use default secret in production",
        { isProduction: options.isProduction }
      )
    }
    logger.warn("Using default secret. This is only safe in development.")
  }

  // Determine database config format
  let kyselyConfig: MechKyselyConfig

  if (isSimpleDatabaseConfig(options.database)) {
    // Simplified format: { appId, apiKey, ... }
    logger.debug("Creating auth config with simplified database config")
    kyselyConfig = {
      appId: options.database.appId,
      apiKey: options.database.apiKey,
      baseUrl: options.database.baseUrl,
      appSchemaId: options.database.appSchemaId,
      timeout: options.database.timeout,
      maxRetries: options.database.maxRetries,
    }
  } else if ('config' in options.database) {
    // Full config format: { config: MechKyselyConfig }
    logger.debug("Creating auth config with full database config")
    kyselyConfig = options.database.config
  } else {
    throw new ClearAuthConfigError("Invalid database configuration format", {
      database: options.database
    })
  }

  try {
    logger.debug("Creating Kysely instance...")
    const db = createMechKysely(kyselyConfig)
    logger.debug("Kysely created successfully")

    // Build final config
    const config: ClearAuthConfig = {
      database: db,
      secret: options.secret,
      baseUrl: options.baseUrl,
      isProduction: options.isProduction ?? false,
      session: options.session ?? defaultSessionConfig,
      oauth: options.oauth,
      password: options.password ?? {
        minLength: 8,
      },
      passwordHasher: options.passwordHasher ?? createPbkdf2PasswordHasher(),
    }

    return config
  } catch (err) {
    if (err instanceof ClearAuthConfigError) {
      throw err
    }
    throw new ClearAuthConfigError(`Failed to create ClearAuth config: ${(err as Error).message}`, {
      originalError: (err as Error).message
    })
  }
}
