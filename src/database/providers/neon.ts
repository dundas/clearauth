/**
 * Kysely dialect and driver implementation for Neon PostgreSQL
 *
 * This module provides a Kysely-compatible database driver that uses Neon's
 * serverless PostgreSQL driver over HTTP. It allows ClearAuth to use Neon
 * as a database backend in edge environments.
 *
 * @example
 * ```ts
 * import { createNeonKysely } from "clearauth"
 *
 * const db = createNeonKysely({
 *   connectionString: process.env.DATABASE_URL
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
 * Configuration for Neon Kysely client
 */
export type NeonKyselyConfig = {
  /** Neon database connection string */
  connectionString: string
  /** Custom logger instance */
  logger?: Logger
}

/**
 * Database connection implementation for Neon
 * @internal
 */
class NeonDatabaseConnection implements DatabaseConnection {
  private readonly connectionString: string
  private readonly logger: Logger

  constructor(connectionString: string, logger: Logger) {
    this.connectionString = connectionString
    this.logger = logger
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    // Dynamically import Neon to avoid bundling if not used
    const { neon } = await import("@neondatabase/serverless")
    const sql = neon(this.connectionString)

    this.logger.debug("Executing Neon query", {
      sqlLength: compiledQuery.sql.length,
      paramCount: compiledQuery.parameters.length
    })

    // Use the query() method for parameterized queries
    const result = await sql.query(compiledQuery.sql, compiledQuery.parameters as any[])

    return {
      rows: result.rows as R[]
    } as QueryResult<R>
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    const result = await this.executeQuery<R>(compiledQuery)
    yield result
  }
}

class NeonDriver implements Driver {
  private readonly connectionString: string
  private readonly logger: Logger

  constructor(config: NeonKyselyConfig) {
    this.connectionString = config.connectionString
    this.logger = config.logger ?? getDefaultLogger()
    this.logger.debug("Creating NeonDriver")
  }

  async init(): Promise<void> {
    this.logger.debug("NeonDriver initialized")
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new NeonDatabaseConnection(this.connectionString, this.logger)
  }

  async beginTransaction(_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    throw new Error(
      'Transactions are not supported by the Neon adapter. ' +
      'ClearAuth does not currently use transactions, so this should not affect functionality. ' +
      'If you need transaction support, please open an issue at https://github.com/dundas/clearauth/issues'
    )
  }

  async commitTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the Neon adapter')
  }

  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the Neon adapter')
  }

  async releaseConnection(_connection: DatabaseConnection): Promise<void> {}

  async destroy(): Promise<void> {}
}

class NeonPostgresDialect implements Dialect {
  private readonly config: NeonKyselyConfig

  constructor(config: NeonKyselyConfig) {
    this.config = config
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter()
  }

  createDriver(): Driver {
    return new NeonDriver(this.config)
  }

  createIntrospector(db: Kysely<any>) {
    return new PostgresIntrospector(db)
  }

  createQueryCompiler() {
    return new PostgresQueryCompiler()
  }
}

/**
 * Create a Kysely instance configured for Neon PostgreSQL
 *
 * @param config - Neon configuration
 * @returns Kysely instance
 *
 * @example
 * ```ts
 * const db = createNeonKysely({
 *   connectionString: process.env.DATABASE_URL
 * })
 * ```
 */
export function createNeonKysely(config: NeonKyselyConfig): Kysely<any> {
  const logger = config.logger ?? getDefaultLogger()
  logger.debug("Creating Kysely instance with NeonPostgresDialect")
  const dialect = new NeonPostgresDialect(config)
  const db = new Kysely({ dialect })
  logger.debug("Kysely instance created for Neon")
  return db
}
