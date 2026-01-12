# Database Provider Limitations

This document outlines important limitations and considerations when using different database providers with ClearAuth.

## Schema Type Differences

### ⚠️ Critical: Type Mismatches Between Providers

ClearAuth's TypeScript schema is designed for PostgreSQL types. When using SQLite or MySQL providers, you'll encounter type differences that require handling in your application code.

### PostgreSQL (Mech, Neon, Supabase)
- **UUIDs**: Native `UUID` type
- **Booleans**: Native `BOOLEAN` type
- **Timestamps**: `TIMESTAMPTZ` (timezone-aware)
- **No conversion needed** - Types match TypeScript schema

### SQLite (Turso, D1)
- **UUIDs**: Stored as `TEXT`
- **Booleans**: Stored as `INTEGER` (0=false, 1=true)
- **Timestamps**: Stored as `INTEGER` (Unix timestamps)

**Type Conversion Required:**
```typescript
import { createTursoKysely } from 'clearauth'

const db = createTursoKysely({ url: '...', authToken: '...' })
const user = await db.selectFrom('users').selectAll().executeTakeFirst()

// Convert types from SQLite format
const typedUser = {
  ...user,
  email_verified: user.email_verified === 1,  // INTEGER → boolean
  created_at: new Date(user.created_at * 1000),  // Unix timestamp → Date
  updated_at: new Date(user.updated_at * 1000)
}
```

### MySQL (PlanetScale)
- **UUIDs**: Stored as `CHAR(36)`
- **Booleans**: Stored as `TINYINT(1)` (0=false, 1=true)
- **Timestamps**: Stored as `DATETIME`

**Type Conversion Required:**
```typescript
import { createPlanetScaleKysely } from 'clearauth'

const db = createPlanetScaleKysely({ host: '...', username: '...', password: '...' })
const user = await db.selectFrom('users').selectAll().executeTakeFirst()

// Convert types from MySQL format
const typedUser = {
  ...user,
  email_verified: user.email_verified === 1,  // TINYINT(1) → boolean
  // DATETIME is automatically converted to Date by most MySQL drivers
}
```

## Transaction Support

### ⚠️ Transactions Not Implemented

**All database providers currently throw errors when transactions are attempted.**

```typescript
// This will throw an error:
await db.transaction().execute(async (trx) => {
  await trx.insertInto('users').values({...}).execute()
  await trx.insertInto('sessions').values({...}).execute()
})
```

**Why?**
- ClearAuth does not currently use transactions internally
- Implementing proper transaction support requires significant testing
- Each provider has different transaction APIs

**Workaround:**
If you need atomic operations, use provider-specific transaction APIs directly:

```typescript
// Neon example
const { neon } = await import('@neondatabase/serverless')
const sql = neon(connectionString)
await sql.begin(async (sql) => {
  await sql`INSERT INTO users ...`
  await sql`INSERT INTO sessions ...`
})
```

**Future Support:**
Transaction support is planned for a future release. Track progress at: https://github.com/dundas/clearauth/issues

## Connection Pooling

### Limited Configuration

**Current Behavior:**
- Connections are cached at the Driver level
- One connection per Kysely instance
- No configurable pool size

**Supabase Specific:**
```typescript
// Hardcoded to max: 1 connection
this.sql = postgres(connectionString, {
  prepare: false,  // Required for transaction pooler
  max: 1           // Not configurable
})
```

**Impact:**
- May cause connection exhaustion in high-traffic scenarios
- Supabase transaction pooler has connection limits

**Workaround:**
Create multiple Kysely instances if you need more connections (not recommended for edge environments).

## Edge Runtime Compatibility

### Supabase Transaction Pooler Required

**⚠️ Must use transaction pooler URL for edge compatibility**

```typescript
// ✅ Correct - Transaction pooler (port 6543)
const connectionString = 'postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres'

// ❌ Wrong - Direct connection (port 5432) - won't work in edge
const connectionString = 'postgresql://postgres.[PROJECT]:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres'
```

**Why?**
- Direct connections require long-lived TCP connections
- Edge runtimes don't support persistent connections
- Transaction pooler uses HTTP-compatible protocol

### PlanetScale Foreign Keys

**⚠️ PlanetScale disables foreign key constraints**

```sql
-- This constraint won't be enforced:
CONSTRAINT fk_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

**Impact:**
- Cascading deletes don't work automatically
- Must manually delete related records
- Application code must maintain referential integrity

**Workaround:**
```typescript
// Manual cascade delete
await db.deleteFrom('sessions').where('user_id', '=', userId).execute()
await db.deleteFrom('users').where('id', '=', userId).execute()
```

## Security Considerations

### Error Messages May Expose Credentials

**⚠️ Error messages might contain connection strings**

```typescript
// Error might include full connection string with password
throw new Error(`Failed to create Neon client: ${error.message}`)
```

**Mitigation:**
- Never log full error messages in production
- Use structured logging with sanitization
- Monitor logs for exposed credentials

### Supabase `prepare: false`

**⚠️ Prepared statements are disabled**

```typescript
this.sql = postgres(connectionString, {
  prepare: false  // Required for transaction pooler
})
```

**Impact:**
- Slightly reduced performance (no query plan caching)
- Still safe - Kysely uses parameterized queries

**Why Required:**
- Supabase transaction pooler doesn't support prepared statements
- This is a Supabase limitation, not a ClearAuth issue

## Performance Characteristics

### HTTP Overhead

**All providers use HTTP for queries (no persistent connections)**

| Provider | Protocol | Latency |
|----------|----------|---------|
| Mech Storage | HTTP | ~50-100ms |
| Neon | HTTP/WebSocket | ~30-80ms |
| Turso | HTTP | ~20-60ms (edge-optimized) |
| D1 | Native (Workers) | ~5-20ms |
| PlanetScale | HTTP | ~40-90ms |
| Supabase | HTTP (pooler) | ~50-120ms |

**Implications:**
- Higher latency than native database connections
- Trade-off for edge compatibility
- Batch queries when possible to reduce round trips

## Testing Limitations

### No Integration Tests

**⚠️ Current tests only verify instance creation**

```typescript
// Current test coverage
it('should create a Kysely instance', () => {
  const db = createNeonKysely(config)
  expect(db).toBeDefined()
})
```

**Missing:**
- Actual query execution tests
- Type conversion tests
- Error handling tests
- Connection failure tests

**Recommendation:**
Test your specific queries with actual database instances before deploying to production.

## Migration Considerations

### Schema Conversion Required

**When migrating from PostgreSQL to SQLite/MySQL:**

1. **Convert UUID columns:**
   - PostgreSQL: `UUID`
   - SQLite: `TEXT`
   - MySQL: `CHAR(36)`

2. **Convert boolean columns:**
   - PostgreSQL: `BOOLEAN`
   - SQLite: `INTEGER`
   - MySQL: `TINYINT(1)`

3. **Convert timestamp columns:**
   - PostgreSQL: `TIMESTAMPTZ`
   - SQLite: `INTEGER` (Unix timestamp)
   - MySQL: `DATETIME`

4. **Update triggers:**
   - SQLite triggers use different syntax
   - MySQL triggers use different syntax
   - Test thoroughly after migration

### Data Migration

**Type conversion required when migrating data:**

```typescript
// PostgreSQL → SQLite
const pgUser = { created_at: new Date('2024-01-01') }
const sqliteUser = { created_at: Math.floor(pgUser.created_at.getTime() / 1000) }

// PostgreSQL → MySQL
const pgUser = { email_verified: true }
const mysqlUser = { email_verified: pgUser.email_verified ? 1 : 0 }
```

## Recommendations

### For Production Use

1. **Start with PostgreSQL providers** (Mech, Neon, Supabase) - no type conversion needed
2. **Test thoroughly** with your specific queries before deploying
3. **Monitor error logs** for exposed credentials
4. **Use connection pooling** at the application level if needed
5. **Implement retry logic** for transient network failures

### For SQLite/MySQL

1. **Create type conversion helpers** for your application
2. **Test type conversions** thoroughly
3. **Document type differences** for your team
4. **Consider using TypeScript type guards** for runtime safety

### Future Improvements

Track these planned improvements:
- Transaction support
- Configurable connection pooling
- Type conversion helpers
- Integration tests
- Better error sanitization

## Getting Help

If you encounter issues:
1. Check this limitations document
2. Review provider-specific documentation
3. Open an issue: https://github.com/dundas/clearauth/issues
4. Include sanitized error messages (remove credentials!)
