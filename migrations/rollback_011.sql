-- Rollback: Remove provider-neutral OAuth account identities.
-- Do not drop users.*_id compatibility columns or restore the prior row-local
-- constraint: both can contain OAuth identities created while migration 011 ran,
-- and a CHECK cannot express the generic oauth_accounts relation.

DROP TABLE IF EXISTS oauth_accounts;
