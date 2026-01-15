# Task List: JWT Bearer Token Support

**Source PRD:** `tasks/0003-prd-jwt-bearer-token-support.md`
**Generated:** 2025-01-15

---

## Relevant Files

### New Files to Create

**JWT Module:**
- `src/jwt/types.ts` - JWT configuration and token type definitions
- `src/jwt/signer.ts` - ES256 JWT signing and verification using jose
- `src/jwt/refresh-tokens.ts` - Refresh token CRUD operations
- `src/jwt/handler.ts` - HTTP handler for /auth/token/* routes
- `src/jwt/index.ts` - Public exports for clearauth/jwt entrypoint
- `src/jwt/__tests__/signer.test.ts` - JWT signing/verification tests (15+ assertions)
- `src/jwt/__tests__/refresh-tokens.test.ts` - Refresh token operations tests (20+ assertions)
- `src/jwt/__tests__/handler.test.ts` - HTTP handler tests (25+ assertions)

**Database Schema:**
- `migrations/006_create_refresh_tokens.sql` - Refresh tokens table migration

### Existing Files to Modify

- `src/database/schema.ts` - Add RefreshTokensTable interface and types
- `src/types.ts` - Add JwtConfig to ClearAuthConfig (optional)
- `src/session/validate.ts` - Add Bearer token extraction helper
- `package.json` - Add clearauth/jwt entrypoint and jose dependency

---

## Commit & PR Strategy

### Commit Frequency
- **Small commits:** After each logical unit of work (e.g., one function + test)
- **Commit message format:** `type(scope): description`
- **Types:** `feat`, `fix`, `test`, `refactor`, `docs`, `chore`

### PR Strategy
- **5 PRs total** (one per logical phase)
- Each PR includes: implementation + tests + documentation
- PR naming: `feat(jwt): [description]`
- Merge strategy: Squash and merge to keep main branch clean

### PR Dependencies
```
PR #1 (Tasks 1.0 + 3.0) → can start immediately
PR #2 (Task 2.0)        → depends on PR #1
PR #3 (Task 4.0)        → depends on PR #2
PR #4 (Tasks 5.0 + 6.0) → depends on PR #3
PR #5 (Task 7.0)        → depends on PR #4
```

---

## Tasks

### 1.0 JWT Types & Configuration
**Agent:** `tdd-developer`
**PR:** `#1 - feat(jwt): add JWT types and refresh tokens schema`
**Effort:** Small
**Depends on:** (none)

- [ ] **1.1** Create JWT types file with JwtConfig interface
  - **File:** `src/jwt/types.ts` (create)
  - **Action:** Define `JwtConfig` interface with `accessTokenTTL`, `refreshTokenTTL`, `algorithm`, `privateKey`, `publicKey`, `issuer?`, `audience?`
  - **Test:** N/A (type definitions only)
  - **Commit:** `feat(jwt): add JwtConfig interface`
  - **Agent:** `tdd-developer`

- [ ] **1.2** Add TokenPair interface
  - **File:** `src/jwt/types.ts` (modify)
  - **Action:** Define `TokenPair` interface with `accessToken`, `refreshToken`, `expiresIn`, `refreshTokenId`
  - **Test:** N/A (type definitions only)
  - **Commit:** `feat(jwt): add TokenPair interface`
  - **Agent:** `tdd-developer`

- [ ] **1.3** Add AccessTokenPayload interface
  - **File:** `src/jwt/types.ts` (modify)
  - **Action:** Define `AccessTokenPayload` with `sub`, `email`, `iat`, `exp`, `iss?`, `aud?`
  - **Test:** N/A (type definitions only)
  - **Commit:** `feat(jwt): add AccessTokenPayload interface`
  - **Agent:** `tdd-developer`

- [ ] **1.4** Add JWT default constants
  - **File:** `src/jwt/types.ts` (modify)
  - **Action:** Export `DEFAULT_ACCESS_TOKEN_TTL = 900`, `DEFAULT_REFRESH_TOKEN_TTL = 2592000`
  - **Test:** N/A (constants only)
  - **Commit:** `feat(jwt): add JWT TTL constants`
  - **Agent:** `tdd-developer`

---

### 2.0 JWT Signer Module
**Agent:** `tdd-developer`
**PR:** `#2 - feat(jwt): implement ES256 JWT signing with jose`
**Effort:** Medium
**Depends on:** PR #1

- [ ] **2.1** Install jose dependency
  - **File:** `package.json` (modify)
  - **Action:** Add `jose` to dependencies (edge-compatible JWT library)
  - **Test:** Run `npm install` and verify no errors
  - **Commit:** `chore(deps): add jose for JWT signing`
  - **Agent:** `tdd-developer`

- [ ] **2.2** Implement createAccessToken function
  - **File:** `src/jwt/signer.ts` (create)
  - **Action:** Create `createAccessToken(payload, privateKey, config)` using `jose.SignJWT` with ES256 algorithm. Include `sub`, `email`, `iat`, `exp` claims.
  - **Test:** `src/jwt/__tests__/signer.test.ts` - Test token generation with valid key (3+ assertions)
  - **Commit:** `feat(jwt): implement createAccessToken with ES256`
  - **Agent:** `tdd-developer`

- [ ] **2.3** Implement verifyAccessToken function
  - **File:** `src/jwt/signer.ts` (modify)
  - **Action:** Create `verifyAccessToken(token, publicKey)` using `jose.jwtVerify`. Return `AccessTokenPayload` or `null` on failure.
  - **Test:** `src/jwt/__tests__/signer.test.ts` - Test valid token verification, expired token rejection, invalid signature rejection (5+ assertions)
  - **Commit:** `feat(jwt): implement verifyAccessToken with signature validation`
  - **Agent:** `tdd-developer`

- [ ] **2.4** Add key import helpers
  - **File:** `src/jwt/signer.ts` (modify)
  - **Action:** Create `importPrivateKey(pem)` and `importPublicKey(pem)` wrappers for jose key import. Support both PEM and JWK formats.
  - **Test:** `src/jwt/__tests__/signer.test.ts` - Test PEM key import, invalid key rejection (4+ assertions)
  - **Commit:** `feat(jwt): add ES256 key import helpers`
  - **Agent:** `tdd-developer`

- [ ] **2.5** Add algorithm validation
  - **File:** `src/jwt/signer.ts` (modify)
  - **Action:** Ensure only ES256 algorithm is accepted. Reject tokens signed with other algorithms to prevent algorithm confusion attacks.
  - **Test:** `src/jwt/__tests__/signer.test.ts` - Test rejection of HS256/RS256 tokens, none algorithm (3+ assertions)
  - **Commit:** `feat(jwt): add strict ES256 algorithm validation`
  - **Agent:** `reliability-engineer`

---

### 3.0 Refresh Token Database Schema
**Agent:** `tdd-developer`
**PR:** `#1 - feat(jwt): add JWT types and refresh tokens schema` (same PR as 1.0)
**Effort:** Small
**Depends on:** (none) - can run parallel with 1.0

- [ ] **3.1** Create refresh_tokens migration
  - **File:** `migrations/006_create_refresh_tokens.sql` (create)
  - **Action:** Create `refresh_tokens` table with: `id` (UUID), `user_id` (FK), `token_hash` (VARCHAR 64, unique), `name` (VARCHAR 255), `expires_at`, `created_at`, `last_used_at`, `revoked_at`. Add indexes on `user_id` and `token_hash`.
  - **Test:** Manual verification via SQL execution
  - **Commit:** `feat(jwt): add refresh_tokens table migration`
  - **Agent:** `tdd-developer`

- [ ] **3.2** Add RefreshTokensTable interface
  - **File:** `src/database/schema.ts` (modify)
  - **Action:** Define `RefreshTokensTable` interface with Kysely column types matching migration
  - **Test:** TypeScript compilation check
  - **Commit:** `feat(jwt): add RefreshTokensTable to schema types`
  - **Agent:** `tdd-developer`

- [ ] **3.3** Add refresh_tokens to Database interface
  - **File:** `src/database/schema.ts` (modify)
  - **Action:** Add `refresh_tokens: RefreshTokensTable` to `Database` interface
  - **Test:** TypeScript compilation check
  - **Commit:** `feat(jwt): include refresh_tokens in Database schema`
  - **Agent:** `tdd-developer`

- [ ] **3.4** Add RefreshToken type aliases
  - **File:** `src/database/schema.ts` (modify)
  - **Action:** Export `RefreshToken = Selectable<RefreshTokensTable>`, `NewRefreshToken = Insertable<RefreshTokensTable>`, `RefreshTokenUpdate = Updateable<RefreshTokensTable>`
  - **Test:** TypeScript compilation check
  - **Commit:** `feat(jwt): add RefreshToken type aliases`
  - **Agent:** `tdd-developer`

- [ ] **3.5** Add isValidRefreshToken helper
  - **File:** `src/database/schema.ts` (modify)
  - **Action:** Create `isValidRefreshToken(token)` that checks `expires_at > now` AND `revoked_at === null`
  - **Test:** Unit test in existing schema tests
  - **Commit:** `feat(jwt): add isValidRefreshToken helper`
  - **Agent:** `tdd-developer`

---

### 4.0 Refresh Token Operations
**Agent:** `tdd-developer`
**PR:** `#3 - feat(jwt): implement refresh token operations with rotation`
**Effort:** Medium
**Depends on:** PR #2

- [ ] **4.1** Implement hashRefreshToken utility
  - **File:** `src/jwt/refresh-tokens.ts` (create)
  - **Action:** Create `hashRefreshToken(token)` using SHA-256 via Web Crypto API. Return hex-encoded hash.
  - **Test:** `src/jwt/__tests__/refresh-tokens.test.ts` - Test hash consistency, different inputs produce different hashes (3+ assertions)
  - **Commit:** `feat(jwt): add SHA-256 refresh token hashing`
  - **Agent:** `tdd-developer`

- [ ] **4.2** Implement createTokenPair function
  - **File:** `src/jwt/refresh-tokens.ts` (modify)
  - **Action:** Create `createTokenPair(user, db, config, options?)`. Generate access token via signer, generate random refresh token, hash it, store in DB with user_id, name, expires_at. Return `TokenPair`.
  - **Test:** `src/jwt/__tests__/refresh-tokens.test.ts` - Test pair generation, DB record creation, token format (5+ assertions)
  - **Commit:** `feat(jwt): implement createTokenPair with DB storage`
  - **Agent:** `tdd-developer`

- [ ] **4.3** Implement refreshTokens function
  - **File:** `src/jwt/refresh-tokens.ts` (modify)
  - **Action:** Create `refreshTokens(refreshToken, db, config)`. Hash incoming token, lookup in DB, validate not revoked/expired, generate new token pair, rotate (delete old, insert new), update last_used_at. Return new `TokenPair` or `null`.
  - **Test:** `src/jwt/__tests__/refresh-tokens.test.ts` - Test successful refresh, rotation, expired rejection, revoked rejection (6+ assertions)
  - **Commit:** `feat(jwt): implement refreshTokens with rotation`
  - **Agent:** `reliability-engineer`

- [ ] **4.4** Implement revokeRefreshToken function
  - **File:** `src/jwt/refresh-tokens.ts` (modify)
  - **Action:** Create `revokeRefreshToken(tokenId, userId, db)`. Set `revoked_at = now` for matching token. Return `true` if updated, `false` if not found.
  - **Test:** `src/jwt/__tests__/refresh-tokens.test.ts` - Test successful revocation, not found case, already revoked case (3+ assertions)
  - **Commit:** `feat(jwt): implement revokeRefreshToken`
  - **Agent:** `tdd-developer`

- [ ] **4.5** Implement revokeAllUserTokens function
  - **File:** `src/jwt/refresh-tokens.ts` (modify)
  - **Action:** Create `revokeAllUserTokens(userId, db)`. Set `revoked_at = now` for all non-revoked tokens for user. Return count of revoked tokens.
  - **Test:** `src/jwt/__tests__/refresh-tokens.test.ts` - Test bulk revocation, count accuracy, idempotency (3+ assertions)
  - **Commit:** `feat(jwt): implement revokeAllUserTokens`
  - **Agent:** `tdd-developer`

- [ ] **4.6** Implement listUserTokens function
  - **File:** `src/jwt/refresh-tokens.ts` (modify)
  - **Action:** Create `listUserTokens(userId, db)`. Query non-revoked tokens for user, return array with `id`, `name`, `createdAt`, `lastUsedAt`.
  - **Test:** `src/jwt/__tests__/refresh-tokens.test.ts` - Test listing, empty result, excludes revoked (3+ assertions)
  - **Commit:** `feat(jwt): implement listUserTokens`
  - **Agent:** `tdd-developer`

---

### 5.0 JWT HTTP Handler
**Agent:** `tdd-developer`
**PR:** `#4 - feat(jwt): add HTTP handlers and Bearer auth support`
**Effort:** Medium
**Depends on:** PR #3

- [ ] **5.1** Create JWT handler structure
  - **File:** `src/jwt/handler.ts` (create)
  - **Action:** Create `handleJwtAuthRequest(request, config)` with route matching for `/auth/token`, `/auth/token/refresh`, `/auth/tokens`. Return 404 for unknown routes.
  - **Test:** `src/jwt/__tests__/handler.test.ts` - Test route matching, 404 for unknown (3+ assertions)
  - **Commit:** `feat(jwt): add JWT handler structure with routing`
  - **Agent:** `tdd-developer`

- [ ] **5.2** Implement POST /auth/token endpoint
  - **File:** `src/jwt/handler.ts` (modify)
  - **Action:** Handle `POST /auth/token`. Require valid session cookie. Call `createTokenPair()` for authenticated user. Return `{ accessToken, refreshToken, expiresIn, refreshTokenId }`. Accept optional `name` in body.
  - **Test:** `src/jwt/__tests__/handler.test.ts` - Test success with cookie, 401 without auth, response format (5+ assertions)
  - **Commit:** `feat(jwt): implement POST /auth/token endpoint`
  - **Agent:** `tdd-developer`

- [ ] **5.3** Implement POST /auth/token/refresh endpoint
  - **File:** `src/jwt/handler.ts` (modify)
  - **Action:** Handle `POST /auth/token/refresh`. Parse `refreshToken` from body. Call `refreshTokens()`. Return new token pair or 401 if invalid.
  - **Test:** `src/jwt/__tests__/handler.test.ts` - Test successful refresh, invalid token 401, missing body 400 (5+ assertions)
  - **Commit:** `feat(jwt): implement POST /auth/token/refresh endpoint`
  - **Agent:** `reliability-engineer`

- [ ] **5.4** Implement DELETE /auth/token/:id endpoint
  - **File:** `src/jwt/handler.ts` (modify)
  - **Action:** Handle `DELETE /auth/token/:id`. Require authentication (cookie or bearer). Extract token ID from path. Call `revokeRefreshToken()`. Return 200 on success, 404 if not found.
  - **Test:** `src/jwt/__tests__/handler.test.ts` - Test successful revocation, 404 not found, 401 unauthorized (4+ assertions)
  - **Commit:** `feat(jwt): implement DELETE /auth/token/:id endpoint`
  - **Agent:** `tdd-developer`

- [ ] **5.5** Implement GET /auth/tokens endpoint
  - **File:** `src/jwt/handler.ts` (modify)
  - **Action:** Handle `GET /auth/tokens`. Require authentication. Call `listUserTokens()`. Return array of token metadata.
  - **Test:** `src/jwt/__tests__/handler.test.ts` - Test list response, empty array, 401 unauthorized (4+ assertions)
  - **Commit:** `feat(jwt): implement GET /auth/tokens endpoint`
  - **Agent:** `tdd-developer`

- [ ] **5.6** Add CORS support to JWT handler
  - **File:** `src/jwt/handler.ts` (modify)
  - **Action:** Handle OPTIONS preflight requests. Apply CORS headers from config. Reuse existing CORS utility from `src/utils/cors.ts`.
  - **Test:** `src/jwt/__tests__/handler.test.ts` - Test OPTIONS response, CORS headers present (3+ assertions)
  - **Commit:** `feat(jwt): add CORS support to JWT handler`
  - **Agent:** `tdd-developer`

---

### 6.0 Authorization Header Support
**Agent:** `reliability-engineer`
**PR:** `#4 - feat(jwt): add HTTP handlers and Bearer auth support` (same PR as 5.0)
**Effort:** Small
**Depends on:** PR #2

- [ ] **6.1** Create extractBearerToken utility
  - **File:** `src/jwt/signer.ts` (modify)
  - **Action:** Create `extractBearerToken(request)`. Parse `Authorization` header, return token if `Bearer ` prefix present, else `null`.
  - **Test:** `src/jwt/__tests__/signer.test.ts` - Test extraction, missing header, malformed header (4+ assertions)
  - **Commit:** `feat(jwt): add extractBearerToken utility`
  - **Agent:** `tdd-developer`

- [ ] **6.2** Create authenticateRequest helper
  - **File:** `src/jwt/handler.ts` (modify)
  - **Action:** Create `authenticateRequest(request, config)`. Try Bearer token first (verify JWT), then fall back to cookie session. Return `{ userId, email }` or `null`.
  - **Test:** `src/jwt/__tests__/handler.test.ts` - Test bearer priority, cookie fallback, both missing (5+ assertions)
  - **Commit:** `feat(jwt): implement dual auth (bearer + cookie) in authenticateRequest`
  - **Agent:** `reliability-engineer`

- [ ] **6.3** Document dual authentication flow
  - **File:** `src/jwt/handler.ts` (modify)
  - **Action:** Add JSDoc comments explaining Bearer token takes precedence over cookie, stateless vs stateful validation paths.
  - **Test:** N/A (documentation)
  - **Commit:** `docs(jwt): document dual authentication flow`
  - **Agent:** `tdd-developer`

---

### 7.0 Package Entrypoint & Exports
**Agent:** `tdd-developer`
**PR:** `#5 - feat(jwt): add clearauth/jwt entrypoint`
**Effort:** Small
**Depends on:** PR #4

- [ ] **7.1** Create JWT index file with exports
  - **File:** `src/jwt/index.ts` (create)
  - **Action:** Export all public API: `createTokenPair`, `verifyAccessToken`, `refreshTokens`, `revokeRefreshToken`, `revokeAllUserTokens`, `listUserTokens`, `handleJwtAuthRequest`, `extractBearerToken`. Export types: `JwtConfig`, `TokenPair`, `AccessTokenPayload`.
  - **Test:** TypeScript compilation check
  - **Commit:** `feat(jwt): create jwt/index.ts with public exports`
  - **Agent:** `tdd-developer`

- [ ] **7.2** Add clearauth/jwt entrypoint to package.json
  - **File:** `package.json` (modify)
  - **Action:** Add `"./jwt"` to exports map pointing to `./dist/jwt/index.js` and `./dist/jwt/index.d.ts`
  - **Test:** Build and verify import works: `import { createTokenPair } from 'clearauth/jwt'`
  - **Commit:** `feat(jwt): add clearauth/jwt entrypoint to package.json`
  - **Agent:** `tdd-developer`

- [ ] **7.3** Verify tree-shaking (no JWT in main bundle)
  - **File:** N/A
  - **Action:** Build package, verify `dist/index.js` does NOT import jose or JWT code. Use bundler analysis or manual inspection.
  - **Test:** Manual verification of dist/index.js contents
  - **Commit:** N/A (verification only)
  - **Agent:** `tdd-developer`

- [ ] **7.4** Add JWT section to README
  - **File:** `README.md` (modify)
  - **Action:** Add "JWT Bearer Token Support" section with: installation, key generation, configuration example, usage example (token creation, verification, refresh).
  - **Test:** N/A (documentation)
  - **Commit:** `docs: add JWT bearer token documentation to README`
  - **Agent:** `tdd-developer`

- [ ] **7.5** Update CHANGELOG
  - **File:** `CHANGELOG.md` (modify)
  - **Action:** Add entry for v0.5.0 with JWT bearer token support feature
  - **Test:** N/A (documentation)
  - **Commit:** `chore: update CHANGELOG for v0.5.0 JWT support`
  - **Agent:** `tdd-developer`

- [ ] **7.X** Create PR and merge Phase 5
  - **Action:** Create PR with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

## Summary

**Total Tasks:** 35 sub-tasks across 7 parent tasks
**Total PRs:** 5 PRs

| PR | Tasks | Description |
|----|-------|-------------|
| #1 | 1.0 + 3.0 | JWT types + refresh tokens schema |
| #2 | 2.0 | JWT signer with jose |
| #3 | 4.0 | Refresh token operations |
| #4 | 5.0 + 6.0 | HTTP handlers + Bearer auth |
| #5 | 7.0 | Entrypoint + documentation |

**Total Tests:** 60+ assertions across 3 test files
- `src/jwt/__tests__/signer.test.ts` - 15+ assertions
- `src/jwt/__tests__/refresh-tokens.test.ts` - 20+ assertions
- `src/jwt/__tests__/handler.test.ts` - 25+ assertions

**Agent Assignments:**
- `tdd-developer`: 85% of tasks (standard feature development)
- `reliability-engineer`: 15% of tasks (security-critical: algorithm validation, refresh rotation, dual auth)
- Manual: PR review and merge decisions

**Critical Path:**
```
PR #1 → PR #2 → PR #3 → PR #4 → PR #5
```

**Parallel Work:**
- Tasks 1.0 and 3.0 can run in parallel (same PR)
- Tasks 5.0 and 6.0 can run in parallel (same PR)

**New Dependencies:**
- `jose` (edge-compatible JWT library, ~45KB)

**Database Changes:**
- New table: `refresh_tokens`
- Migration: `006_create_refresh_tokens.sql`

---

## Test Strategy

### Unit Tests (Isolated)
- JWT signing/verification with mock keys
- Token hashing consistency
- Type validation

### Integration Tests (With Database)
- Token pair creation with DB persistence
- Refresh token rotation
- Revocation flows
- HTTP handler responses

### Security Tests
- Algorithm confusion attacks (reject non-ES256)
- Expired token rejection
- Revoked token rejection
- Invalid signature rejection

---

*Task list generated 2025-01-15 by tasklist-generator skill*
