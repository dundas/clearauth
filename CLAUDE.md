# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Install dependencies
npm install

# Build (outputs to dist/)
npm run build

# Run all tests
npm test

# Run a single test file
npx vitest run src/__tests__/createMechAuth.test.ts

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Architecture

ClearAuth is a lightweight authentication library providing OAuth 2.0 (via Arctic), email/password auth, and session management with Kysely-backed PostgreSQL storage via Mech Storage HTTP API.

### Entrypoints

| Entrypoint | Environment | Password Hasher | Main Export |
|------------|-------------|-----------------|-------------|
| `clearauth` | Universal | PBKDF2 | `createClearAuth()` |
| `clearauth/node` | Node.js | Argon2id | `createClearAuthNode()` |
| `clearauth/edge` | Cloudflare Workers | PBKDF2 | `createClearAuth()`, `handleClearAuthEdgeRequest()` |
| `clearauth/react` | Client | - | `AuthProvider`, `useAuth()` |
| `clearauth/argon2` | Node.js | - | `createArgon2idPasswordHasher()` |

### Core Flow

1. `createClearAuth()` / `createClearAuthNode()` creates a `ClearAuthConfig` with database, session, and OAuth settings
2. `handleClearAuthRequest()` is the unified HTTP handler that routes requests:
   - OAuth routes (`/auth/oauth/*`, `/auth/callback/*`) → `handleOAuthRequest()`
   - Auth routes (`/auth/login`, `/auth/register`, etc.) → `handleAuthRequest()`

### Key Source Files

- `src/createMechAuth.ts` - Factory function and session config presets
- `src/handler.ts` - Unified request router
- `src/types.ts` - Core TypeScript interfaces (`ClearAuthConfig`, `SessionConfig`, etc.)
- `src/database/schema.ts` - Kysely database schema (users, sessions, tokens)
- `src/mech-kysely.ts` - Kysely adapter for Mech Storage HTTP API
- `src/password-hasher.ts` - PBKDF2 implementation (edge-compatible)
- `src/password-hasher-argon2.ts` - Argon2id implementation (Node.js only)
- `src/oauth/` - OAuth provider implementations (GitHub, Google)
- `src/auth/` - Email/password auth handlers (login, register, reset-password)
- `src/react.tsx` - React hooks and AuthProvider

### Database Tables

- `users` - Core user records with OAuth provider IDs and password hashes
- `sessions` - Session tokens with expiration
- `email_verification_tokens` - Email verification flow
- `password_reset_tokens` - Password reset flow

### Testing

Tests use Vitest and are located in `__tests__` directories alongside source files. Test files follow the pattern `*.test.ts`.
