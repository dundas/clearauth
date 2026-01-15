# PRD-0003: JWT Bearer Token Support

## 1. Introduction/Overview

ClearAuth currently provides cookie-based session authentication, which works well for browser-based web applications. However, non-browser clients (CLI tools, mobile apps, IoT devices) cannot use cookies and require bearer token authentication.

This PRD defines the addition of JWT (JSON Web Token) bearer token support to ClearAuth as a **separate entrypoint** (`clearauth/jwt`), enabling stateless authentication via `Authorization: Bearer <token>` headers while maintaining backwards compatibility with existing cookie-based sessions.

### Context

This feature is driven by [Teleportation](https://teleportation.dev/) requirements:
- **teleportation-cli**: CLI tool requiring non-cookie authentication
- **Mobile apps**: Native apps without browser cookie support
- **Web app**: Can use existing cookies OR JWT for unified identity

The implementation must remain **lightweight** and **edge-compatible** (Cloudflare Workers, Vercel Edge) since ClearAuth supports multiple runtime environments.

---

## 2. Goals

| Goal | Description |
|------|-------------|
| **G1** | Enable CLI/API authentication without cookies via Bearer tokens |
| **G2** | Support long-lived credentials that don't require frequent re-login |
| **G3** | Allow token revocation from web UI for security |
| **G4** | Maintain unified identity across web/CLI/mobile clients |
| **G5** | Minimize database lookups for performance (stateless access tokens) |
| **G6** | Keep ClearAuth lightweight with opt-in JWT via separate entrypoint |
| **G7** | Remain edge-compatible (Cloudflare Workers, Vercel Edge, Deno) |

---

## 3. User Stories

### Developer Stories

| ID | Story |
|----|-------|
| **US-1** | As a developer, I want to add JWT support to my ClearAuth app by importing from `clearauth/jwt`, so that I can enable bearer token authentication without changing existing cookie-based code. |
| **US-2** | As a developer, I want to generate access/refresh token pairs after OAuth or email login, so that I can return them to CLI/mobile clients. |
| **US-3** | As a developer, I want to verify access tokens without database lookups, so that API requests are fast and scalable. |
| **US-4** | As a developer, I want to configure token TTLs (time-to-live), so that I can balance security vs. convenience for my use case. |

### End User Stories

| ID | Story |
|----|-------|
| **US-5** | As a CLI user, I want to authenticate once and stay logged in for 30+ days, so that I don't have to re-login frequently. |
| **US-6** | As a CLI user, I want my access token to automatically refresh when expired, so that my workflow isn't interrupted. |
| **US-7** | As a web user, I want to see and revoke my CLI/mobile sessions from a web dashboard, so that I can secure my account if a device is lost. |
| **US-8** | As a user, I want my web login and CLI login to share the same identity, so that my actions are attributed to the same account. |

---

## 4. Functional Requirements

### FR-1: Token Pair Architecture

| ID | Requirement |
|----|-------------|
| **FR-1.1** | System SHALL support two token types: short-lived **access tokens** and long-lived **refresh tokens** |
| **FR-1.2** | Access tokens SHALL be stateless JWTs validated via signature only (no database lookup) |
| **FR-1.3** | Refresh tokens SHALL be stored in the database for revocation support |
| **FR-1.4** | Access token default TTL SHALL be 900 seconds (15 minutes) |
| **FR-1.5** | Refresh token default TTL SHALL be 2,592,000 seconds (30 days) |
| **FR-1.6** | Both TTLs SHALL be configurable via `JwtConfig` |

### FR-2: JWT Configuration

| ID | Requirement |
|----|-------------|
| **FR-2.1** | `JwtConfig` interface SHALL include: `accessTokenTTL`, `refreshTokenTTL`, `algorithm`, `privateKey`, `publicKey` |
| **FR-2.2** | Algorithm SHALL default to `ES256` (ECDSA with P-256 curve) |
| **FR-2.3** | System SHALL support ES256 algorithm only in initial release (extensible later) |
| **FR-2.4** | Private key SHALL be required for token signing |
| **FR-2.5** | Public key SHALL be required for token verification |

```typescript
interface JwtConfig {
  accessTokenTTL?: number;    // Default: 900 (15 min)
  refreshTokenTTL?: number;   // Default: 2592000 (30 days)
  algorithm?: 'ES256';        // Only ES256 for v1
  privateKey: string;         // ES256 private key (PEM or JWK)
  publicKey: string;          // ES256 public key (PEM or JWK)
}
```

### FR-3: Token Generation

| ID | Requirement |
|----|-------------|
| **FR-3.1** | `createTokenPair(user, config)` SHALL generate both access and refresh tokens |
| **FR-3.2** | Access token payload SHALL include: `sub` (user_id), `email`, `iat`, `exp` |
| **FR-3.3** | Access token SHALL NOT include sensitive data (password_hash, etc.) |
| **FR-3.4** | Refresh token SHALL be a cryptographically random string (32 bytes, base64url) |
| **FR-3.5** | Refresh token SHALL be hashed (SHA-256) before database storage |
| **FR-3.6** | `createTokenPair` SHALL insert refresh token record into database |

```typescript
function createTokenPair(user: User, db: Database, config: JwtConfig): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}>
```

### FR-4: Access Token Verification

| ID | Requirement |
|----|-------------|
| **FR-4.1** | `verifyAccessToken(token, publicKey)` SHALL verify signature and expiration |
| **FR-4.2** | Verification SHALL NOT require database lookup (stateless) |
| **FR-4.3** | Function SHALL return decoded payload on success, `null` on failure |
| **FR-4.4** | Function SHALL reject expired tokens |
| **FR-4.5** | Function SHALL reject tokens with invalid signatures |

```typescript
function verifyAccessToken(token: string, publicKey: string): {
  userId: string;
  email: string;
  exp: number;
  iat: number;
} | null
```

### FR-5: Token Refresh Flow

| ID | Requirement |
|----|-------------|
| **FR-5.1** | `refreshTokens(refreshToken, db, config)` SHALL validate refresh token against database |
| **FR-5.2** | Function SHALL check `revoked_at` is null (not revoked) |
| **FR-5.3** | Function SHALL check `expires_at > now` (not expired) |
| **FR-5.4** | On success, function SHALL generate new access token |
| **FR-5.5** | On success, function SHALL rotate refresh token (issue new, invalidate old) |
| **FR-5.6** | Function SHALL update `last_used_at` timestamp |
| **FR-5.7** | Function SHALL return `null` if refresh token is invalid/revoked/expired |

```typescript
function refreshTokens(
  refreshToken: string,
  db: Database,
  config: JwtConfig
): Promise<{
  accessToken: string;
  refreshToken: string;  // New rotated token
  expiresIn: number;
} | null>
```

### FR-6: Token Revocation

| ID | Requirement |
|----|-------------|
| **FR-6.1** | `revokeRefreshToken(tokenId, userId, db)` SHALL set `revoked_at` timestamp |
| **FR-6.2** | Revoked tokens SHALL be rejected on next refresh attempt |
| **FR-6.3** | Access tokens SHALL remain valid until natural expiration (max 15 min) |
| **FR-6.4** | `revokeAllUserTokens(userId, db)` SHALL revoke all refresh tokens for a user |
| **FR-6.5** | Revocation SHALL be callable from web UI (dashboard) |

```typescript
function revokeRefreshToken(tokenId: string, userId: string, db: Database): Promise<boolean>
function revokeAllUserTokens(userId: string, db: Database): Promise<number>
```

### FR-7: Database Schema

| ID | Requirement |
|----|-------------|
| **FR-7.1** | System SHALL create `refresh_tokens` table for token storage |
| **FR-7.2** | Table SHALL include: `id`, `user_id`, `token_hash`, `name`, `expires_at`, `created_at`, `last_used_at`, `revoked_at` |
| **FR-7.3** | `token_hash` SHALL store SHA-256 hash of refresh token (not plaintext) |
| **FR-7.4** | `name` field SHALL allow user-friendly labels ("MacBook Pro", "Work Laptop") |
| **FR-7.5** | `user_id` SHALL reference `users.id` with ON DELETE CASCADE |

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash
  name VARCHAR(255),                         -- User-friendly label
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP                       -- NULL = active
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
```

### FR-8: HTTP Handler Integration

| ID | Requirement |
|----|-------------|
| **FR-8.1** | `POST /auth/token` SHALL exchange credentials for token pair |
| **FR-8.2** | `POST /auth/token/refresh` SHALL exchange refresh token for new token pair |
| **FR-8.3** | `DELETE /auth/token/:id` SHALL revoke specific refresh token |
| **FR-8.4** | `GET /auth/tokens` SHALL list user's active refresh tokens |
| **FR-8.5** | All endpoints SHALL require authentication (session cookie OR valid access token) |

### FR-9: Authorization Header Support

| ID | Requirement |
|----|-------------|
| **FR-9.1** | System SHALL accept `Authorization: Bearer <access_token>` header |
| **FR-9.2** | Bearer token validation SHALL take precedence over cookie validation |
| **FR-9.3** | If both cookie and bearer token present, bearer token SHALL be used |
| **FR-9.4** | Invalid bearer token SHALL return 401 Unauthorized |

### FR-10: Separate Entrypoint

| ID | Requirement |
|----|-------------|
| **FR-10.1** | JWT functionality SHALL be exported from `clearauth/jwt` entrypoint |
| **FR-10.2** | Main `clearauth` entrypoint SHALL NOT include JWT code (tree-shaking) |
| **FR-10.3** | JWT module SHALL use `jose` library for edge-compatible signing/verification |
| **FR-10.4** | Existing cookie-based auth SHALL continue working unchanged |

```typescript
// New entrypoint: clearauth/jwt
export {
  createTokenPair,
  verifyAccessToken,
  refreshTokens,
  revokeRefreshToken,
  revokeAllUserTokens,
  handleJwtAuthRequest,  // HTTP handler for /auth/token routes
} from './jwt/index.js';

export type { JwtConfig, TokenPair, AccessTokenPayload } from './jwt/types.js';
```

---

## 5. Non-Goals (Out of Scope)

| ID | Non-Goal |
|----|----------|
| **NG-1** | API key management (named, long-lived keys with scopes) - future PRD |
| **NG-2** | Multiple algorithm support (RS256, HS256) - ES256 only for v1 |
| **NG-3** | Token introspection endpoint (RFC 7662) |
| **NG-4** | OAuth2 client credentials flow |
| **NG-5** | OpenID Connect (OIDC) compliance |
| **NG-6** | JWT encryption (JWE) - only signing (JWS) |
| **NG-7** | Immediate access token revocation (requires DB check, defeats purpose) |

---

## 6. Design Considerations

### Token Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         JWT TOKEN FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. LOGIN (OAuth or Email/Password)                                 │
│     ┌─────────┐      ┌─────────┐      ┌──────────────────────────┐  │
│     │ Client  │ ──── │ Server  │ ──── │ createTokenPair(user)    │  │
│     └─────────┘      └─────────┘      └──────────────────────────┘  │
│          │                                        │                 │
│          │◄───────────────────────────────────────┘                 │
│          │   { accessToken, refreshToken, expiresIn }               │
│                                                                     │
│  2. API REQUESTS (Stateless)                                        │
│     ┌─────────┐      ┌─────────┐      ┌──────────────────────────┐  │
│     │ Client  │ ──── │ Server  │ ──── │ verifyAccessToken()      │  │
│     └─────────┘      └─────────┘      │ (NO database lookup!)    │  │
│     Authorization:         │          └──────────────────────────┘  │
│     Bearer <accessToken>   │                      │                 │
│                            │◄─────────────────────┘                 │
│                            │   { userId, email } from JWT           │
│                                                                     │
│  3. TOKEN REFRESH (When access token expires)                       │
│     ┌─────────┐      ┌─────────┐      ┌──────────────────────────┐  │
│     │ Client  │ ──── │ Server  │ ──── │ refreshTokens()          │  │
│     └─────────┘      └─────────┘      │ (Database lookup)        │  │
│     POST /auth/token/refresh          │ - Check not revoked      │  │
│     { refreshToken }                  │ - Rotate token           │  │
│          │                            └──────────────────────────┘  │
│          │◄───────────────────────────────────────┘                 │
│          │   { accessToken, refreshToken (new), expiresIn }         │
│                                                                     │
│  4. REVOCATION (From web UI)                                        │
│     ┌─────────┐      ┌─────────┐      ┌──────────────────────────┐  │
│     │ Web UI  │ ──── │ Server  │ ──── │ revokeRefreshToken()     │  │
│     └─────────┘      └─────────┘      │ Sets revoked_at          │  │
│     DELETE /auth/token/:id            └──────────────────────────┘  │
│                                                                     │
│     Next refresh attempt → REJECTED → User must re-login            │
│     Existing access token → Valid for up to 15 min (acceptable)     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Dual Authentication Support

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DUAL AUTH: Cookie + Bearer                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Request arrives                                                    │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────────────────────────┐                            │
│  │ Authorization: Bearer <token> ?     │                            │
│  └─────────────────────────────────────┘                            │
│       │ YES                      │ NO                               │
│       ▼                          ▼                                  │
│  ┌─────────────┐          ┌─────────────────────┐                   │
│  │ Verify JWT  │          │ Cookie: session ?   │                   │
│  │ (stateless) │          └─────────────────────┘                   │
│  └─────────────┘                │ YES        │ NO                   │
│       │                         ▼            ▼                      │
│       │                   ┌───────────┐  ┌────────────┐             │
│       │                   │ Validate  │  │ 401        │             │
│       │                   │ session   │  │ Unauth     │             │
│       │                   │ (DB)      │  └────────────┘             │
│       │                   └───────────┘                             │
│       │                         │                                   │
│       └────────────┬────────────┘                                   │
│                    ▼                                                │
│              req.user = { id, email, ... }                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Why ES256?

| Algorithm | Key Size | Performance | Edge Support | Use Case |
|-----------|----------|-------------|--------------|----------|
| **HS256** | 256-bit shared | Fastest | Yes | Single service (secret sharing risk) |
| **RS256** | 2048-bit RSA | Slower | Yes | Multi-service (large keys) |
| **ES256** | 256-bit ECDSA | Fast | Yes | Multi-service, edge-optimized |

ES256 is ideal for ClearAuth because:
- Small key size (256-bit vs 2048-bit RSA)
- Fast verification (important for edge functions)
- Asymmetric (no secret sharing between services)
- Industry standard (Apple, Google use ES256)
- Native Web Crypto API support (edge-compatible)

---

## 7. Technical Considerations

### Dependencies

| Dependency | Purpose | Size | Edge Compatible |
|------------|---------|------|-----------------|
| `jose` | JWT signing/verification | ~45KB | Yes (Web Crypto API) |

**Note**: `jose` is preferred over `jsonwebtoken` because:
- Edge-compatible (uses Web Crypto API)
- Smaller bundle size
- TypeScript-first
- Actively maintained

### Key Generation

```bash
# Generate ES256 key pair for development
openssl ecparam -genkey -name prime256v1 -noout -out private.pem
openssl ec -in private.pem -pubout -out public.pem

# Or using jose CLI
npx jose generate-key-pair ES256 --verbose
```

### Security Considerations

| Risk | Mitigation |
|------|------------|
| Refresh token theft | Hash before storage, rotate on use |
| Access token theft | Short TTL (15 min), no sensitive data in payload |
| Key compromise | Support key rotation (add `kid` header in future) |
| Algorithm confusion | Hardcode ES256, reject others |
| Replay attacks | Include `iat` (issued at), validate `exp` |

### Performance Impact

| Operation | Database | Latency |
|-----------|----------|---------|
| Access token verify | None | ~1ms (signature check only) |
| Refresh token validate | 1 SELECT | ~5-10ms |
| Token revocation | 1 UPDATE | ~5-10ms |
| List user tokens | 1 SELECT | ~5-10ms |

### Migration Path

Existing ClearAuth users:
1. No breaking changes to `clearauth` entrypoint
2. JWT is opt-in via `clearauth/jwt`
3. Cookie sessions continue working unchanged
4. Can run both auth methods simultaneously

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Adoption** | 50% of new ClearAuth projects use JWT | npm downloads, GitHub usage |
| **Performance** | Access token verification < 5ms | Benchmarks |
| **Bundle size** | JWT entrypoint < 50KB gzipped | Build output |
| **Revocation latency** | Refresh rejected within 1 request | Integration tests |
| **Documentation** | README covers JWT setup in < 5 min read | User feedback |

---

## 9. Open Questions

| ID | Question | Options | Decision |
|----|----------|---------|----------|
| **Q1** | Should we support multiple algorithms in v1? | A) ES256 only, B) ES256 + RS256 | ES256 only (simpler, sufficient) |
| **Q2** | Should refresh tokens support scopes? | A) No scopes, B) Basic scopes | No scopes for v1 (API keys can add later) |
| **Q3** | Where should token metadata be stored? | A) Same DB as users, B) Separate table | Same DB, `refresh_tokens` table |
| **Q4** | Should we auto-migrate existing sessions to JWT? | A) No, B) Optional migration | No (separate concerns) |
| **Q5** | Should `verifyAccessToken` be sync or async? | A) Sync, B) Async | Async (Web Crypto is async) |
| **Q6** | Include `jose` as dependency or peer dependency? | A) Dependency, B) Peer | Dependency (simpler DX) |

---

## 10. Implementation Phases

### Phase 1: Core JWT Module
- [ ] Create `src/jwt/` directory structure
- [ ] Implement `JwtConfig` types
- [ ] Implement `createTokenPair()` using `jose`
- [ ] Implement `verifyAccessToken()`
- [ ] Add unit tests

### Phase 2: Refresh Token System
- [ ] Add `refresh_tokens` table to schema
- [ ] Implement `refreshTokens()` with rotation
- [ ] Implement `revokeRefreshToken()`
- [ ] Implement `revokeAllUserTokens()`
- [ ] Add integration tests

### Phase 3: HTTP Handlers
- [ ] Implement `POST /auth/token` endpoint
- [ ] Implement `POST /auth/token/refresh` endpoint
- [ ] Implement `DELETE /auth/token/:id` endpoint
- [ ] Implement `GET /auth/tokens` endpoint
- [ ] Add Authorization header parsing to main handler

### Phase 4: Entrypoint & Documentation
- [ ] Create `clearauth/jwt` entrypoint in package.json
- [ ] Ensure tree-shaking works (no JWT in main bundle)
- [ ] Update README with JWT usage examples
- [ ] Add key generation guide
- [ ] Publish release

---

## Appendix A: API Reference (Draft)

```typescript
// clearauth/jwt

// ─────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────

interface JwtConfig {
  /** Access token TTL in seconds. Default: 900 (15 min) */
  accessTokenTTL?: number;

  /** Refresh token TTL in seconds. Default: 2592000 (30 days) */
  refreshTokenTTL?: number;

  /** Signing algorithm. Default: 'ES256' */
  algorithm?: 'ES256';

  /** ES256 private key (PEM format) */
  privateKey: string;

  /** ES256 public key (PEM format) */
  publicKey: string;

  /** Optional issuer claim */
  issuer?: string;

  /** Optional audience claim */
  audience?: string;
}

// ─────────────────────────────────────────────────────────────────
// TOKEN TYPES
// ─────────────────────────────────────────────────────────────────

interface TokenPair {
  /** JWT access token */
  accessToken: string;

  /** Opaque refresh token */
  refreshToken: string;

  /** Access token TTL in seconds */
  expiresIn: number;

  /** Refresh token ID (for revocation) */
  refreshTokenId: string;
}

interface AccessTokenPayload {
  /** User ID (subject) */
  sub: string;

  /** User email */
  email: string;

  /** Issued at (Unix timestamp) */
  iat: number;

  /** Expires at (Unix timestamp) */
  exp: number;

  /** Issuer (if configured) */
  iss?: string;

  /** Audience (if configured) */
  aud?: string;
}

// ─────────────────────────────────────────────────────────────────
// FUNCTIONS
// ─────────────────────────────────────────────────────────────────

/**
 * Generate access + refresh token pair for authenticated user
 */
function createTokenPair(
  user: { id: string; email: string },
  db: Database,
  config: JwtConfig,
  options?: { name?: string }
): Promise<TokenPair>;

/**
 * Verify access token signature and expiration (stateless)
 */
function verifyAccessToken(
  token: string,
  publicKey: string
): Promise<AccessTokenPayload | null>;

/**
 * Exchange refresh token for new token pair (rotates refresh token)
 */
function refreshTokens(
  refreshToken: string,
  db: Database,
  config: JwtConfig
): Promise<TokenPair | null>;

/**
 * Revoke a specific refresh token
 */
function revokeRefreshToken(
  tokenId: string,
  userId: string,
  db: Database
): Promise<boolean>;

/**
 * Revoke all refresh tokens for a user
 */
function revokeAllUserTokens(
  userId: string,
  db: Database
): Promise<number>;

/**
 * List active refresh tokens for a user
 */
function listUserTokens(
  userId: string,
  db: Database
): Promise<Array<{
  id: string;
  name: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}>>;

/**
 * HTTP handler for /auth/token/* routes
 */
function handleJwtAuthRequest(
  request: Request,
  config: ClearAuthConfig & { jwt: JwtConfig }
): Promise<Response>;
```

---

## Appendix B: Usage Example

```typescript
// server.ts
import { createClearAuth, handleClearAuthRequest } from 'clearauth';
import { handleJwtAuthRequest, verifyAccessToken, type JwtConfig } from 'clearauth/jwt';

const jwtConfig: JwtConfig = {
  privateKey: process.env.JWT_PRIVATE_KEY!,
  publicKey: process.env.JWT_PUBLIC_KEY!,
  accessTokenTTL: 900,      // 15 minutes
  refreshTokenTTL: 2592000, // 30 days
};

const auth = createClearAuth({
  database: { connectionString: process.env.DATABASE_URL! },
  session: { expiresIn: 604800 }, // Cookie sessions still work
  oauth: { /* ... */ },
});

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);

    // JWT token routes
    if (url.pathname.startsWith('/auth/token')) {
      return handleJwtAuthRequest(request, { ...auth.config, jwt: jwtConfig });
    }

    // Cookie-based auth routes (unchanged)
    if (url.pathname.startsWith('/auth/')) {
      return handleClearAuthRequest(request, auth.config);
    }

    // Protected API route - check Bearer token first, then cookie
    if (url.pathname.startsWith('/api/')) {
      const authHeader = request.headers.get('Authorization');

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = await verifyAccessToken(token, jwtConfig.publicKey);

        if (!payload) {
          return new Response('Unauthorized', { status: 401 });
        }

        // req.user = { id: payload.sub, email: payload.email }
        return handleApiRequest(request, payload);
      }

      // Fall back to cookie session
      // ... existing cookie validation
    }
  }
};
```

---

*PRD Author: Claude Code*
*Created: 2025-01-15*
*Status: Draft*
