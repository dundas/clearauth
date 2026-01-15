# ClearAuth

A lightweight authentication library built with **Arctic** (OAuth 2.0), pluggable password hashing, and **Mech Storage** as the database backend. Designed for teams who need production-ready auth with minimal bundle size (~15KB vs 150KB).

## Features

- **Arctic OAuth 2.0** - Lightweight OAuth with GitHub, Google support (~10KB)
- **Pluggable password hashing** - Argon2id (Node) and PBKDF2 (Edge)
- **Email/password authentication** - Built-in email verification and password reset
- **Session management** - Secure, database-backed sessions with configurable expiration
- **Mech Storage PostgreSQL** as the database (HTTP-based, no direct DB connection needed)
- **Cloudflare Workers compatible** - Use `clearauth/edge` for OAuth + email/password without native dependencies
- **React hooks** included (`useAuth`, `AuthProvider`)
- **TypeScript-first** - Full type safety with Kysely query builder
- **Minimal bundle size** - ~15KB (vs 150KB for Better Auth)

## Installation

> **Note:** Install from npm as `clearauth`.

```bash
npm install clearauth
```

Or using a specific version/tag:
```bash
npm install clearauth
```

Or add to `package.json`:
```json
{
  "dependencies": {
    "clearauth": "^0.3.0",
    "arctic": "^2.0.0"
  }
}
```

## Entrypoints

- **`clearauth`**
  - **Environment:** universal
  - **Default password hasher:** PBKDF2 (WebCrypto)
- **`clearauth/node`**
  - **Environment:** Node.js
  - **Default password hasher:** Argon2id
  - **API:** `createClearAuthNode(...)`
- **`clearauth/edge`**
  - **Environment:** Cloudflare Workers / edge runtimes
  - **Default password hasher:** PBKDF2 (no native dependencies)
  - **API:** `createClearAuth(...)`, `handleClearAuthEdgeRequest(...)`, `validateSession(...)`, `getSessionFromCookie(...)`, `parseCookies(...)`, `createSessionCookie(...)`, `createMechKysely(...)`
- **`clearauth/argon2`**
  - **Environment:** Node.js
  - **Export:** `createArgon2idPasswordHasher(...)` (use to explicitly override)

## Migration Notes

- **Password hashing default:** `createClearAuth(...)` defaults to PBKDF2 for portability (works in edge runtimes). If you want Argon2id by default in Node.js, use `createClearAuthNode(...)` from `clearauth/node`.
- **Cookie-based sessions:** `/auth/register` and `/auth/login` set the session cookie on success. `/auth/logout` supports cookie-based logout. If your client previously stored `sessionId` outside cookies, update it to rely on cookies (recommended) or continue sending an explicit `sessionId` in the logout request body.

## Quick Start

### Server Setup

Create `lib/auth.ts`:

```ts
import { createClearAuthNode } from "clearauth/node"

export const authConfig = createClearAuthNode({
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
import { handleClearAuthRequest } from "clearauth"
import { authConfig } from "@/lib/auth"

export async function GET(request: Request) {
  return handleClearAuthRequest(request, authConfig)
}

export async function POST(request: Request) {
  return handleClearAuthRequest(request, authConfig)
}
```

### Cloudflare Workers

ClearAuth runs entirely on Cloudflare Workers with no Node.js backend required. See [CLOUDFLARE.md](./CLOUDFLARE.md) for the full guide.

```ts
import { createClearAuth, handleClearAuthEdgeRequest } from "clearauth/edge"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/auth")) {
      const config = createClearAuth({
        secret: env.AUTH_SECRET,
        baseUrl: "https://your-worker.workers.dev",
        database: {
          appId: env.MECH_APP_ID,
          apiKey: env.MECH_API_KEY,
        },
        isProduction: true,
      })
      return handleClearAuthEdgeRequest(request, config)
    }

    return new Response("Hello World")
  }
}
```

#### Session Validation Middleware

```ts
import { getSessionFromCookie, createMechKysely } from "clearauth/edge"

// In your worker
const db = createMechKysely({ appId: env.MECH_APP_ID, apiKey: env.MECH_API_KEY })
const session = await getSessionFromCookie(request, db)

if (!session) {
  return new Response("Unauthorized", { status: 401 })
}
// session.user.email, session.user.id, etc.
```

See [`examples/cloudflare-workers/`](./examples/cloudflare-workers/) for a complete example.

### Express API

```ts
import express from 'express';
import { handleClearAuthRequest, validateSession, parseCookies } from 'clearauth';
import { createClearAuthNode } from 'clearauth/node';

const app = express();
const auth = createClearAuthNode({
  secret: process.env.AUTH_SECRET,
  baseUrl: process.env.BASE_URL,
  database: { appId: process.env.MECH_APP_ID, apiKey: process.env.MECH_API_KEY },
});

// Mount ClearAuth routes
app.all('/api/auth/*', async (req, res) => {
  const request = new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
  });
  const response = await handleClearAuthRequest(request, auth);
  res.status(response.status).send(await response.text());
});

// Auth middleware
async function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies.get('session');
  if (sessionId) {
    const result = await validateSession(sessionId, auth.database);
    if (result) { req.user = result.user; return next(); }
  }
  res.status(401).json({ error: 'Unauthorized' });
}

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));
```

See [`examples/express-api/`](./examples/express-api/) for a complete example.

### React Client

Wrap your app with `AuthProvider`:

```tsx
// app/providers.tsx
"use client"

import { AuthProvider } from "clearauth/react"

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

import { useAuth } from "clearauth/react"

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

## JWT Bearer Token Authentication

ClearAuth now supports stateless JWT Bearer token authentication for API and CLI access. This provides an alternative to cookie-based sessions for scenarios where cookies aren't suitable (mobile apps, CLIs, server-to-server).

### Features

- **Stateless Authentication** - No database lookup for access tokens (fast API auth)
- **Token Rotation** - Automatic refresh token rotation prevents replay attacks
- **Revocation Support** - Revoke individual tokens or all user tokens
- **ES256 Algorithm** - ECDSA with P-256 curve (edge-optimized, industry standard)
- **OAuth 2.0 Compliant** - Standard token response format
- **Edge Compatible** - Works in Cloudflare Workers, Vercel Edge, Node.js

### Installation

JWT support is included in `clearauth@0.5.0` and above:

```bash
npm install clearauth@latest
```

You can use the JWT functions from the main entrypoint or the dedicated JWT entrypoint:

```ts
// From main entrypoint
import { createAccessToken, validateBearerToken } from 'clearauth'

// Or from JWT-specific entrypoint
import { createAccessToken, validateBearerToken } from 'clearauth/jwt'
```

### Quick Start

#### 1. Generate ES256 Keys

First, generate an ES256 key pair for signing JWTs:

```bash
# Generate private key
openssl ecparam -genkey -name prime256v1 -noout -out private-key.pem

# Extract public key
openssl ec -in private-key.pem -pubout -out public-key.pem
```

Or use Node.js:

```ts
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose'

const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
const pemPrivateKey = await exportPKCS8(privateKey)
const pemPublicKey = await exportSPKI(publicKey)

console.log('Private key:', pemPrivateKey)
console.log('Public key:', pemPublicKey)
```

#### 2. Configure JWT

```ts
import { createClearAuthNode } from 'clearauth/node'

export const authConfig = createClearAuthNode({
  secret: process.env.AUTH_SECRET!,
  baseUrl: process.env.BASE_URL!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  jwt: {
    privateKey: process.env.JWT_PRIVATE_KEY!,  // PEM or JWK format
    publicKey: process.env.JWT_PUBLIC_KEY!,     // PEM or JWK format
    accessTokenTTL: 900,      // 15 minutes (default)
    refreshTokenTTL: 2592000, // 30 days (default)
    issuer: 'https://yourapp.com',      // Optional
    audience: 'https://api.yourapp.com', // Optional
  },
})
```

#### 3. Issue Tokens

Use the built-in token endpoint to exchange credentials for a JWT pair:

```ts
// POST /auth/token
import { handleTokenRequest } from 'clearauth'

const request = new Request('https://api.example.com/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: user.id,
    email: user.email,
    deviceName: 'iPhone 15 Pro', // optional
  }),
})

const response = await handleTokenRequest(request, db, authConfig.jwt)
const data = await response.json()

// Response:
// {
//   "accessToken": "eyJhbGc...",
//   "refreshToken": "rt_...",
//   "tokenType": "Bearer",
//   "expiresIn": 900,
//   "refreshTokenId": "token-uuid"
// }
```

Or create tokens directly:

```ts
import { createAccessToken, createRefreshToken } from 'clearauth/jwt'

// Create access token (JWT)
const accessToken = await createAccessToken(
  { sub: user.id, email: user.email },
  authConfig.jwt
)

// Create refresh token (opaque, stored in DB)
const { token: refreshToken, record } = await createRefreshToken(
  db,
  user.id,
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  'Mobile App' // optional device name
)
```

#### 4. Validate Bearer Tokens

```ts
import { validateBearerToken } from 'clearauth/jwt'

// In your API route handler
const payload = await validateBearerToken(request, authConfig.jwt)

if (!payload) {
  return new Response('Unauthorized', { status: 401 })
}

console.log('User ID:', payload.sub)
console.log('Email:', payload.email)
console.log('Expires:', new Date(payload.exp * 1000))
```

#### 5. Refresh Tokens

```ts
import { handleRefreshRequest } from 'clearauth/jwt'

// POST /auth/refresh
const request = new Request('https://api.example.com/auth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    refreshToken: oldRefreshToken,
  }),
})

const response = await handleRefreshRequest(request, db, authConfig.jwt)
const data = await response.json()

// Response: new access token + new refresh token (old one is revoked)
// {
//   "accessToken": "eyJhbGc...",
//   "refreshToken": "rt_new...",
//   "tokenType": "Bearer",
//   "expiresIn": 900,
//   "refreshTokenId": "new-token-uuid"
// }
```

#### 6. Revoke Tokens

```ts
import { handleRevokeRequest, revokeAllUserRefreshTokens } from 'clearauth/jwt'

// Revoke a single refresh token
const request = new Request('https://api.example.com/auth/revoke', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    refreshToken: tokenToRevoke,
  }),
})

await handleRevokeRequest(request, db)

// Or revoke all user tokens (emergency logout)
const count = await revokeAllUserRefreshTokens(db, userId)
console.log(`Revoked ${count} tokens`)
```

### Usage with Cloudflare Workers

JWT authentication works seamlessly in Cloudflare Workers:

```ts
import { validateBearerToken, createMechKysely } from 'clearauth/edge'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = createMechKysely({ appId: env.MECH_APP_ID, apiKey: env.MECH_API_KEY })

    const jwtConfig = {
      privateKey: env.JWT_PRIVATE_KEY,
      publicKey: env.JWT_PUBLIC_KEY,
      algorithm: 'ES256' as const,
    }

    // Validate Bearer token
    const payload = await validateBearerToken(request, jwtConfig)

    if (!payload) {
      return new Response('Unauthorized', { status: 401 })
    }

    // User is authenticated
    return new Response(`Hello ${payload.email}`)
  }
}
```

### CLI / Mobile App Usage

For CLI tools or mobile apps, store the refresh token securely and use it to get new access tokens:

```ts
// CLI app login flow
const loginResponse = await fetch('https://api.example.com/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: user.id,
    email: user.email,
    deviceName: 'CLI Tool v1.0',
  }),
})

const { accessToken, refreshToken } = await loginResponse.json()

// Store refresh token securely (OS keychain, encrypted file, etc.)
await secureStorage.set('refresh_token', refreshToken)

// Use access token for API requests
const apiResponse = await fetch('https://api.example.com/data', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
})

// When access token expires, refresh it
if (apiResponse.status === 401) {
  const refreshResponse = await fetch('https://api.example.com/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: await secureStorage.get('refresh_token'),
    }),
  })

  const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
    await refreshResponse.json()

  // Update stored tokens
  await secureStorage.set('refresh_token', newRefreshToken)

  // Retry API request with new access token
  const retryResponse = await fetch('https://api.example.com/data', {
    headers: {
      'Authorization': `Bearer ${newAccessToken}`,
    },
  })
}
```

### API Reference

#### JWT Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `privateKey` | `string` | Required | ES256 private key (PEM or JWK format) |
| `publicKey` | `string` | Required | ES256 public key (PEM or JWK format) |
| `accessTokenTTL` | `number` | `900` | Access token TTL in seconds (15 min) |
| `refreshTokenTTL` | `number` | `2592000` | Refresh token TTL in seconds (30 days) |
| `algorithm` | `'ES256'` | `'ES256'` | JWT signing algorithm (only ES256 supported in v1) |
| `issuer` | `string` | Optional | JWT issuer claim (iss) |
| `audience` | `string` | Optional | JWT audience claim (aud) |

#### Token Endpoints

- **`POST /auth/token`** - Exchange credentials for JWT pair
- **`POST /auth/refresh`** - Rotate refresh token and get new access token
- **`POST /auth/revoke`** - Revoke a refresh token

#### JWT Functions

```ts
// Token generation
createAccessToken(payload, jwtConfig): Promise<string>
createRefreshToken(db, userId, expiresAt, name?): Promise<{ token, record }>

// Token validation
verifyAccessToken(token, jwtConfig): Promise<AccessTokenPayload>
validateBearerToken(request, jwtConfig): Promise<AccessTokenPayload | null>

// Refresh token operations
rotateRefreshToken(db, oldToken, expiresAt): Promise<{ token, record } | null>
revokeRefreshToken(db, tokenId): Promise<RefreshToken>
revokeAllUserRefreshTokens(db, userId): Promise<number>

// HTTP handlers
handleTokenRequest(request, db, jwtConfig): Promise<Response>
handleRefreshRequest(request, db, jwtConfig): Promise<Response>
handleRevokeRequest(request, db): Promise<Response>
```

### Security Considerations

1. **Token Storage**
   - Access tokens: Short-lived (15 min), can be stored in memory
   - Refresh tokens: Long-lived (30 days), must be stored securely (HTTP-only cookies, encrypted storage)

2. **Token Rotation**
   - Always rotate refresh tokens on use
   - Revoke old refresh token when creating new one
   - Prevents replay attacks if tokens are compromised

3. **Revocation**
   - Implement "logout from all devices" using `revokeAllUserRefreshTokens()`
   - Monitor `last_used_at` timestamps for suspicious activity
   - Set up periodic cleanup of expired tokens

4. **Key Management**
   - Keep private keys secure (environment variables, secrets manager)
   - Rotate keys periodically (requires re-authentication)
   - Use separate keys for different environments (dev, staging, prod)

## Configuration

### Required Configuration

All configuration must be passed explicitly to `createClearAuth()`:

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

### Email Providers (Verification / Reset / Magic Link)

ClearAuth supports two approaches:

1. **Callbacks** via `config.email.sendVerificationEmail`, `config.email.sendPasswordResetEmail`, `config.email.sendMagicLink`.
2. **Built-in provider adapters** via `config.email.provider` (default templates).

Supported built-in provider adapters:
- `ResendProvider`
- `PostmarkProvider`
- `SendGridProvider`

Example (Resend):

```ts
import { createClearAuthNode, ResendProvider } from "clearauth"

const auth = createClearAuthNode({
  secret: process.env.AUTH_SECRET!,
  baseUrl: process.env.BASE_URL!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  email: {
    provider: new ResendProvider({
      apiKey: process.env.RESEND_API_KEY!,
      from: "Your App <no-reply@yourdomain.com>",
    }),
  },
})
```

### Session Presets

Three session configurations are available:

```ts
import {
  defaultSessionConfig,  // 7 days, sameSite: lax
  shortSessionConfig,    // 1 hour, sameSite: strict
  longSessionConfig      // 30 days, sameSite: lax
} from "clearauth"

const config = createClearAuth({
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

### `createClearAuth(options)`

Creates an authentication configuration object.

```ts
import { createClearAuth } from "clearauth"

const config = createClearAuth({
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

**Returns:** `ClearAuthConfig` - Configuration object to pass to `handleClearAuthRequest()`

### `handleClearAuthRequest(request, config)`

Universal request handler for all authentication routes.

```ts
import { handleClearAuthRequest } from "clearauth"

const response = await handleClearAuthRequest(request, authConfig)
```

**Parameters:**
- `request: Request` - Web standard Request object
- `config: ClearAuthConfig` - Configuration from `createClearAuth()`

**Returns:** `Promise<Response>` - Web standard Response object

### React Hooks

#### `<AuthProvider>`

Wraps your app to provide authentication context.

```tsx
import { AuthProvider } from "clearauth/react"

<AuthProvider baseUrl="/api/auth">
  {children}
</AuthProvider>
```

#### `useAuth()`

Access authentication state and actions.

```tsx
import { useAuth } from "clearauth/react"

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

All routes are handled by `handleClearAuthRequest()`:

| Route | Method | Description |
|-------|--------|-------------|
| `/auth/register` | POST | Email/password registration |
| `/auth/login` | POST | Email/password login |
| `/auth/logout` | POST | Sign out current user |
| `/auth/session` | GET | Get current session |
| `/auth/verify-email` | POST | Verify email with token |
| `/auth/resend-verification` | POST | Resend verification email |
| `/auth/request-reset` | POST | Request password reset |
| `/auth/reset-password` | POST | Reset password with token |
| `/auth/oauth/github` | GET | Initiate GitHub OAuth flow |
| `/auth/callback/github` | GET | GitHub OAuth callback |
| `/auth/oauth/google` | GET | Initiate Google OAuth flow |
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
2. Update `createClearAuth()` - returns `ClearAuthConfig` instead of auth instance
3. Use `handleClearAuthRequest()` instead of `auth.handler`
4. Update React imports from `better-auth/react` to `clearauth/react`
5. Update session config - uses new format with `cookie` object

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed migration steps.

## License

MIT
