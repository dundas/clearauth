# SQLite Migrations for ClearAuth

These migrations are compatible with **Turso** and **Cloudflare D1**.

## Key Differences from PostgreSQL

### Data Types
- **UUID**: Stored as `TEXT` instead of `UUID` type
- **Boolean**: Stored as `INTEGER` (0=false, 1=true) instead of `BOOLEAN`
- **Timestamps**: Stored as `INTEGER` (Unix timestamps) instead of `TIMESTAMPTZ`

### Features
- No `gen_random_uuid()` - UUIDs must be generated in application code
- No `NOW()` function - use `unixepoch()` for current timestamp
- Triggers work differently - use `AFTER UPDATE` instead of `BEFORE UPDATE`
- No `CREATE EXTENSION` - SQLite has no extensions

## Running Migrations

### Turso
```bash
# Create database
turso db create clearauth-db

# Run migrations
turso db shell clearauth-db < 001_create_users_table.sql
turso db shell clearauth-db < 002_create_sessions_table.sql
```

### Cloudflare D1
```bash
# Create database
wrangler d1 create clearauth-db

# Run migrations
wrangler d1 execute clearauth-db --file=./migrations/sqlite/001_create_users_table.sql
wrangler d1 execute clearauth-db --file=./migrations/sqlite/002_create_sessions_table.sql
```

## Application Code Changes

When using SQLite providers, ensure your application:

1. **Generates UUIDs** before inserting users:
```typescript
import { generateId } from 'oslo/crypto'

const userId = generateId(15) // or use a UUID library
```

2. **Handles timestamps** as Unix timestamps:
```typescript
const now = Math.floor(Date.now() / 1000)
```

3. **Handles booleans** as integers:
```typescript
const emailVerified = row.email_verified === 1
```

## Schema Compatibility

The SQLite schema includes all OAuth provider columns:
- `github_id`
- `google_id`
- `discord_id`
- `apple_id`
- `microsoft_id`
- `linkedin_id`
- `meta_id`

All provider IDs are stored as `TEXT` and indexed for fast lookups.
