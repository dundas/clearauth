# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-01-17

### Added

- **Hardware-Backed Device Authentication** - Phishing-resistant authentication for Web3, iOS, and Android
  - **Multi-Platform Support** - Unified API for Web3 wallets, iOS App Attest, and Android Play Integrity
  - **Web3 Wallet Registration** - Hardware-backed authentication for MetaMask and Web3 wallets (EIP-191)
  - **iOS App Attest Support** - Secure Enclave-backed key attestation and verification
  - **Android Play Integrity Support** - Hardware-backed key attestation via Google Play Integrity API
  - **Request Signature Middleware** - Cryptographic verification of every API request via `verifyDeviceSignature()`
  - **Device Management API** - Endpoints for users to list, monitor, and revoke their registered devices
  - **Device-Bound JWTs** - Optional `deviceId` claim in JWT access tokens for enhanced session security
  - **Architecture Compatibility** - Lazy-loading native bindings to prevent crashes on mismatched architectures

  **New HTTP Endpoints:**
  - `POST /auth/challenge` - Generate one-time cryptographic challenge
  - `POST /auth/device/register` - Register a new hardware device (Web3, iOS, or Android)
  - `GET /auth/devices` - List all registered devices for the authenticated user (with pagination)
  - `DELETE /auth/devices/:deviceId` - Revoke a registered device (soft-delete with audit trail)

  **New Functions:**
  - `verifyDeviceSignature()` - Middleware to verify request signatures from registered devices
  - `listUserDevices()` / `listActiveDevices()` - Data layer functions for device management
  - `revokeDevice()` - Soft-delete device revocation
  - `verifyIOSAttestation()` - Complete iOS App Attest verification chain
  - `verifyIntegrityToken()` - Google Play Integrity token verification
  - `verifyEIP191Signature()` - Web3 personal_sign verification
  - `generateChallenge()` / `verifyChallenge()` - Challenge-response infrastructure

  **Database Schema:**
  - New `devices` table (migration 007) for hardware key storage
  - New `challenges` table (migration 008) for one-time challenge storage
  - Optimized indexes for user-based device queries and revocation

  **Documentation:**
  - Comprehensive README section with multi-platform device auth guide
  - Client SDK examples for TypeScript (Web3), Swift (iOS), and Kotlin (Android)
  - Troubleshooting guide updated for cross-architecture native binding issues

  **Testing:**
  - 194 new comprehensive tests covering all device authentication modules
  - Integration tests for all new HTTP endpoints
  - Total test suite increased to 518 passing tests

### Fixed

- **Cross-Architecture Native Bindings** - Implemented lazy-loading for `@node-rs/argon2` to prevent startup crashes when running on mismatched architectures (e.g., x64 Node on ARM64). The library now only attempts to load native bindings when hashing is actually performed, and provides clear error messages for environment mismatches.
- **Security Validation** - Hardened URL validation for device IDs to prevent path traversal and empty ID bypass.
- **Error Information Leakage** - Standardized generic error messages in API responses while maintaining detailed internal logging.

## [0.5.0] - 2026-01-15

### Added

- **JWT Bearer Token Authentication** - Complete stateless authentication for CLI tools, mobile apps, and API clients
  - **ES256 Algorithm** - ECDSA with P-256 curve for edge-optimized signing/verification
  - **Access Tokens** - 15-minute stateless JWT tokens (configurable TTL)
  - **Refresh Tokens** - 30-day revocable tokens stored in database (configurable TTL)
  - **Token Rotation** - Automatic refresh token rotation for enhanced security
  - **Revocation Support** - Soft-delete revocation with audit trail via `revoked_at` timestamp
  - **OAuth 2.0 Compliant** - Token responses follow RFC 6749 specification
  - **Edge Compatible** - Web Crypto API only, works in Cloudflare Workers, Vercel Edge, browsers, Node.js
  - **Zero Dependencies Added** - Uses existing `jose` library (6.1.3)

  **New HTTP Endpoints:**
  - `POST /auth/token` - Exchange credentials for JWT access + refresh token pair
  - `POST /auth/refresh` - Rotate refresh token and get new access token
  - `POST /auth/revoke` - Revoke refresh token (logout)

  **New Functions:**
  - `createAccessToken()` - Generate signed JWT access token
  - `verifyAccessToken()` - Verify and decode JWT access token
  - `parseBearerToken()` - Extract Bearer token from Authorization header
  - `validateBearerToken()` - Validate Bearer token from request
  - `createRefreshToken()` - Create revocable refresh token in database
  - `rotateRefreshToken()` - Securely rotate refresh token
  - `revokeRefreshToken()` - Revoke refresh token by ID
  - `revokeAllUserRefreshTokens()` - Revoke all tokens for a user
  - `cleanupExpiredTokens()` - Remove expired tokens from database

  **Database Schema:**
  - New `refresh_tokens` table with SHA-256 hashed tokens
  - Migration scripts: `006_create_refresh_tokens.sql` and `rollback_006.sql`
  - Indexes for performance: `idx_refresh_tokens_user`, `idx_refresh_tokens_expires`

  **Entrypoint:**
  - New `clearauth/jwt` submodule export for JWT-specific imports
  - All JWT types and functions exported from main `clearauth` package

  **Documentation:**
  - Comprehensive README section with ES256 key generation instructions
  - Usage examples for Node.js, Cloudflare Workers, CLI/mobile apps
  - API reference table with all endpoints and functions
  - Security considerations and best practices

  **Testing:**
  - 89 new comprehensive tests (31 signer + 36 refresh tokens + 22 handlers)
  - 100% code coverage for all JWT modules
  - All 320 tests passing

### Fixed

- **Automatic Cloudflare Workers PBKDF2 Iteration Count** - ClearAuth now automatically detects Cloudflare Workers environment and uses 100,000 PBKDF2 iterations (instead of 600,000) to comply with Cloudflare's WebCrypto PBKDF2 iteration limit. This prevents "iteration counts above 100000 are not supported" errors when using email/password authentication on Cloudflare Workers.
  - Runtime environment detection for Cloudflare Workers
  - Automatic fallback to 100,000 iterations on Cloudflare Workers
  - Maintains 600,000 iterations (OWASP recommended) for other environments
  - No configuration required - works automatically
  - Updated documentation in `CLOUDFLARE.md` with detailed explanation
  - Added JSDoc comments explaining the automatic detection

## [0.4.0] - 2026-01-12

### Added

- **Multi-Database Provider Support** - Expanded database compatibility beyond Mech Storage
  - **Neon PostgreSQL** - Serverless PostgreSQL with HTTP API (edge-compatible)
  - **Turso (libSQL)** - Edge-hosted distributed SQLite database
  - **Cloudflare D1** - Native SQLite for Cloudflare Workers
  - **PlanetScale** - Serverless MySQL with HTTP API (edge-compatible)
  - **Supabase PostgreSQL** - PostgreSQL with connection pooler for edge
  - Complete Kysely adapters for all providers with consistent API
  - Dynamic imports to avoid bundling unused providers
  - Connection pooling at Driver level for optimal performance
  - Comprehensive documentation in `docs/DATABASE_PROVIDERS.md`
  - Transparent limitations documentation in `docs/DATABASE_PROVIDERS_LIMITATIONS.md`
  - Complete migration scripts for SQLite (Turso/D1) and MySQL (PlanetScale)
  - All 5 database tables supported: users, sessions, email_verification_tokens, password_reset_tokens, magic_link_tokens
  - 29 passing tests covering all providers
  - Error sanitization to prevent credential exposure in logs
  - Helpful error messages with installation instructions

### Fixed

- **Connection Pooling** - Clients now cached at Driver level instead of per-query
  - Turso: Proper client caching with cleanup via `close()`
  - Supabase: postgres.js client cached with cleanup via `end()`
  - PlanetScale: Connection cached (stateless HTTP)
  - Prevents memory leaks and improves performance
- **Error Handling** - Better module detection and credential sanitization
  - Detects missing modules in both CJS and ESM environments
  - Sanitizes connection strings, auth tokens, and passwords in error messages
  - Provides helpful installation instructions with GitHub links
- **SQLite Trigger** - Fixed potential infinite recursion in timestamp update trigger
  - Added WHEN clause to only trigger when timestamp hasn't changed

### Documentation

- Added `DATABASE_PROVIDERS.md` with setup guides for all 6 providers
- Added `DATABASE_PROVIDERS_LIMITATIONS.md` documenting:
  - Schema type differences (PostgreSQL vs SQLite vs MySQL)
  - Transaction support limitations
  - Connection pooling constraints
  - Edge runtime requirements
  - Security considerations
  - Type conversion examples and workarounds
- Updated migration READMEs with complete setup instructions

## [0.3.2] - Previous Release

### Added

- **Magic Link Authentication** - Passwordless login via email
  - `POST /auth/request-magic-link` - Request magic link for existing users
  - `GET /auth/magic-link/verify` - Verify magic link and redirect with session cookie
  - Login-only flow (existing users only, prevents signup spam)
  - 15-minute token expiration for security
  - One-time use tokens (deleted after consumption)
  - Email enumeration prevention (always returns success)
  - Automatic email verification on successful login
  - `returnTo` redirect support with same-origin validation
  - React `requestMagicLink(email, returnTo?)` action
  - Comprehensive test coverage (19 tests)
  - Database schema: `magic_link_tokens` table

### Fixed

- **Cloudflare Pages Functions Compatibility** - Fixed request body parsing for edge runtimes
  - Changed from `request.json()` to `request.text()` + `JSON.parse()` approach
  - Resolves "Invalid JSON body" errors in Cloudflare Pages Functions
  - Better error messages for empty bodies, consumed streams, and malformed JSON
  - Added comprehensive test coverage (14 tests) for various body types and edge cases
  - Compatible with ReadableStream, Uint8Array, and standard string bodies
  - Fixes issue where POST requests (register, login, etc.) would fail in Cloudflare Pages Functions

- Fixed password reset payload mismatch between React client and server handler
  - Server now accepts both `password` (canonical) and `newPassword` (deprecated) fields for backward compatibility
  - React client updated to send `password` field to match server contract
  - Resolves issue where password reset requests from React client would fail
  - Added comprehensive test coverage for backward compatibility behavior
  - `newPassword` field support will be removed in v2.0.0

## [0.3.0] - 2025-12-12

### 🎉 Major Refactor - Arctic Migration

This release completely replaces Better Auth with a lightweight Arctic-based implementation, reducing bundle size from ~150KB to ~15KB while maintaining full feature parity.

### Added

- **Arctic OAuth 2.0** - Lightweight OAuth library for GitHub and Google (~10KB)
- **Argon2id password hashing** - Secure, OWASP-recommended password hashing via @node-rs/argon2
- **Oslo token generation** - Cryptographically secure token generation with base64url encoding
- **Custom session management** - Database-backed sessions with configurable expiration
- **Email/password authentication** - Built-in signup, login, email verification, password reset
- **React hooks** - Custom `AuthProvider` and `useAuth` hook
- **Session presets** - Three predefined session configs (default, short, long)
- **CORS support** - Configurable CORS for browser clients
- **Password validation** - Configurable minimum length and validation rules
- **Email enumeration prevention** - Constant-time responses for password reset
- **Comprehensive test coverage** - 67+ tests for security, validation, token generation

### Changed

- **BREAKING**: Replaced `better-auth` with `arctic`, `@node-rs/argon2`, `oslo`
- **BREAKING**: `createClearAuth()` now returns `ClearAuthConfig` instead of Better Auth instance
- **BREAKING**: Use `handleClearAuthRequest(request, config)` instead of `auth.handler`
- **BREAKING**: React imports changed from `better-auth/react` to `clearauth/react`
- **BREAKING**: Session config uses new format with `cookie` object:
  ```ts
  // Old (Better Auth)
  session: { updateAge: 86400 }

  // New (Arctic)
  session: {
    expiresIn: 604800,  // 7 days in seconds
    cookie: {
      name: 'session',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/'
    }
  }
  ```
- **BREAKING**: `baseUrl` parameter now required in `createClearAuth()`
- Reduced bundle size from ~150KB to ~15KB (90% reduction)
- Improved TypeScript types with full Kysely integration
- Enhanced security with Argon2id and PKCE for OAuth

### Removed

- **BREAKING**: Removed `better-auth` dependency
- **BREAKING**: Removed all Better Auth plugins and middleware
- **BREAKING**: Removed `auth.handler` - use `handleClearAuthRequest()` instead
- **BREAKING**: Removed automatic `process.env` reading (explicit config only)

### Migration Guide

**Install new dependencies:**
```bash
npm uninstall better-auth
npm install arctic @node-rs/argon2 oslo
```

**Update server code:**
```ts
// Before (Better Auth)
import { createClearAuth } from "clearauth"

const auth = createClearAuth({
  emailAndPassword: { enabled: true }
})

export const handler = auth.handler

// After (Arctic)
import { createClearAuth, handleClearAuthRequest } from "clearauth"

const config = createClearAuth({
  secret: process.env.AUTH_SECRET!,
  baseUrl: process.env.BASE_URL!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
})

export async function handler(request: Request) {
  return handleClearAuthRequest(request, config)
}
```

**Update React code:**
```ts
// Before
import { useSession, signIn } from "better-auth/react"

// After
import { useAuth } from "clearauth/react"

function Component() {
  const { user, signIn } = useAuth()
  // ...
}
```

**Update session config:**
```ts
// Before
import { createClearAuth } from "clearauth"

const auth = createClearAuth({
  session: {
    updateAge: 86400 // 1 day
  }
})

// After
import { createClearAuth, defaultSessionConfig } from "clearauth"

const config = createClearAuth({
  // ...
  session: defaultSessionConfig, // or shortSessionConfig, longSessionConfig
})
```

### Security Improvements

- Argon2id password hashing (memory-hard, side-channel resistant)
- PKCE for OAuth (prevents authorization code interception)
- Email enumeration prevention (constant-time responses)
- Base64url token encoding (URL-safe, no padding)
- Improved CSRF protection with state validation

## [0.2.0] - 2025-12-11

### Added

- **Cloudflare Workers compatibility**: Library now works in any JavaScript runtime (Cloudflare Workers, Deno, Bun, etc.)
- **Cloudflare Pages support**: Full documentation including routing workarounds for Pages Functions
- Explicit configuration API - all parameters must be passed directly to `createClearAuth()`
- `isProduction` parameter for runtime environment detection
- Comprehensive deployment guide comparing Next.js/Vercel, Cloudflare Workers, and Cloudflare Pages
- Updated integration examples for Next.js (with `toNextJsHandler`), Vite, Cloudflare Workers, and Cloudflare Pages
- Platform comparison table showing routing differences and best use cases

### Installation

> **Note:** Install with:
> ```bash
> npm install clearauth
> ```

### Changed

- **BREAKING**: `secret` parameter is now **required** (was optional, no longer falls back to env vars)
- **BREAKING**: `database` configuration is now **required** (no longer reads from env vars)
- **BREAKING**: `createClearAuth()` no longer reads `process.env` automatically
- **BREAKING**: `MechSqlClient` constructor now requires config object (no env var fallback)
- **BREAKING**: `createMechKysely()` now requires config parameter (no env var fallback)
- `createCookieConfig()` now accepts `isProduction` parameter instead of reading `process.env.NODE_ENV`
- Updated all documentation to reflect explicit configuration requirements

### Removed

- **BREAKING**: Removed all `process.env` access from library code
- **BREAKING**: Removed automatic environment variable detection
- **BREAKING**: Removed env var fallback behavior in all constructors and factory functions

### Migration Guide

**Before (0.1.0):**
```ts
// Library automatically read from process.env
const auth = createClearAuth({
  emailAndPassword: { enabled: true }
})
```

**After (0.2.0):**
```ts
// Explicit configuration required
const auth = createClearAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  isProduction: process.env.NODE_ENV === "production",
  emailAndPassword: { enabled: true }
})
```

### Documentation

- Added comprehensive [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- Added Cloudflare Workers and Pages examples
- Updated README with runtime compatibility matrix
- Added platform-specific routing documentation

## [0.1.0] - 2025-11-26

### Added

- Initial release
- Better Auth integration with Mech Storage PostgreSQL backend
- HTTP-based database access via Mech Storage API
- Kysely query builder with custom Mech dialect
- React client (`useSession`, `signIn`, `signUp`, `signOut`)
- Email/password authentication
- Social login support (GitHub, Google via Better Auth)
- Next.js App Router support
- TypeScript support
- Automatic environment variable configuration

### Features

- ✅ Better Auth out of the box
- ✅ Mech Storage PostgreSQL as database backend
- ✅ Works in Node.js and Cloudflare Workers (with manual config)
- ✅ React hooks included
- ✅ TypeScript-first

### Documentation

- README with quick start guide
- Integration examples
- API reference
- Contributing guidelines
