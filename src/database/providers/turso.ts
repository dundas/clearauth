/**
 * Kysely dialect and driver implementation for Turso (libSQL)
 *
 * This module provides a Kysely-compatible database driver that uses Turso's
 * libSQL client over HTTP. It allows ClearAuth to use Turso as a database
 * backend in edge environments.
 *
 * @example
 * ```ts
 * import { createTursoKysely } from "clearauth"
 *
 * const db = createTursoKysely({
 *   url: process.env.TURSO_DATABASE_URL,
 *   authToken: process.env.TURSO_AUTH_TOKEN
 * })
 * ```
 */

import {
  Kysely,
  Dialect,
  DialectAdapter,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  CompiledQuery,
  QueryResult,
  Driver,
  DatabaseConnection,
  TransactionSettings
} from "kysely"
import { Logger, getDefaultLogger } from "../../logger.js"

/**
 * Configuration for Turso Kysely client
 */
export type TursoKyselyConfig = {
  /** Turso database URL */
  url: string
  /** Turso authentication token */
  authToken: string
  /** Custom logger instance */
  logger?: Logger
}

/**
 * Database connection implementation for Turso
 * @internal
 */
class TursoDatabaseConnection implements DatabaseConnection {
  private readonly url: string
  private readonly authToken: string
  private readonly logger: Logger
  private client: any = null

  constructor(url: string, authToken: string, logger: Logger) {
    this.url = url
    this.authToken = authToken
    this.logger = logger
  }

  private async getClient() {
    if (!this.client) {
      // Dynamically import libSQL to avoid bundling if not used
      const { createClient } = await import("@libsql/client")
      this.client = createClient({
        url: this.url,
        authToken: this.authToken
      })
    }
    return this.client
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const client = await this.getClient()

    this.logger.debug("Executing Turso query", {
      sqlLength: compiledQuery.sql.length,
      paramCount: compiledQuery.parameters.length
    })

    const result = await client.execute({
      sql: compiledQuery.sql,
      args: compiledQuery.parameters as any[]
    })

    return {
      rows: result.rows as R[]
    } as QueryResult<R>
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    const result = await this.executeQuery<R>(compiledQuery)
    yield result
  }
}

class TursoDriver implements Driver {
  private readonly url: string
  private readonly authToken: string
  private readonly logger: Logger

  constructor(config: TursoKyselyConfig) {
    this.url = config.url
    this.authToken = config.authToken
    this.logger = config.logger ?? getDefaultLogger()
    this.logger.debug("Creating TursoDriver")
  }

  async init(): Promise<void> {
    this.logger.debug("TursoDriver initialized")
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new TursoDatabaseConnection(this.url, this.authToken, this.logger)
  }

  async beginTransaction(_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {}

  async commitTransaction(_connection: DatabaseConnection): Promise<void> {}

  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {}

  async releaseConnection(_connection: DatabaseConnection): Promise<void> {}

  async destroy(): Promise<void> {}
}

class TursoSqliteDialect implements Dialect {
  private readonly config: TursoKyselyConfig

  constructor(config: TursoKyselyConfig) {
    this.config = config
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter()
  }

  createDriver(): Driver {
    return new TursoDriver(this.config)
  }

  createIntrospector(db: Kysely<any>) {
    return new SqliteIntrospector(db)
  }

  createQueryCompiler() {
    return new SqliteQueryCompiler()
  }
}

/**
 * Create a Kysely instance configured for Turso (libSQL)
 *
 * @param config - Turso configuration
 * @returns Kysely instance
 *
 * @example
 * ```ts
 * const db = createTursoKysely({
 *   url: process.env.TURSO_DATABASE_URL,
 *   authToken: process.env.TURSO_AUTH_TOKEN
 * })
 * ```
 */
export function createTursoKysely(config: TursoKyselyConfig): Kysely<any> {
  const logger = config.logger ?? getDefaultLogger()
  logger.debug("Creating Kysely instance with TursoSqliteDialect")
  const dialect = new TursoSqliteDialect(config)
  const db = new Kysely({ dialect })
  logger.debug("Kysely instance created for Turso")
  return db
}
