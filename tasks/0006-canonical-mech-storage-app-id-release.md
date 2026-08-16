# Canonical Mech Storage app ID release

## Source

- User instruction: publish the ClearAuth login fix through the standard development workflow.
- Incident report: `msg-1786899338000-mechbrowse` from mech-browse.

## Problem

Mech Storage now verifies that the app ID in a PostgreSQL request URL exactly
matches the identity bound to `X-API-Key`. ClearAuth removed the `app_` prefix
from canonical application IDs, causing authenticated login queries to fail.

## Acceptance criteria

1. `MechSqlClient` preserves `app_<uuid>` in `/api/apps/{appId}/postgresql/query`.
2. Regression coverage asserts the canonical URL path.
3. The focused client test, full suite, build, and live read-only session soak pass.
4. The change passes adversarial and pre-push review before push.
5. A reviewed PR is merged before publishing `clearauth@0.7.3` to npmjs.
