# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
