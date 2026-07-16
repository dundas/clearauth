# OAuth Transaction Deployment

## Prerequisite

Apply `migrations/009_create_oauth_transactions.sql`, `migrations/010_harden_oauth_transaction_metadata.sql`, and `migrations/011_create_oauth_accounts.sql`, in order, before deploying the Phase 2 OAuth account code. The application needs the `oauth_transactions` table for every OAuth login and callback and `oauth_accounts` for identity resolution. Migration 010 is a safe no-op for new installations and converts an early preview schema without requiring an operator to rewrite an applied migration. Use `migrations/rollback_009.sql` only to roll back the application deployment; it permanently removes unfinished transaction records.

## Release Transition

Phase 1 deliberately rejects callbacks that rely on the retired global `oauth_state` or `oauth_code_verifier` cookies. An OAuth flow that began before this deployment cannot be bound to a server-side transaction and fails closed with a generic callback error. Users must restart the OAuth login after deployment.

New flows set a short-lived, HttpOnly, provider-and-transaction-specific browser-binding cookie. Multiple tabs and providers can run independently; completing a callback deletes only its matching cookie.

Conventional providers do not currently supply issuer or adapter metadata, so their transactions intentionally bind those fields to `NULL`. The stored fields and atomic predicates are extension scaffolding; issuer and adapter-metadata enforcement begins only when Phase 3 external adapters supply both expected and returned values.

## Account Migration

Phase 2 retains existing `users.*_id` provider columns during the deprecation window, including for new conventional OAuth users. PostgreSQL operators must apply migration 011 because it adds the five conventional columns absent from its original schema (`discord_id`, `apple_id`, `microsoft_id`, `linkedin_id`, and `meta_id`) and retires its old row-local `users_auth_method_check`: a PostgreSQL check cannot enforce the generic `oauth_accounts` relation. Generic accounts are now the OAuth authentication source of truth. On a conventional login that has only a legacy provider ID, ClearAuth creates the matching `oauth_accounts` row before completing the callback. No bulk backfill is required for the release, although operators may backfill known identities before deployment if they need reporting to include dormant accounts.

An OAuth identity with a provider-verified email may retain the legacy automatic email-link behavior. An unverified provider email never silently links to an existing ClearAuth account; the callback fails and a future authenticated account-link flow is required. Rollback `011` only after rolling back application code that depends on generic account lookup. The rollback intentionally does not remove compatibility columns or reinstate the former GitHub/Google-only authentication constraint, because either could invalidate users created after this migration.

## Account Resolution Hook

Server applications may configure `oauth.onAccountResolved` to observe account resolution before ClearAuth creates a session or issues JWTs. Its event is deliberately redacted to `{ userId, providerKey, outcome }`, where `outcome` is `created`, `linked`, or `returning`; it never receives OAuth profile data, codes, browser-binding values, or tokens. Hook failures are logged through the configured ClearAuth logger and do not block authentication.

## Expiry Cleanup

Transactions expire after ten minutes but are not removed automatically by request handling. Schedule `createOAuthTransactionStore(config.database).cleanupExpired()` as a periodic server-side maintenance task. Rate-limit the OAuth login route at the consuming application or edge in the same way as other unauthenticated authentication entry points.
