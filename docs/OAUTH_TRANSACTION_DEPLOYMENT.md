# OAuth Transaction Deployment

## Prerequisite

Apply `migrations/009_create_oauth_transactions.sql` before deploying the Phase 1 OAuth transaction code. The application needs the `oauth_transactions` table for every OAuth login and callback. Use `migrations/rollback_009.sql` only to roll back the application deployment; it permanently removes unfinished transaction records.

## Release Transition

Phase 1 deliberately rejects callbacks that rely on the retired global `oauth_state` or `oauth_code_verifier` cookies. An OAuth flow that began before this deployment cannot be bound to a server-side transaction and fails closed with a generic callback error. Users must restart the OAuth login after deployment.

New flows set a short-lived, HttpOnly, provider-and-transaction-specific browser-binding cookie. Multiple tabs and providers can run independently; completing a callback deletes only its matching cookie.
