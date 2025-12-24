# PRD: Edge Runtime Compatibility

**PRD ID**: 0002
**Feature**: Standalone Cloudflare Workers/Pages Support
**GitHub Issues**: [#2](https://github.com/dundas/clearauth/issues/2), [#3](https://github.com/dundas/clearauth/issues/3)
**Status**: Draft
**Priority**: High

---

## 1. Introduction/Overview

ClearAuth cannot currently run on edge runtimes (Cloudflare Workers/Pages, Vercel Edge, Deno Deploy) because importing from `clearauth/edge` transitively pulls in `@node-rs/argon2`, a native Node.js module incompatible with V8 isolates.

The irony is that ClearAuth already has edge-compatible components:
- `clearauth/edge` uses PBKDF2 (WebCrypto) for password hashing
- Kysely works over HTTP via Mech Storage
- Oslo is edge-compatible

The fix is to **decouple the build** so that `clearauth/edge` produces a standalone bundle with zero Node.js native dependencies.

## 2. Goals

1. **Standalone Cloudflare Support** - `clearauth/edge` works on Cloudflare Workers/Pages without any Node.js backend
2. **Zero Native Dependencies** - Edge bundle must not include or reference `@node-rs/argon2`
3. **Full Feature Parity** - OAuth flows, email/password auth, and session management all work on edge
4. **Session Validation Utilities** - Export `validateSession`, `parseCookies` for middleware use cases

## 3. User Stories

1. **As a developer**, I want to deploy ClearAuth on Cloudflare Pages Functions, so that I can have low-latency authentication globally.

2. **As a developer**, I want to validate sessions in edge middleware, so that I can protect routes without a Node.js backend.

3. **As a developer**, I want to use Google/GitHub OAuth entirely on Cloudflare Workers, so that I don't need a hybrid architecture.

4. **As a developer**, I want email/password registration and login on edge, so that my entire auth flow runs at the edge.

## 4. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | `clearauth/edge` MUST NOT import or bundle `@node-rs/argon2` |
| FR-2 | `clearauth/edge` MUST export `handleClearAuthEdgeRequest` for full auth handling |
| FR-3 | `clearauth/edge` MUST export `validateSession(sessionToken, db, config)` for middleware |
| FR-4 | `clearauth/edge` MUST export `parseCookies(cookieHeader)` utility |
| FR-5 | `clearauth/edge` MUST export `createSessionCookie(sessionId, config)` utility |
| FR-6 | `clearauth/edge` MUST use PBKDF2 (WebCrypto) as the default password hasher |
| FR-7 | OAuth flows (GitHub, Google) MUST work entirely on edge runtime |
| FR-8 | Email/password auth (register, login, reset) MUST work entirely on edge runtime |
| FR-9 | Build MUST produce separate bundles: `dist/edge.js` (no native deps) and `dist/node.js` (with argon2) |

## 5. Non-Goals (Out of Scope)

- Argon2 support on edge (not possible without native modules)
- Migrating existing Argon2 password hashes to PBKDF2 (out of scope for this PRD)
- React SDK changes for OAuth proxy (can be addressed separately)
- Supporting non-Cloudflare edge runtimes initially (Vercel Edge, Deno Deploy are secondary)

## 6. Design Considerations

### Entrypoint Structure (Current vs Proposed)

**Current** (`src/edge.ts`):
```typescript
import { createClearAuth } from "./createMechAuth.js"  // Pulls in password-hasher chain
export { createClearAuth, handleClearAuthEdgeRequest, ... }
```

**Proposed** (`src/edge.ts`):
```typescript
// Edge-specific imports only - no path to argon2
import { createMechKysely } from "./mech-kysely.js"
import { createPbkdf2PasswordHasher } from "./password-hasher.js"
import { handleClearAuthRequest } from "./handler.js"
// ... other edge-safe imports

export function createClearAuth(options) { ... }
export function handleClearAuthEdgeRequest(request, config) { ... }
export function validateSession(token, db, config) { ... }
export function parseCookies(header) { ... }
export function createSessionCookie(sessionId, config) { ... }
```

### Build Strategy

**Option A: Separate Source Files** (Recommended)
- `src/edge.ts` - Self-contained edge implementation
- `src/node.ts` - Node.js with Argon2
- `src/index.ts` - Universal (defaults to PBKDF2)

**Option B: Conditional Imports**
- Use dynamic imports for argon2
- Risk: Bundlers may still include it

**Option C: Separate Packages**
- `clearauth` - Node.js only
- `clearauth-edge` - Edge only
- Risk: Maintenance overhead

**Recommendation**: Option A with careful import graph management.

## 7. Technical Considerations

### Import Graph Analysis

Current problematic chain:
```
clearauth/edge
  → createMechAuth.js
    → (password-hasher.js is fine, uses PBKDF2)
    → BUT index.ts re-exports everything including node.ts
      → password-hasher-argon2.js
        → @node-rs/argon2  // PROBLEM
```

Fix: `edge.ts` must not import from `index.ts`. Import specific modules directly.

### Files to Modify/Create

| File | Action |
|------|--------|
| `src/edge.ts` | Rewrite to be self-contained, no index.ts imports |
| `src/session/validate.ts` | New file for `validateSession` utility |
| `src/utils/cookies.ts` | New file for `parseCookies`, `createSessionCookie` |
| `tsconfig.edge.json` | Separate tsconfig for edge build (optional) |
| `package.json` | Verify exports map is correct |

### Session Validation Utility API

```typescript
// src/session/validate.ts
export interface ValidateSessionOptions {
  sessionTable?: string;  // default: 'sessions'
  userTable?: string;     // default: 'users'
}

export async function validateSession(
  sessionToken: string,
  db: Kysely<Database>,
  options?: ValidateSessionOptions
): Promise<{ user: PublicUser; session: Session } | null> {
  const session = await db
    .selectFrom('sessions')
    .selectAll()
    .where('id', '=', sessionToken)
    .where('expires_at', '>', new Date())
    .executeTakeFirst();

  if (!session) return null;

  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'email_verified', 'name', 'avatar_url', 'created_at'])
    .where('id', '=', session.user_id)
    .executeTakeFirst();

  if (!user) return null;

  return { user, session };
}
```

### Cookie Utilities API

```typescript
// src/utils/cookies.ts
export function parseCookies(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;

  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies.set(name, rest.join('='));
  }
  return cookies;
}

export function createSessionCookie(
  sessionId: string,
  config: { session?: SessionConfig; isProduction?: boolean }
): string {
  const { session, isProduction } = config;
  const name = session?.cookie?.name ?? 'session';
  const parts = [`${name}=${sessionId}`];

  parts.push(`Path=${session?.cookie?.path ?? '/'}`);
  parts.push('HttpOnly');
  if (isProduction) parts.push('Secure');
  parts.push(`SameSite=${session?.cookie?.sameSite ?? 'Lax'}`);
  if (session?.cookie?.domain) parts.push(`Domain=${session.cookie.domain}`);

  const maxAge = session?.expiresIn ?? 60 * 60 * 24 * 7;
  parts.push(`Max-Age=${maxAge}`);

  return parts.join('; ');
}
```

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| `clearauth/edge` bundle size | < 50KB (no argon2 bloat) |
| Cloudflare Workers deployment | Works without errors |
| OAuth flow on CF Workers | Full flow completes |
| Email/password on CF Workers | Register + Login works |
| Session validation in middleware | Works in CF Pages Functions |

## 9. Open Questions

1. ~~Should we maintain a test suite that runs on Cloudflare's workerd?~~ **Decision**: Yes, add `wrangler dev` test in CI.

2. ~~Should `clearauth/edge` be the default export for new projects?~~ **Decision**: No, keep `clearauth` as universal. Document edge usage.

3. ~~Password hash migration for users switching from Node to Edge?~~ **Deferred**: Out of scope. Users must use PBKDF2 from the start on edge.

---

## Implementation Checklist

### Phase 1: Decouple Imports
- [ ] Audit import graph from `src/edge.ts` to identify argon2 paths
- [ ] Refactor `src/edge.ts` to import specific modules, not `index.ts`
- [ ] Verify `npm run build` produces argon2-free `dist/edge.js`
- [ ] Add build-time check: `grep -r "argon2" dist/edge.js` should fail

### Phase 2: Add Session Utilities
- [ ] Create `src/session/validate.ts` with `validateSession`
- [ ] Create `src/utils/cookies.ts` with `parseCookies`, `createSessionCookie`
- [ ] Export from `src/edge.ts`
- [ ] Add unit tests

### Phase 3: Verify Full Flow
- [ ] Create `examples/cloudflare-workers/` example
- [ ] Test OAuth flow end-to-end on Cloudflare Workers
- [ ] Test email/password flow end-to-end
- [ ] Test session validation in CF Pages Function middleware

### Phase 4: Documentation
- [ ] Update README with Cloudflare Workers example
- [ ] Add `CLOUDFLARE.md` guide
- [ ] Document that edge uses PBKDF2 (not Argon2)
- [ ] Close GitHub issues #2 and #3

---

## Appendix: Cloudflare Workers Example

```typescript
// src/index.ts (Cloudflare Worker)
import { createClearAuth, handleClearAuthEdgeRequest } from 'clearauth/edge';

export interface Env {
  AUTH_SECRET: string;
  MECH_APP_ID: string;
  MECH_API_KEY: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle auth routes
    if (url.pathname.startsWith('/auth')) {
      const config = createClearAuth({
        secret: env.AUTH_SECRET,
        baseUrl: 'https://myapp.workers.dev',
        database: {
          appId: env.MECH_APP_ID,
          apiKey: env.MECH_API_KEY,
        },
        isProduction: true,
        oauth: {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            redirectUri: 'https://myapp.workers.dev/auth/callback/github',
          },
        },
      });

      return handleClearAuthEdgeRequest(request, config);
    }

    return new Response('Hello from Cloudflare Workers!');
  },
};
```

### Session Validation Middleware

```typescript
// functions/api/[[route]].ts (Cloudflare Pages Function)
import { validateSession, parseCookies, createMechKysely } from 'clearauth/edge';

export const onRequest: PagesFunction<Env> = async (context) => {
  const cookies = parseCookies(context.request.headers.get('Cookie'));
  const sessionToken = cookies.get('session');

  if (!sessionToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = createMechKysely({
    appId: context.env.MECH_APP_ID,
    apiKey: context.env.MECH_API_KEY,
  });

  const result = await validateSession(sessionToken, db);

  if (!result) {
    return new Response('Session expired', { status: 401 });
  }

  // Proceed with authenticated request
  context.data.user = result.user;
  return context.next();
};
```
