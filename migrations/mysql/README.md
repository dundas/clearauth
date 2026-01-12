# MySQL Migrations for ClearAuth

These migrations are compatible with **PlanetScale**.

## Key Differences from PostgreSQL

### Data Types
- **UUID**: Stored as `CHAR(36)` instead of `UUID` type
- **Boolean**: Stored as `TINYINT(1)` instead of `BOOLEAN`
- **Timestamps**: Stored as `DATETIME` instead of `TIMESTAMPTZ`
- **Text**: Use `TEXT` for long strings, `VARCHAR(255)` for shorter strings

### Features
- No `gen_random_uuid()` - UUIDs must be generated in application code
- `ON UPDATE CURRENT_TIMESTAMP` for automatic updated_at
- Foreign key constraints supported
- InnoDB engine for ACID compliance

## Running Migrations

### PlanetScale
```bash
# Connect to your database
pscale connect clearauth-db main

# In another terminal, run migrations
mysql -h 127.0.0.1 -P 3306 -u root < 001_create_users_table.sql
mysql -h 127.0.0.1 -P 3306 -u root < 002_create_sessions_table.sql
```

Or use the PlanetScale web console to execute the SQL directly.

## Application Code Changes

When using PlanetScale, ensure your application:

1. **Generates UUIDs** before inserting users:
```typescript
import { randomUUID } from 'crypto'

const userId = randomUUID()
```

2. **Handles timestamps** as JavaScript Date objects:
```typescript
const now = new Date()
```

3. **Handles booleans** as numbers:
```typescript
const emailVerified = row.email_verified === 1
```

## Schema Compatibility

The MySQL schema includes all OAuth provider columns:
- `github_id`
- `google_id`
- `discord_id`
- `apple_id`
- `microsoft_id`
- `linkedin_id`
- `meta_id`

All provider IDs are stored as `VARCHAR(255)` and indexed for fast lookups.

## Character Set

Tables use `utf8mb4` character set with `utf8mb4_unicode_ci` collation for full Unicode support, including emojis.
