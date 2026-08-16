# Normalize Mech Storage app IDs at the client boundary

## Source

- User direction to continue the ClearAuth login release through the standard development workflow.
- PR #39 review feedback: preserving an existing `app_` prefix does not make the documented bare UUID configuration work.
- Live direct SQL verification: canonical `app_<uuid>` succeeds while the matching bare UUID receives HTTP 401.

## Problem

Mech Storage requires an `app_<uuid>` identity in the PostgreSQL API URL. ClearAuth accepts both a bare UUID and canonical app ID, but currently sends a bare UUID unchanged. This leaves the documented/default bare UUID configuration unable to authenticate.

## Acceptance criteria

1. A bare UUID app ID is normalized to `app_<uuid>` only for the Mech Storage request URL.
2. An already canonical `app_<uuid>` remains unchanged; no double prefix is introduced.
3. Schema-ID behavior remains unchanged so existing database schemas are addressed consistently.
4. Direct unit coverage proves both accepted configuration forms produce the same canonical URL.
5. Full tests, build, security/review gates, and a read-only live alternating canonical/bare-ID SQL soak pass before PR submission.
6. The unpublished `clearauth@0.7.3` release candidate contains this correction before it is published.
