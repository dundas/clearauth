# Task List: Edge Runtime Compatibility

**PRD**: 0002-prd-edge-runtime-compatibility.md
**Status**: In Progress
**Created**: 2024-12-24

---

## Parent Task 1: Add Session Validation Utilities

**Acceptance Criteria**: `validateSession`, `getSessionFromCookie` functions exported from `clearauth/edge` and working in isolation.

### Sub-tasks

- [ ] 1.1 Create `src/session/validate.ts` with `validateSession(token, db)` function
- [ ] 1.2 Create `src/utils/cookies.ts` with `parseCookies(header)` function
- [ ] 1.3 Add `createSessionCookie(sessionId, config)` to cookies.ts
- [ ] 1.4 Add `getSessionFromCookie(request, db)` convenience function
- [ ] 1.5 Write unit tests for all session utilities
- [ ] 1.6 Export all utilities from `src/edge.ts`

**Tests**: `src/session/__tests__/validate.test.ts`, `src/utils/__tests__/cookies.test.ts`

---

## Parent Task 2: Export Database Utilities from Edge

**Acceptance Criteria**: `createMechKysely` and database types exported from `clearauth/edge`.

### Sub-tasks

- [ ] 2.1 Export `createMechKysely` from `src/edge.ts`
- [ ] 2.2 Export database schema types (`Database`, `User`, `Session`, etc.)
- [ ] 2.3 Verify no argon2 in import chain (grep dist/edge.js)
- [ ] 2.4 Update TypeScript types in edge.d.ts

**Tests**: Build verification, type checking

---

## Parent Task 3: Cloudflare Workers Integration Test

**Acceptance Criteria**: Full auth flow works on Cloudflare Workers (wrangler dev).

### Sub-tasks

- [ ] 3.1 Create `examples/cloudflare-workers/` with wrangler.toml
- [ ] 3.2 Implement worker with full auth flow (OAuth + email/password)
- [ ] 3.3 Test session validation middleware pattern
- [ ] 3.4 Verify no native module errors on `wrangler dev`
- [ ] 3.5 Document any Cloudflare-specific configuration

**Tests**: Manual verification with `wrangler dev`

---

## Parent Task 4: Documentation and Issue Closure

**Acceptance Criteria**: README updated, Cloudflare guide created, issues #2 and #3 closed.

### Sub-tasks

- [ ] 4.1 Update README with Cloudflare Workers example
- [ ] 4.2 Create `CLOUDFLARE.md` deployment guide
- [ ] 4.3 Add note about PBKDF2 vs Argon2 on edge
- [ ] 4.4 Close GitHub issues #2 and #3 with summary

**Tests**: Documentation review

---

## Relevant Files

| File | Purpose |
|------|---------|
| `src/edge.ts` | Edge entrypoint - needs new exports |
| `src/session/validate.ts` | NEW - Session validation utility |
| `src/utils/cookies.ts` | NEW - Cookie parsing/creation utilities |
| `src/mech-kysely.ts` | Database adapter (already edge-compatible) |
| `src/password-hasher.ts` | PBKDF2 hasher (already edge-compatible) |
| `examples/cloudflare-workers/` | NEW - Example project |
| `CLOUDFLARE.md` | NEW - Deployment guide |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bundler still resolves argon2 | High | Mark as optional dependency, test thoroughly |
| Arctic/Oslo not edge-compatible | Medium | Test OAuth flow on workers, may need polyfills |
| Kysely HTTP adapter issues | Low | Already tested on CF, should work |

---

## Dependencies

```
Task 1 (Session Utilities)
    ↓
Task 2 (Database Exports) ──→ Task 3 (CF Integration Test)
                                     ↓
                              Task 4 (Documentation)
```

Tasks 1 and 2 can be done in parallel. Task 3 requires both. Task 4 is last.
