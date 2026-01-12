/**
 * Kysely dialect and driver implementation for Supabase PostgreSQL
 *
 * This module provides a Kysely-compatible database driver that uses Supabase's
 * connection pooler for edge-compatible PostgreSQL access. It allows ClearAuth
 * to use Supabase as a database backend in edge environments.
 *
 * @example
 * ```ts
 * import { createSupabaseKysely } from "clearauth"
 *
 * const db = createSupabaseKysely({
 *   connectionString: process.env.SUPABASE_DB_URL
 * })
 * ```
 */

import {
  Kysely,
  Dialect,
  DialectAdapter,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  CompiledQuery,
  QueryResult,
  Driver,
  DatabaseConnection,
  TransactionSettings
} from "kysely"
import { Logger, getDefaultLogger } from "../../logger.js"

/**
 * Configuration for Supabase Kysely client
 */
export type SupabaseKyselyConfig = {
  /** Supabase database connection string (use transaction pooler URL) */
  connectionString: string
  /** Custom logger instance */
  logger?: Logger
}

/**
 * Database connection implementation for Supabase
 * @internal
 */
class SupabaseDatabaseConnection implements DatabaseConnection {
  private readonly sql: any
  private readonly logger: Logger

  constructor(sql: any, logger: Logger) {
    this.sql = sql
    this.logger = logger
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const sql = this.sql

    this.logger.debug("Executing Supabase query", {
      sqlLength: compiledQuery.sql.length,
      paramCount: compiledQuery.parameters.length
    })

    // postgres.js uses a different parameter format
    const result = await sql.unsafe(compiledQuery.sql, compiledQuery.parameters as any[])

    return {
      rows: result as R[]
    } as QueryResult<R>
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    const result = await this.executeQuery<R>(compiledQuery)
    yield result
  }
}

class SupabaseDriver implements Driver {
  private readonly connectionString: string
  private readonly logger: Logger
  private sql: any = null

  constructor(config: SupabaseKyselyConfig) {
    this.connectionString = config.connectionString
    this.logger = config.logger ?? getDefaultLogger()
    this.logger.debug("Creating SupabaseDriver")
  }

  private async getClient() {
    if (!this.sql) {
      try {
        const postgres = (await import("postgres")).default
        // Use transaction pooler mode for edge compatibility
        this.sql = postgres(this.connectionString, {
          prepare: false,
          max: 1
        })
        this.logger.debug("Supabase client created and cached")
      } catch (error: any) {
        if (error.code === 'MODULE_NOT_FOUND') {
          throw new Error(
            'Postgres driver not installed. Run: npm install postgres\n' +
            'See: https://github.com/porsager/postgres'
          )
        }
        throw new Error(`Failed to create Supabase client: ${error.message}`)
      }
    }
    return this.sql
  }

  async init(): Promise<void> {
    this.logger.debug("SupabaseDriver initialized")
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    const sql = await this.getClient()
    return new SupabaseDatabaseConnection(sql, this.logger)
  }

  async beginTransaction(_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    throw new Error(
      'Transactions are not supported by the Supabase adapter. ' +
      'ClearAuth does not currently use transactions, so this should not affect functionality. ' +
      'If you need transaction support, please open an issue at https://github.com/dundas/clearauth/issues'
    )
  }

  async commitTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the Supabase adapter')
  }

  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the Supabase adapter')
  }

  async releaseConnection(_connection: DatabaseConnection): Promise<void> {}

  async destroy(): Promise<void> {
    if (this.sql) {
      try {
        await this.sql.end()
        this.logger.debug("Supabase client closed")
      } catch (error: any) {
        this.logger.warn("Error closing Supabase client", { error: error.message })
      }
      this.sql = null
    }
  }
}

class SupabasePostgresDialect implements Dialect {
  private readonly config: SupabaseKyselyConfig

  constructor(config: SupabaseKyselyConfig) {
    this.config = config
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter()
  }

  createDriver(): Driver {
    return new SupabaseDriver(this.config)
  }

  createIntrospector(db: Kysely<any>) {
    return new PostgresIntrospector(db)
  }

  createQueryCompiler() {
    return new PostgresQueryCompiler()
  }
}

/**
 * Create a Kysely instance configured for Supabase PostgreSQL
 *
 * Note: Use the transaction pooler connection string for edge compatibility.
 * Example: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
 *
 * @param config - Supabase configuration
 * @returns Kysely instance
 *
 * @example
 * ```ts
 * const db = createSupabaseKysely({
 *   connectionString: process.env.SUPABASE_DB_URL
 * })
 * ```
 */
export function createSupabaseKysely(config: SupabaseKyselyConfig): Kysely<any> {
  const logger = config.logger ?? getDefaultLogger()
  logger.debug("Creating Kysely instance with SupabasePostgresDialect")
  const dialect = new SupabasePostgresDialect(config)
  const db = new Kysely({ dialect })
  logger.debug("Kysely instance created for Supabase")
  return db
}
