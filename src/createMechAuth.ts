/**
 * Factory function to create a complete mech-auth configuration
 *
 * This module provides a convenient way to create a fully configured MechAuthConfig
 * with sensible defaults for session management, cookies, and security settings.
 *
 * @module createMechAuth
 */

import { createMechKysely, type MechKyselyConfig } from "./mech-kysely.js"
import { MechConfigError } from "./errors.js"
import { getDefaultLogger } from "./logger.js"
import type { MechAuthConfig } from "./types.js"
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
    secure: true,
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
    secure: true,
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
    secure: true,
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

export type CreateMechAuthOptions = {
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
  session?: MechAuthConfig['session']
  /** OAuth provider configuration (optional) */
  oauth?: MechAuthConfig['oauth']
  /** Password validation configuration (optional) */
  password?: MechAuthConfig['password']
  /** Password hashing implementation (optional) */
  passwordHasher?: MechAuthConfig['passwordHasher']
}

/**
 * Helper to check if database config is the simplified format
 */
function isSimpleDatabaseConfig(db: unknown): db is SimpleDatabaseConfig {
  return db !== null && typeof db === 'object' && 'appId' in db && 'apiKey' in db
}

/**
 * Create a complete mech-auth configuration
 *
 * All configuration must be provided explicitly - no environment variables are read.
 *
 * Configuration formats:
 *
 * 1. **Simplified config (recommended)**:
 *    ```ts
 *    const config = createMechAuth({
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
 *    const config = createMechAuth({
 *      secret: "your-secret-key",
 *      baseUrl: "https://yourdomain.com",
 *      database: { appId: "...", apiKey: "..." },
 *      session: longSessionConfig, // Use 30-day sessions
 *    })
 *    ```
 *
 * @param options - Configuration options
 * @returns A configured MechAuthConfig object
 * @throws MechConfigError if required config is missing or invalid
 *
 * @example Cloudflare Workers setup
 * ```ts
 * import { createMechAuth, defaultSessionConfig } from 'lightauth'
 *
 * const config = createMechAuth({
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
 * import { createMechAuth } from 'lightauth'
 *
 * export const authConfig = createMechAuth({
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
export function createMechAuth(options: CreateMechAuthOptions): MechAuthConfig {
  const logger = getDefaultLogger()

  // Validate required fields
  if (!options.secret) {
    throw new MechConfigError("secret is required", { isProduction: options.isProduction })
  }

  if (!options.baseUrl) {
    throw new MechConfigError("baseUrl is required", { isProduction: options.isProduction })
  }

  // Warn about development defaults
  if (options.secret === "better-auth-secret-123456789" || options.secret === "dev-secret-key") {
    if (options.isProduction) {
      throw new MechConfigError(
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
    throw new MechConfigError("Invalid database configuration format", {
      database: options.database
    })
  }

  try {
    logger.debug("Creating Kysely instance...")
    const db = createMechKysely(kyselyConfig)
    logger.debug("Kysely created successfully")

    // Build final config
    const config: MechAuthConfig = {
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
    if (err instanceof MechConfigError) {
      throw err
    }
    throw new MechConfigError(`Failed to create mech-auth config: ${(err as Error).message}`, {
      originalError: (err as Error).message
    })
  }
}
