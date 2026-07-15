# Tasks: Provider-Agnostic OAuth Extension Surface

**PRD**: `tasks/0005-prd-provider-agnostic-oauth-extension-surface.md`
**Source**: Ohok messages `msg-1784149461545-e23oby` and `msg-1784149805359-bytxck`
**Status**: Proposed

## Phase 1: Transaction Core

- [ ] Define `OAuthTransaction`, callback-evidence, and atomic `validateAndConsume` store interfaces.
- [ ] Add a database-backed store with atomic single-use consumption and expiry cleanup.
- [ ] Replace global OAuth cookies with one provider-and-transaction-namespaced random browser-binding cookie per flow; consume and delete only the callback's matching cookie.
- [ ] Add compatibility adapters for all current providers.
- [ ] Test same-provider and cross-provider multi-tab flows, expiry, mismatch, replay, and double callback.

## Phase 2: Outcomes and Accounts

- [ ] Change account resolution to return `created | linked | returning` with the user.
- [ ] Add a server-only completion hook with a redacted payload.
- [ ] Add an additive `oauth_accounts` migration keyed by provider and subject.
- [ ] Migrate conventional provider lookup to the generic account table while retaining compatibility columns during the deprecation window.
- [ ] Test creation, explicit linking, returning login, duplicate subject, and email-collision behavior.

## Phase 3: External Adapters

- [ ] Define and export the `OAuthAdapter` start/callback/revoke contract.
- [ ] Add configurable adapter registration without widening a fixed provider union.
- [ ] Route adapter success through existing session cookies and optional JWT issuance.
- [ ] Define stable error categories without exposing provider responses, codes, or credentials.
- [ ] Publish API documentation and a minimal example adapter before merge.

## Phase 4: Discovery, DPoP, and PAR

- [ ] Define a remote discovery client with mandatory safety-policy hooks.
- [ ] Define per-transaction and per-upstream-session DPoP key/nonce lifecycle interfaces.
- [ ] Allow adapters to persist PAR `request_uri` and related metadata in transactions.
- [ ] Add nonce rotation, retry, proof uniqueness, key deletion, and redaction tests.
- [ ] Add malicious discovery fixtures covering redirects, private addresses, rebinding, ports, schemes, timeouts, and oversized responses.

## Phase 5: Upstream Credential Lifecycle

- [ ] Define an encrypted upstream credential sink with no browser-facing read method.
- [ ] Define a refresh lock manager and serialized refresh helper.
- [ ] Define disconnect behavior separately from ClearAuth session revocation.
- [ ] Call adapter revocation when supported and make local credential deletion idempotent.
- [ ] Test concurrent refresh, rotation, revoked grants, partial provider failure, and retry safety.

## Phase 6: Ohok AT Protocol Adapter

- [ ] Implement handle to DID, DID to PDS, and PDS to authorization-server discovery in the adapter.
- [ ] Enforce Ohok's SSRF and PDS compatibility policy through the library discovery interface.
- [ ] Publish AT Protocol client metadata from Ohok's HTTPS application route.
- [ ] Implement PKCE, PAR, DPoP, issuer/sub/PDS binding, token refresh, and disconnect behavior.
- [ ] Run protocol smoke tests against Bluesky and representative independent PDS implementations.

## Mandatory Gates

- [ ] No transaction-path dependence on raw global `oauth_state` or `oauth_code_verifier` cookie names.
- [ ] Multi-tab and double-callback security tests pass.
- [ ] Conventional-provider regression suite passes in every phase.
- [ ] Public extension interfaces and security invariants are documented before implementation merges.
- [ ] Security audit, adversarial review, pre-push review, smoke decision, and PR review loop complete per the portfolio `STANDARD_DEV_WORKFLOW` supplied by the agent operating environment.
