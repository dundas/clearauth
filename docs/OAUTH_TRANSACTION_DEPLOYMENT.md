# OAuth Transaction Deployment

## Prerequisite

Apply `migrations/009_create_oauth_transactions.sql` and `migrations/010_harden_oauth_transaction_metadata.sql`, in order, before deploying the Phase 1 OAuth transaction code. The application needs the `oauth_transactions` table for every OAuth login and callback. Migration 010 is a safe no-op for new installations and converts an early preview schema without requiring an operator to rewrite an applied migration. Use `migrations/rollback_009.sql` only to roll back the application deployment; it permanently removes unfinished transaction records.

## Release Transition

Phase 1 deliberately rejects callbacks that rely on the retired global `oauth_state` or `oauth_code_verifier` cookies. An OAuth flow that began before this deployment cannot be bound to a server-side transaction and fails closed with a generic callback error. Users must restart the OAuth login after deployment.

New flows set a short-lived, HttpOnly, provider-and-transaction-specific browser-binding cookie. Multiple tabs and providers can run independently; completing a callback deletes only its matching cookie.

Conventional providers do not currently supply issuer or adapter metadata, so their transactions intentionally bind those fields to `NULL`. The stored fields and atomic predicates are extension scaffolding; issuer and adapter-metadata enforcement begins only when Phase 3 external adapters supply both expected and returned values.
