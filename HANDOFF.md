# ClearAuth — Agent Handoff

## Context / Goal
We are creating a **new public OSS repo** named **ClearAuth** (located at `~/dev_env/clearauth`).

The end state:
- Publishable to **npm** (installable outside internal Mech infra)
- Auth library that supports:
  - Email/password auth
  - OAuth (GitHub + Google)
  - Cookie sessions
- **Storage backends**:
  - Current: Mech Storage via HTTP Postgres API (existing code)
  - New: **PostgreSQL** (standard Node runtime) so it can be used anywhere
- **Example apps**:
  - **Next.js** example showcasing the auth flows
  - **Vite + Cloudflare Pages/Workers** example showcasing auth flows

## Current State
- `~/dev_env/clearauth` was created by copying from `~/dev_env/mech/mech-auth` (excluding `.git` and `node_modules`).
- The repo has been rebranded for npm publishing:
  - `package.json` name is `clearauth` (npm package name)
  - GitHub repo target: `dundas/clearauth`
  - Some internal API symbols are still Mech-branded (`createMechKysely`, `MechSqlClient`, etc.)
  - Docs/examples may still contain legacy references that need cleanup.
  - Auth persistence is already implemented via **Kysely** against a Postgres-like schema:
  - `src/database/schema.ts`
  - SQL migrations exist in `/migrations`

## Important Tooling Note (for the next agent)
The IDE toolchain in the current session was originally opened on `~/dev_env/mech/mech-auth`.
If tools behave as if they are searching the wrong workspace root, ensure the IDE workspace is opened on the repo root folder.

## Known Risks / Gotchas
- **Cloudflare + email/password**: The email/password implementation uses `@node-rs/argon2` (native). This is typically not compatible with Cloudflare Workers. Decide whether:
  - email/password is **Node-only**,
  - password hashing is moved to a WASM/WebCrypto-compatible approach, or
  - Workers examples are **OAuth-only** (no password auth).
- **Legacy Better Auth content**: `examples/integration-examples.md` is written around Better Auth APIs and does not match the current recommended entrypoint (`handleClearAuthRequest(request, config)`). Plan to remove or rewrite it as part of OSS cleanup.
- **Example apps not present yet**: The handoff lists Next.js and Vite+Cloudflare example apps as targets, but they do not exist yet as full projects under `examples/`.

## Key Code Pointers
- **Exports**: `src/index.ts`
- **Unified handler**: `src/handler.ts` (`handleClearAuthRequest`)
- **Email/password HTTP routes**: `src/auth/handler.ts`
- **OAuth HTTP routes**: `src/oauth/handler.ts`
- **OAuth DB operations + sessions**: `src/oauth/callbacks.ts` (`createSession`, `validateSession`, `deleteSession`, etc.)
- **Mech Storage DB adapter**:
  - `src/mech-sql-client.ts`
  - `src/mech-kysely.ts` (Kysely Dialect/Driver using Mech Storage HTTP API)
  - Factory module currently assumes Mech Storage

## Assignment / Next Steps
### 1) Rebrand + npm packaging
- Rename package:
  - `package.json` `name`: likely `clearauth` (or `@clearauth/core` if you want scope)
  - Update `description`, `keywords`, `repository`, `bugs`, `homepage`
- Rename exported API symbols away from Mech:
  - Use `handleClearAuthRequest` as the unified handler
  - Use `ClearAuthConfig` as the primary config type
  - Use `createClearAuth` as the primary config factory

### 2) Generalize storage (remove Mech as the default)
Design target:
- Core library should accept **any `Kysely<Database>`** instance.
- Keep Mech Storage support as an optional helper/adapter.

Recommended shape:
- Core config takes `db` directly:
  - `createClearAuth({ db, secret, baseUrl, ... })`
- Provide helper creators:
  - `createMechStorageKysely(...)` (existing)
  - `createPostgresKysely(...)` (new; Node runtime)

### 3) Add PostgreSQL support
Add a Postgres adapter that works in Node:
- Add dependency: `pg`
- Use Kysely `PostgresDialect`
- Provide a factory (example):
  - `createPostgresKysely({ connectionString, poolConfig })`

Also ensure migrations can be run:
- The repo already has `/migrations/*.sql` that match `src/database/schema.ts`.
- Decide whether to:
  - keep migrations as SQL only and document `psql`/`dbmate`/`drizzle-kit`, OR
  - add a lightweight migration runner.

### 4) Example apps
Goal is to show *client integration* and *server endpoints*.

Decide architecture:
- Option A: Each example includes its own small auth server (recommended for clarity)
- Option B: Shared single server package used by both examples

Examples to build:
- `examples/nextjs`:
  - Next.js App Router
  - Route handlers that call `handleClearAuthRequest`
  - UI pages for register/login/session

- `examples/vite-cloudflare`:
  - Vite SPA for UI
  - Cloudflare Worker/Pages Functions for auth routes
  - Note: direct Postgres from Workers is non-trivial; either:
    - use Mech Storage adapter in the Cloudflare example, OR
    - document Hyperdrive / external backend for Postgres.

### 5) Documentation cleanup (OSS readiness)
- Update README to be `clearauth`
- Provide minimal “Getting Started” for:
  - Node + Postgres
  - Cloudflare + Mech Storage (or other supported storage)
- Provide env var examples for OAuth

## Completed Work in This Session
- Created `~/dev_env/clearauth` by copying from `~/dev_env/mech/mech-auth` excluding `.git` and `node_modules`.

## Open Questions / Decisions
- Package name preference:
  - `clearauth` vs `@clearauth/clearauth` vs `@clearauth/core`
- Repo structure:
  - single package with `/examples/*` vs monorepo (`packages/*` + `examples/*`)
- Cloudflare support scope:
  - Is Cloudflare Workers/Pages support required for **email/password**, or is **OAuth-only** acceptable on edge runtimes?
- Cloudflare example storage choice:
  - Use Mech Storage adapter, or document Postgres via Hyperdrive/external backend

## Verification Checklist
- `npm run build`
- `npm test`
- Confirm exported entrypoints in `src/index.ts` match the README/examples (no stale names)
