-- Rollback: Remove provider-neutral OAuth account identities

DROP TABLE IF EXISTS oauth_accounts;
