# LightAuth

A lightweight authentication library built with **Arctic** (OAuth 2.0), pluggable password hashing, and **Mech Storage** as the database backend. Designed for teams who need production-ready auth with minimal bundle size (~15KB vs 150KB).

## Features

- ✅ **Arctic OAuth 2.0** - Lightweight OAuth with GitHub, Google support (~10KB)
- ✅ **Pluggable password hashing** - Argon2id (Node) and PBKDF2 (Edge)
- ✅ **Email/password authentication** - Built-in email verification and password reset
- ✅ **Session management** - Secure, database-backed sessions with configurable expiration
- ✅ **Mech Storage PostgreSQL** as the database (HTTP-based, no direct DB connection needed)
- ✅ **Cloudflare Workers compatible** - Use `lightauth/edge` for OAuth + email/password without native dependencies
- ✅ **React hooks** included (`useAuth`, `AuthProvider`)
- ✅ **TypeScript-first** - Full type safety with Kysely query builder
- ✅ **Minimal bundle size** - ~15KB (vs 150KB for Better Auth)

## Installation

> **Note:** Install from npm as `lightauth`.

```bash
npm install lightauth
```

Or using a specific version/tag:
```bash
npm install lightauth
```

Or add to `package.json`:
```json
{
  "dependencies": {
    "lightauth": "^0.3.0",
    "arctic": "^2.0.0"
  }
}
```

## Entrypoints

- **`lightauth`**
  - **Environment:** universal
  - **Default password hasher:** PBKDF2 (WebCrypto)
- **`lightauth/node`**
  - **Environment:** Node.js
  - **Default password hasher:** Argon2id
  - **API:** `createMechAuthNode(...)`
- **`lightauth/edge`**
  - **Environment:** Cloudflare Workers / edge runtimes
  - **Default password hasher:** PBKDF2 (no native dependencies)
  - **API:** `createMechAuth(...)`
- **`lightauth/argon2`**
  - **Environment:** Node.js
  - **Export:** `createArgon2idPasswordHasher(...)` (use to explicitly override)

## Quick Start

### Server Setup

Create `lib/auth.ts`:

```ts
import { createMechAuthNode } from "lightauth/node"

export const authConfig = createMechAuthNode({
  secret: process.env.AUTH_SECRET!,
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      redirectUri: `${process.env.BASE_URL}/api/auth/callback/github`,
    },
  },
})
```

### Next.js App Router

Create `app/api/auth/[...path]/route.ts`:

```ts
import { handleMechAuthRequest } from "lightauth"
import { authConfig } from "@/lib/auth"

export async function GET(request: Request) {
  return handleMechAuthRequest(request, authConfig)
}

export async function POST(request: Request) {
  return handleMechAuthRequest(request, authConfig)
}
```

### Cloudflare Workers

Create `src/auth.ts`:

```ts
import { createMechAuth, handleMechAuthRequest } from "lightauth"

export function createAuth(env: Env) {
  return createMechAuth({
    secret: env.AUTH_SECRET,
    baseUrl: "https://your-worker.workers.dev",
    database: {
      appId: env.MECH_APP_ID,
      apiKey: env.MECH_API_KEY,
    },
    isProduction: true,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/auth")) {
      const config = createAuth(env)
      return handleMechAuthRequest(request, config)
    }

    return new Response("Hello World")
  }
}
```

### React Client

Wrap your app with `AuthProvider`:

```tsx
// app/providers.tsx
"use client"

import { AuthProvider } from "lightauth/react"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider baseUrl="/api/auth">
      {children}
    </AuthProvider>
  )
}
```

Use in components:

```tsx
"use client"

import { useAuth } from "lightauth/react"

export function LoginButton() {
  const { user, loading, signIn, signOut } = useAuth()

  if (loading) return <p>Loading...</p>

  if (user) {
    return (
      <div>
        <p>Welcome, {user.email}!</p>
        <button onClick={signOut}>Sign Out</button>
      </div>
    )
  }

  return (
    <button onClick={() => signIn("user@example.com", "password")}>
      Sign In
    </button>
  )
}
```

## Configuration

### Required Configuration

All configuration must be passed explicitly to `createMechAuth()`:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `secret` | `string` | Yes | Secret for signing tokens (minimum 32 characters recommended) |
| `baseUrl` | `string` | Yes | Your application's base URL (e.g., `https://example.com`) |
| `database.appId` | `string` | Yes | Your Mech app UUID |
| `database.apiKey` | `string` | Yes | Your Mech API key |
| `isProduction` | `boolean` | No | Set to `true` in production (enables secure cookies) |

### Optional Configuration

| Parameter | Type | Description |
|-----------|------|-------------|
| `oauth` | `OAuthProvidersConfig` | OAuth provider configuration (GitHub, Google) |
| `session` | `SessionConfig` | Session configuration (expiration, cookie settings) |
| `password` | `PasswordConfig` | Password validation rules (minLength) |
| `cors` | `CorsConfig` | CORS configuration for browser clients |

### Session Presets

Three session configurations are available:

```ts
import {
  defaultSessionConfig,  // 7 days, sameSite: lax
  shortSessionConfig,    // 1 hour, sameSite: strict
  longSessionConfig      // 30 days, sameSite: lax
} from "lightauth"

const config = createMechAuth({
  // ...
  session: shortSessionConfig, // Use preset
})
```

### Environment Variables (Recommended Pattern)

**Node.js / Next.js (.env.local):**
```bash
AUTH_SECRET=your-secret-key-at-least-32-chars
BASE_URL=http://localhost:3000
MECH_APP_ID=550e8400-e29b-41d4-a716-446655440000
MECH_API_KEY=your-mech-api-key

# OAuth (optional)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

**Cloudflare Workers (wrangler.toml):**
```toml
[vars]
BASE_URL = "https://your-worker.workers.dev"

# Use `wrangler secret put` for sensitive values:
# wrangler secret put AUTH_SECRET
# wrangler secret put MECH_API_KEY
# wrangler secret put GITHUB_CLIENT_SECRET
```

## API Reference

### `createMechAuth(options)`

Creates an authentication configuration object.

```ts
import { createMechAuth } from "lightauth"

const config = createMechAuth({
  secret: process.env.AUTH_SECRET!,
  baseUrl: "https://example.com",
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      redirectUri: "https://example.com/auth/callback/github",
    },
  },
  session: defaultSessionConfig,
  password: { minLength: 12 },
})
```

**Returns:** `MechAuthConfig` - Configuration object to pass to `handleMechAuthRequest()`

### `handleMechAuthRequest(request, config)`

Universal request handler for all authentication routes.

```ts
import { handleMechAuthRequest } from "lightauth"

const response = await handleMechAuthRequest(request, authConfig)
```

**Parameters:**
- `request: Request` - Web standard Request object
- `config: MechAuthConfig` - Configuration from `createMechAuth()`

**Returns:** `Promise<Response>` - Web standard Response object

### React Hooks

#### `<AuthProvider>`

Wraps your app to provide authentication context.

```tsx
import { AuthProvider } from "lightauth/react"

<AuthProvider baseUrl="/api/auth">
  {children}
</AuthProvider>
```

#### `useAuth()`

Access authentication state and actions.

```tsx
import { useAuth } from "lightauth/react"

const {
  user,              // Current user or null
  loading,           // Loading state
  error,             // Error message or null
  signIn,            // (email, password) => Promise<void>
  signUp,            // (email, password, name?) => Promise<void>
  signOut,           // () => Promise<void>
  loginWithGithub,   // () => Promise<void>
  loginWithGoogle,   // () => Promise<void>
  refresh,           // () => Promise<void>
} = useAuth()
```

## Authentication Routes

All routes are handled by `handleMechAuthRequest()`:

| Route | Method | Description |
|-------|--------|-------------|
| `/auth/signup` | POST | Email/password signup |
| `/auth/login` | POST | Email/password login |
| `/auth/logout` | POST | Sign out current user |
| `/auth/session` | GET | Get current session |
| `/auth/verify-email` | POST | Request email verification |
| `/auth/reset-password` | POST | Request password reset |
| `/auth/reset-password/confirm` | POST | Confirm password reset with token |
| `/auth/github` | GET | Initiate GitHub OAuth flow |
| `/auth/callback/github` | GET | GitHub OAuth callback |
| `/auth/google` | GET | Initiate Google OAuth flow |
| `/auth/callback/google` | GET | Google OAuth callback |

## How It Works

1. **Arctic** handles OAuth 2.0 flows (GitHub, Google) with PKCE and state validation
2. **Argon2id** hashes passwords securely (memory-hard, side-channel resistant)
3. **Oslo** generates cryptographically secure tokens (base64url encoded)
4. **Kysely** provides type-safe SQL queries to Mech Storage
5. **Mech Storage** stores users, sessions, and OAuth accounts via HTTP API

This architecture means:
- No heavyweight auth frameworks required
- Works in any JavaScript runtime (Node.js, Cloudflare Workers, Deno, Bun)
- No direct database connections needed
- Minimal bundle size (~15KB vs 150KB)
- Full TypeScript type safety

## Security Features

- ✅ **Argon2id password hashing** - OWASP recommended, memory-hard algorithm
- ✅ **Email enumeration prevention** - Constant-time responses for password reset
- ✅ **CSRF protection** - State parameter validation in OAuth flows
- ✅ **PKCE for OAuth** - Prevents authorization code interception
- ✅ **Secure session cookies** - httpOnly, sameSite, secure flags
- ✅ **Token expiration** - Configurable session and token TTLs
- ✅ **Timing attack resistance** - Constant-time comparisons

## Cloudflare Compatibility

Compatible with Cloudflare Workers and Pages when using an HTTP-based database backend. Note that email/password uses `@node-rs/argon2` (native) and may require a Node runtime.

- ✅ **No `process.env` usage** - All configuration is explicit
- ✅ **Works with Workers `env` bindings** - Pass secrets from environment
- ✅ **HTTP-based database** - No TCP connections required
- ✅ **Edge-friendly** - No Node.js-specific APIs
- ✅ **Web Standards** - Uses Request/Response objects

## Development

```bash
# Install dependencies
bun install

# Run tests
bun run test

# Run tests in watch mode
bun run test:watch

# Build
bun run build

# Output appears in dist/
```

## Migration from Better Auth

If migrating from Better Auth:

1. Replace `better-auth` dependency with `arctic`, `@node-rs/argon2`, `oslo`
2. Update `createMechAuth()` - returns `MechAuthConfig` instead of auth instance
3. Use `handleMechAuthRequest()` instead of `auth.handler`
4. Update React imports from `better-auth/react` to `lightauth/react`
5. Update session config - uses new format with `cookie` object

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed migration steps.

## License

MIT
