# Database Migrations

This directory contains SQL migration scripts for the mech-auth database schema.

## Overview

The mech-auth project uses PostgreSQL via the Mech Storage HTTP API. Since we don't have direct database access, migrations must be run manually using a PostgreSQL client connected to your database.

## Migration Files

| Migration | Description | Rollback |
|-----------|-------------|----------|
| `001_create_users_table.sql` | Core users table with email/password and OAuth support | `rollback_001.sql` |
| `002_create_sessions_table.sql` | Session management with expiration tracking | `rollback_002.sql` |
| `003_create_verification_tokens.sql` | Email verification tokens | `rollback_003.sql` |
| `004_create_reset_tokens.sql` | Password reset tokens | `rollback_004.sql` |
| `009_create_oauth_transactions.sql` | Server-side OAuth callback transactions | `rollback_009.sql` |
| `010_harden_oauth_transaction_metadata.sql` | Forward compatibility for early OAuth transaction previews | `rollback_010.sql` |
| `009_create_oauth_transactions.sql` | One-time OAuth callback transactions | `rollback_009.sql` |

## Prerequisites

1. **PostgreSQL Connection String**: You need the `DATABASE_URL` for your PostgreSQL instance (Neon, Supabase, etc.)
2. **psql Client**: PostgreSQL command-line client installed
   ```bash
   # macOS
   brew install postgresql

   # Ubuntu/Debian
   sudo apt-get install postgresql-client

   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

## Running Migrations

### Option 1: Using psql (Recommended)

```bash
# Set your database URL (get this from your hosting provider)
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run migrations in order
psql $DATABASE_URL -f migrations/001_create_users_table.sql
psql $DATABASE_URL -f migrations/002_create_sessions_table.sql
psql $DATABASE_URL -f migrations/003_create_verification_tokens.sql
psql $DATABASE_URL -f migrations/004_create_reset_tokens.sql
```

### Option 2: Using Interactive psql

```bash
# Connect to your database
psql $DATABASE_URL

# Run migrations one by one
\i migrations/001_create_users_table.sql
\i migrations/002_create_sessions_table.sql
\i migrations/003_create_verification_tokens.sql
\i migrations/004_create_reset_tokens.sql

# Exit
\q
```

### Option 3: Using Database Provider's Web UI

Most PostgreSQL providers (Neon, Supabase, etc.) offer a SQL editor in their web dashboard:

1. Log in to your database provider's dashboard
2. Navigate to the SQL editor
3. Copy and paste each migration file's contents
4. Execute the SQL

## Rolling Back Migrations

To rollback migrations (in reverse order):

```bash
# Rollback in reverse order
psql $DATABASE_URL -f migrations/rollback_004.sql
psql $DATABASE_URL -f migrations/rollback_003.sql
psql $DATABASE_URL -f migrations/rollback_002.sql
psql $DATABASE_URL -f migrations/rollback_001.sql
```

**Warning**: Rollback scripts use `DROP TABLE CASCADE`, which will delete all data. Use with caution!

## Verifying Migrations

After running migrations, verify the schema:

```bash
# Connect to database
psql $DATABASE_URL

# List all tables
\dt

# Describe a specific table
\d users
\d sessions
\d email_verification_tokens
\d password_reset_tokens

# List all indexes
\di

# Exit
\q
```

Expected output:
```
                    List of relations
 Schema |            Name             | Type  |  Owner
--------+-----------------------------+-------+---------
 public | email_verification_tokens   | table | user
 public | password_reset_tokens       | table | user
 public | sessions                    | table | user
 public | users                       | table | user
```

## Idempotency

All migrations are idempotent, meaning they can be run multiple times safely:

- Tables use `CREATE TABLE IF NOT EXISTS`
- Indexes use `CREATE INDEX IF NOT EXISTS`
- Constraints use conditional checks (`DO $$ BEGIN ... END $$`)

This allows you to:
- Re-run migrations without errors
- Apply migrations to multiple environments
- Recover from partial migration failures

## Migration Order

Migrations must be run in numerical order (001, 002, 003, 004) due to foreign key dependencies:

```
users (001)
  ├─> sessions (002)
  ├─> email_verification_tokens (003)
  └─> password_reset_tokens (004)
```

All child tables reference the `users` table with `ON DELETE CASCADE`, so:
- Deleting a user automatically deletes their sessions, verification tokens, and reset tokens
- Rolling back the users table (rollback_001.sql) will cascade delete all related data

## Environment-Specific Migrations

### Development

```bash
# Use local or development database
export DATABASE_URL="postgresql://localhost:5432/mech_auth_dev"
psql $DATABASE_URL -f migrations/001_create_users_table.sql
# ... run other migrations
```

### Production

```bash
# Use production database (be careful!)
export DATABASE_URL="postgresql://prod-host:5432/mech_auth_prod"

# Recommended: Take a backup first
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Run migrations
psql $DATABASE_URL -f migrations/001_create_users_table.sql
# ... run other migrations
```

## Troubleshooting

### Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT version();"

# If connection fails, verify:
# 1. DATABASE_URL is correct
# 2. Database is accessible from your network
# 3. SSL/TLS settings (some providers require ?sslmode=require)
```

### Permission Issues

```sql
-- Check current user permissions
SELECT current_user, current_database();

-- You need at least these permissions:
-- - CREATE TABLE
-- - CREATE INDEX
-- - CREATE FUNCTION
-- - CREATE TRIGGER
```

### Migration Failures

If a migration fails mid-execution:

1. Check the error message
2. Fix the issue (permissions, syntax, etc.)
3. Re-run the migration (idempotency ensures this is safe)

### Checking Migration Status

```sql
-- Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'sessions', 'email_verification_tokens', 'password_reset_tokens');

-- Check if indexes exist
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public';

-- Check foreign key constraints
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';
```

## Next Steps

After running migrations:

1. Update your application's `DATABASE_URL` environment variable
2. Test the connection using the Mech Storage client
3. Run integration tests to verify schema compatibility
4. See `/src/database/schema.ts` for TypeScript types

## Support

For issues with:
- **Migration scripts**: Check `/DATABASE_SCHEMA.md` for schema documentation
- **Mech Storage integration**: See project README
- **PostgreSQL specific issues**: Consult your database provider's documentation
