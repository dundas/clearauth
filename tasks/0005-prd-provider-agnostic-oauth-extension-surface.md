# PRD: Provider-Agnostic OAuth Extension Surface

**PRD ID**: 0005
**Feature**: OAuth Transactions and External Adapters
**Source**: Ohok work order `msg-1784149461545-e23oby`
**Status**: Proposed
**Created**: 2026-07-15
**Priority**: High
**Task list**: `tasks/tasks-0005-prd-provider-agnostic-oauth-extension-surface.md`

This PRD intentionally uses a decision-record structure because its primary deliverable is an architecture boundary and extension contract, not a single end-user feature.

## 1. Decision

ClearAuth should expose a provider-agnostic OAuth transaction and adapter surface. It should not add AT Protocol as another hard-coded provider or own Ohok-specific discovery and storage policy.

This is the recommended extension-surface response to Ohok. The work should be delivered in bounded, backward-compatible phases. Conventional providers must continue through the same session and JWT issuance pipeline while AT Protocol-specific behavior is supplied by an external adapter.

## 2. Evidence

The current implementation is not a safe base for AT Protocol OAuth:

- `OAuthProvider` is a fixed union and user identities are stored in provider-specific columns.
- Login state and PKCE use global `oauth_state` and `oauth_code_verifier` cookies, so parallel flows can overwrite one another.
- Callback validation is delegated to provider handlers using only the cookie state and returned state. There is no atomic transaction consumption or binding to provider, issuer, redirect URI, or browser context.
- `upsertOAuthUser()` returns only a user, so callers cannot distinguish `created`, `linked`, and `returning` outcomes.
- Upstream access and refresh tokens are returned transiently and have no first-class persistence, refresh serialization, disconnect, or revocation contract.

The authoritative [AT Protocol OAuth specification](https://atproto.com/specs/oauth) requires dynamic server discovery, PKCE, PAR, DPoP, public client metadata, issuer validation, and account binding. The official [client implementation guide](https://docs.bsky.app/docs/advanced-guides/oauth-client) also requires per-session DPoP keys and nonce handling.

## 3. Goals

1. Make OAuth initiation and callbacks transaction-bound, atomic, and safe across tabs and providers.
2. Allow external adapters to use ClearAuth's normal account, session, cookie, and optional JWT pipeline without forking the library.
3. Return an explicit `created | linked | returning` callback outcome.
4. Define optional interfaces for remote discovery, DPoP/PAR state, upstream token persistence, refresh locking, and revocation.
5. Preserve all existing conventional provider behavior and routes.

## 4. Library Boundary

ClearAuth owns:

- An `OAuthTransaction` model with a random identifier, provider key, state hash, PKCE material, issuer and redirect bindings, opaque adapter metadata, browser binding, expiry, and consumed timestamp.
- An `OAuthTransactionStore` with create and atomic validate-and-consume operations. Consumption must be single-use; callback code has no separate read operation.
- One opaque browser-binding cookie per transaction, named with both the provider key and transaction ID. Its value is an independent high-entropy random secret whose hash is stored in the transaction. The callback derives the expected cookie name from the state-bound transaction reference, verifies the secret, atomically consumes the server-side transaction, and deletes only that transaction's cookie. IP addresses and User-Agent strings are audit context, not authentication factors. No flow reads or overwrites a shared OAuth cookie.
- Callback validation before adapter token exchange, including state, provider, expiry, redirect URI, expected issuer, browser binding, and one-time consumption.
- An `OAuthAdapter` contract that starts a flow and exchanges a validated callback for a normalized external identity and optional upstream credentials.
- A generic `oauth_accounts` identity model instead of adding provider columns for each new adapter.
- The account-resolution pipeline and an explicit `created | linked | returning` result.
- Optional, provider-neutral hooks for discovery policy, proof-key lifecycle, upstream credential storage, refresh locking, and revocation.
- Existing session creation, cookie issuance, and optional ClearAuth JWT issuance after a successful adapter callback.

ClearAuth does not own by default:

- Handle to DID, DID to PDS, or PDS to authorization-server rules.
- Ohok's SSRF policy implementation or PDS compatibility matrix.
- AT Protocol client-metadata hosting. ClearAuth may generate and validate the document, but the consumer must publish it over HTTPS.
- AT Protocol scopes, XRPC behavior, custom feeds, or other application logic.
- Ohok's encryption backend, credential retention policy, or provider-specific refresh schedule.

## 5. Required Interfaces

The names are illustrative; the behavioral contract is normative.

```ts
type OAuthAccountOutcome = 'created' | 'linked' | 'returning'

interface OAuthCallbackEvidence {
  returnedState: string
  providerKey: string
  redirectUri: string
  returnedIssuer?: string
  /** Raw per-flow cookie value. Never persist or log this value. */
  browserBindingSecret: string
  now: Date
}

interface OAuthTransactionStore {
  create(transaction: NewOAuthTransaction): Promise<OAuthTransaction>
  validateAndConsume(id: string, evidence: OAuthCallbackEvidence): Promise<OAuthTransaction | null>
}

interface OAuthAdapter {
  key: string
  start(context: OAuthStartContext): Promise<OAuthStartResult>
  callback(context: ValidatedOAuthCallbackContext): Promise<OAuthAdapterResult>
  revoke?(context: OAuthRevocationContext): Promise<void>
}

interface OAuthAdapterResult {
  identity: { provider: string; subject: string; email?: string; emailVerified?: boolean }
  profile: { name?: string | null; avatarUrl?: string | null }
  credentials?: OAuthUpstreamCredentials
}

interface OAuthUpstreamCredentials {
  accessToken?: string
  refreshToken?: string
  expiresAt?: Date
  scope?: string
}
```

`validateAndConsume()` is one atomic operation. It compares the stored state hash, provider, redirect URI, expected issuer, browser-binding hash, and expiry against the callback evidence, verifies `consumedAt` is unset, and marks the transaction consumed only if every invariant passes. Callback code must not implement this as `get() -> validate -> consume()`.

`OAuthUpstreamCredentials` is adapter-to-library server-side data only. The credential sink encrypts it before persistence; no raw credential, browser-binding secret, or private DPoP key may be logged or exposed through a browser-facing API.

After adapter callback success, ClearAuth resolves the generic OAuth account and outcome, then runs the existing session-cookie pipeline and optional `issueTokenPair()` JWT pipeline. Adapters do not issue ClearAuth sessions or JWTs directly.

Secrets, raw authorization codes, access tokens, refresh tokens, PKCE verifiers, and private DPoP keys must never be returned in public HTTP responses or callback hooks intended for browser clients.

## 6. Functional Requirements

| ID | Requirement | Gap |
|---|---|---|
| FR-1 | Transactions MUST bind state to provider, redirect URI, browser context, expiry, and adapter metadata. | G2 |
| FR-2 | Parallel provider and same-provider flows MUST not overwrite each other. | G3 |
| FR-3 | Callback transaction consumption MUST be atomic and replay-safe. | G2, G3 |
| FR-4 | External adapters MUST route through ClearAuth account, session, cookie, and JWT issuance. | G1 |
| FR-5 | Callback completion MUST expose `created`, `linked`, or `returning` to a server-side hook. | G11 |
| FR-6 | Account storage MUST support arbitrary provider keys and subjects without schema columns per provider. | G1 |
| FR-7 | Discovery MUST be pluggable and receive explicit redirect, scheme, address, port, timeout, and response-size policy hooks. | G7, G8 |
| FR-8 | DPoP key and nonce lifecycle MUST be pluggable per transaction and upstream session. | G5 |
| FR-9 | Adapters MUST be able to perform PAR and persist returned request metadata in the transaction. | G6 |
| FR-10 | Upstream credential storage MUST use an explicit server-side sink and support serialized refresh. | G9 |
| FR-11 | Disconnect MUST revoke upstream grants when supported and remove local credentials without revoking unrelated ClearAuth sessions by default. | G10 |
| FR-12 | A helper MAY generate and validate client metadata, but publication and HTTPS deployment remain consumer responsibilities. | G4 |

## 7. Security Gates

- No raw global `oauth_state` or `oauth_code_verifier` cookie names remain in the transaction-based path.
- Two concurrent flows in separate tabs complete independently.
- A callback can consume its transaction exactly once; a second callback fails before token exchange.
- Provider, issuer, redirect URI, expired state, and browser-binding mismatches fail closed.
- Discovery policy denies non-HTTPS endpoints, credentials in URLs, forbidden ports and addresses, unsafe redirects, oversized bodies, and DNS rebinding.
- DPoP private keys and upstream tokens remain server-side and are redacted from errors and logs.
- Existing GitHub, Google, Discord, Apple, Microsoft, LinkedIn, and Meta tests remain green.
- Extension interfaces are documented before implementation merges.

## 8. Delivery Strategy

1. Transaction core and compatibility bridge for current providers. Owner: ClearAuth.
2. Callback outcomes and generic OAuth account storage. Owner: ClearAuth.
3. External adapter registration and routing through the existing success pipeline. Owner: ClearAuth.
4. Optional discovery, DPoP, and PAR hooks. Owner: ClearAuth.
5. Upstream credential sink, refresh lock, disconnect, and revocation semantics. Owner: ClearAuth.
6. AT Protocol reference adapter maintained by Ohok or a separate integration package. Owner: Ohok.

Each phase should be a separate reviewed PR. Migration of existing provider columns must be additive first; destructive cleanup requires a later major release.

During the Phase 2 deprecation window, retain `upsertOAuthUser()` as a compatibility wrapper returning `Promise<User>` for existing callers. Introduce the outcome-aware account-resolution API alongside it; do not change the exported legacy function's return contract in place.

Phase 1 intentionally does not accept the legacy shared OAuth cookies on the transaction path. A conventional OAuth flow started before deployment may fail closed at callback and require the user to retry; accepting an unbound legacy cookie would preserve the collision weakness the phase removes. Release notes and deployment runbooks must call out this bounded transition.

## 9. Acceptance Criteria for Ohok

Ohok can implement AT Protocol OAuth without forking ClearAuth when it can:

1. Register an external adapter and start a transaction with opaque discovery and DPoP metadata.
2. Complete an issuer-bound, one-time callback through ClearAuth's account and session pipeline.
3. Persist upstream credentials through a server-side sink and serialize refreshes.
4. Receive a server-side `created | linked | returning` outcome.
5. Revoke or disconnect the upstream account without bypassing ClearAuth's security model.

Until phases 1 through 3 and the applicable DPoP/PAR hooks are shipped, ClearAuth is an explicit no-fit for Ohok's production AT Protocol OAuth flow.

## 10. Gap Matrix

| Gap | Short description |
|---|---|
| G1 | No AT Protocol provider or external adapter surface |
| G2 | State is not bound to a complete authorization transaction |
| G3 | Global state and PKCE cookies collide across parallel flows |
| G4 | No client-metadata generation or publication support |
| G5 | No per-session DPoP key and nonce lifecycle |
| G6 | No PAR support |
| G7 | No handle/DID/PDS/authorization-server discovery path |
| G8 | No SSRF-safe remote discovery policy surface |
| G9 | No serialized upstream refresh lifecycle |
| G10 | Upstream revocation and disconnect are only partially supported |
| G11 | No `created`, `linked`, or `returning` callback outcome |
