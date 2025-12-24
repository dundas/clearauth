/**
 * ClearAuth Edge Runtime Entrypoint
 *
 * This module provides edge-compatible authentication utilities that work
 * in Cloudflare Workers, Vercel Edge, Deno Deploy, and other edge runtimes.
 *
 * All exports in this module are free of native Node.js dependencies.
 *
 * @module clearauth/edge
 */

import type { ClearAuthConfig } from "./types.js"
import { handleClearAuthRequest } from "./handler.js"

// Core configuration
export {
  createClearAuth,
  defaultSessionConfig,
  longSessionConfig,
  shortSessionConfig,
} from "./createMechAuth.js"

// Types
export type { CorsConfig, ClearAuthConfig, OAuthProviderConfig, OAuthProvidersConfig, SessionConfig } from "./types.js"

// Database utilities
export { createMechKysely } from "./mech-kysely.js"
export type { MechKyselyConfig } from "./mech-kysely.js"

// Database schema types
export type {
  Database,
  User,
  Session,
  PublicUser,
  NewUser,
  NewSession,
} from "./database/schema.js"

// Session validation utilities
export {
  validateSession,
  getSessionFromCookie,
} from "./session/validate.js"
export type {
  ValidateSessionResult,
  GetSessionFromCookieOptions,
} from "./session/validate.js"

// Cookie utilities
export {
  parseCookies,
  createSessionCookie,
} from "./utils/cookies.js"
export type { SessionCookieConfig } from "./utils/cookies.js"

/**
 * Handle authentication requests on edge runtime
 *
 * This is the main request handler for ClearAuth on edge runtimes.
 * It routes requests to the appropriate handler (OAuth or email/password).
 *
 * @param request - The HTTP request
 * @param config - ClearAuth configuration
 * @returns HTTP response
 *
 * @example
 * ```typescript
 * import { createClearAuth, handleClearAuthEdgeRequest } from 'clearauth/edge';
 *
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     const config = createClearAuth({
 *       secret: env.AUTH_SECRET,
 *       baseUrl: 'https://myapp.workers.dev',
 *       database: { appId: env.MECH_APP_ID, apiKey: env.MECH_API_KEY },
 *       isProduction: true,
 *     });
 *
 *     return handleClearAuthEdgeRequest(request, config);
 *   }
 * }
 * ```
 */
export async function handleClearAuthEdgeRequest(request: Request, config: ClearAuthConfig): Promise<Response> {
  return await handleClearAuthRequest(request, config)
}
