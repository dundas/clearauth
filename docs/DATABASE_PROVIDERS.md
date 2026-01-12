# Database Providers

ClearAuth supports multiple database providers through Kysely adapters, allowing you to choose the best database for your deployment environment.

## Supported Databases

### Mech Storage (Default)
PostgreSQL via HTTP API - no direct DB connection needed.

**Best for:** General use, HTTP-based access
**Edge Compatible:** ✅ Yes

```typescript
import { createClearAuth } from "clearauth"

const config = createClearAuth({
  secret: process.env.AUTH_SECRET,
  baseUrl: process.env.BASE_URL,
  database: {
    appId: process.env.MECH_APP_ID,
    apiKey: process.env.MECH_API_KEY,
  },
})
```

### Neon PostgreSQL
Serverless PostgreSQL with HTTP API and WebSocket support.

**Best for:** Serverless PostgreSQL, edge environments
**Edge Compatible:** ✅ Yes (Cloudflare Workers, Vercel Edge, Deno)

```typescript
import { createClearAuth, createNeonKysely } from "clearauth"

const db = createNeonKysely({
  connectionString: process.env.DATABASE_URL
})

const config = createClearAuth({
  secret: process.env.AUTH_SECRET,
  baseUrl: process.env.BASE_URL,
  database: db,
})
```

**Environment Variables:**
```bash
DATABASE_URL=postgresql://user:password@project.neon.tech/dbname
```

**Setup:**
1. Create a Neon account at https://neon.tech
2. Create a new project and database
3. Copy the connection string
4. Install the driver: `npm install @neondatabase/serverless`

### Turso (libSQL)
Edge-hosted distributed database based on libSQL (SQLite fork).

**Best for:** SQLite compatibility, global distribution
**Edge Compatible:** ✅ Yes (Cloudflare Workers, Vercel Edge)

```typescript
import { createClearAuth, createTursoKysely } from "clearauth"

const db = createTursoKysely({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
})

const config = createClearAuth({
  secret: process.env.AUTH_SECRET,
  baseUrl: process.env.BASE_URL,
  database: db,
})
```

**Environment Variables:**
```bash
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token
```

**Setup:**
1. Install Turso CLI: `curl -sSfL https://get.tur.so/install.sh | bash`
2. Create a database: `turso db create my-db`
3. Get the URL: `turso db show my-db`
4. Create auth token: `turso db tokens create my-db`
5. Install the driver: `npm install @libsql/client`

**Note:** Turso uses SQLite dialect. You'll need to adapt the schema for SQLite compatibility.

### Cloudflare D1
SQLite database built into Cloudflare Workers.

**Best for:** Cloudflare Workers deployments
**Edge Compatible:** ✅ Yes (Cloudflare Workers only)

```typescript
import { createClearAuth, createD1Kysely } from "clearauth/edge"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = createD1Kysely(env.DB)
    
    const config = createClearAuth({
      secret: env.AUTH_SECRET,
      baseUrl: 'https://your-worker.workers.dev',
      database: db,
      isProduction: true,
    })
    
    return handleClearAuthEdgeRequest(request, config)
  }
}
```

**wrangler.toml:**
```toml
[[d1_databases]]
binding = "DB"
database_name = "clearauth-db"
database_id = "your-database-id"
```

**Setup:**
1. Create D1 database: `wrangler d1 create clearauth-db`
2. Run migrations: `wrangler d1 execute clearauth-db --file=./migrations/schema.sql`
3. Add binding to wrangler.toml

**Note:** D1 uses SQLite dialect. You'll need to adapt the schema for SQLite compatibility.

### PlanetScale
Serverless MySQL with HTTP API.

**Best for:** MySQL compatibility, serverless MySQL
**Edge Compatible:** ✅ Yes (Cloudflare Workers, Vercel Edge, Netlify Edge)

```typescript
import { createClearAuth, createPlanetScaleKysely } from "clearauth"

const db = createPlanetScaleKysely({
  host: process.env.PLANETSCALE_HOST,
  username: process.env.PLANETSCALE_USERNAME,
  password: process.env.PLANETSCALE_PASSWORD
})

const config = createClearAuth({
  secret: process.env.AUTH_SECRET,
  baseUrl: process.env.BASE_URL,
  database: db,
})
```

**Environment Variables:**
```bash
PLANETSCALE_HOST=aws.connect.psdb.cloud
PLANETSCALE_USERNAME=your-username
PLANETSCALE_PASSWORD=your-password
```

**Setup:**
1. Create a PlanetScale account at https://planetscale.com
2. Create a new database
3. Click "Connect" and select "@planetscale/database"
4. Copy the host, username, and password
5. Install the driver: `npm install @planetscale/database`

**Note:** PlanetScale uses MySQL dialect. You'll need to adapt the schema for MySQL compatibility.

### Supabase
PostgreSQL with REST API and connection pooler.

**Best for:** PostgreSQL with built-in features, edge compatibility
**Edge Compatible:** ✅ Yes (via transaction pooler)

```typescript
import { createClearAuth, createSupabaseKysely } from "clearauth"

const db = createSupabaseKysely({
  connectionString: process.env.SUPABASE_DB_URL
})

const config = createClearAuth({
  secret: process.env.AUTH_SECRET,
  baseUrl: process.env.BASE_URL,
  database: db,
})
```

**Environment Variables:**
```bash
# Use the transaction pooler URL for edge compatibility
SUPABASE_DB_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**Setup:**
1. Create a Supabase project at https://supabase.com
2. Go to Database Settings → Connection Pooling
3. Copy the "Transaction" mode connection string
4. Install the driver: `npm install postgres`

**Important:** Use the transaction pooler URL (port 6543) for edge compatibility, not the direct connection URL.

## Schema Compatibility

### PostgreSQL Providers (Mech, Neon, Supabase)
Use the default ClearAuth schema as-is. These providers are fully compatible.

### SQLite Providers (Turso, D1)
SQLite has some differences from PostgreSQL. You'll need to adapt:

1. **UUIDs:** SQLite doesn't have native UUID type. Use `TEXT` instead.
2. **Timestamps:** Use `INTEGER` or `TEXT` for timestamps.
3. **Auto-increment:** Use `AUTOINCREMENT` instead of `SERIAL`.

### MySQL Provider (PlanetScale)
MySQL has some differences from PostgreSQL:

1. **UUIDs:** Use `CHAR(36)` for UUIDs.
2. **Boolean:** Use `TINYINT(1)` instead of `BOOLEAN`.
3. **Timestamps:** Use `DATETIME` or `TIMESTAMP`.

## Migration Guide

### From Mech to Neon
1. Export your data from Mech
2. Create Neon database
3. Import data to Neon
4. Update configuration to use `createNeonKysely`

### From PostgreSQL to SQLite (Turso/D1)
1. Adapt schema for SQLite compatibility
2. Export data from PostgreSQL
3. Transform data types (UUIDs, timestamps)
4. Import to Turso/D1
5. Update configuration

### From PostgreSQL to MySQL (PlanetScale)
1. Adapt schema for MySQL compatibility
2. Export data from PostgreSQL
3. Transform data types
4. Import to PlanetScale
5. Update configuration

## Performance Considerations

- **Neon:** Low latency with HTTP, WebSocket support for connection pooling
- **Turso:** Global edge distribution, lowest latency for reads
- **D1:** Native to Cloudflare Workers, no network overhead
- **PlanetScale:** Global routing, optimized for serverless
- **Supabase:** Connection pooler required for edge, slightly higher latency

## Cost Comparison

- **Mech Storage:** Pay-per-use
- **Neon:** Free tier available, pay for compute + storage
- **Turso:** Free tier available, pay for rows read/written
- **D1:** Free tier (5GB storage, 5M reads/day), then pay-per-use
- **PlanetScale:** Free tier available, pay for reads/writes
- **Supabase:** Free tier available, pay for compute + storage

## Choosing a Provider

**For Cloudflare Workers:**
- D1 (native integration)
- Turso (global distribution)
- Neon (PostgreSQL compatibility)

**For Vercel Edge Functions:**
- Neon (best performance)
- PlanetScale (MySQL compatibility)
- Turso (SQLite compatibility)

**For Node.js/Traditional Hosting:**
- Any provider works
- Mech Storage (default, easy setup)
- Neon (serverless PostgreSQL)
- Supabase (full-featured)

**For Global Distribution:**
- Turso (edge-hosted)
- PlanetScale (global routing)

**For PostgreSQL Compatibility:**
- Mech Storage
- Neon
- Supabase

**For SQLite Compatibility:**
- Turso
- D1

**For MySQL Compatibility:**
- PlanetScale
