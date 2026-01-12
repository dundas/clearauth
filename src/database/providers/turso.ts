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
  private readonly client: any
  private readonly logger: Logger

  constructor(client: any, logger: Logger) {
    this.client = client
    this.logger = logger
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const client = this.client

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
  private client: any = null

  constructor(config: TursoKyselyConfig) {
    this.url = config.url
    this.authToken = config.authToken
    this.logger = config.logger ?? getDefaultLogger()
    this.logger.debug("Creating TursoDriver")
  }

  private async getClient() {
    if (!this.client) {
      try {
        const { createClient } = await import("@libsql/client")
        this.client = createClient({
          url: this.url,
          authToken: this.authToken
        })
        this.logger.debug("Turso client created and cached")
      } catch (error: any) {
        if (error.code === 'MODULE_NOT_FOUND') {
          throw new Error(
            'Turso driver not installed. Run: npm install @libsql/client\n' +
            'See: https://github.com/tursodatabase/libsql-client-ts'
          )
        }
        throw new Error(`Failed to create Turso client: ${error.message}`)
      }
    }
    return this.client
  }

  async init(): Promise<void> {
    this.logger.debug("TursoDriver initialized")
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    const client = await this.getClient()
    return new TursoDatabaseConnection(client, this.logger)
  }

  async beginTransaction(_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    throw new Error(
      'Transactions are not supported by the Turso adapter. ' +
      'ClearAuth does not currently use transactions, so this should not affect functionality. ' +
      'If you need transaction support, please open an issue at https://github.com/dundas/clearauth/issues'
    )
  }

  async commitTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the Turso adapter')
  }

  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the Turso adapter')
  }

  async releaseConnection(_connection: DatabaseConnection): Promise<void> {}

  async destroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close()
        this.logger.debug("Turso client closed")
      } catch (error: any) {
        this.logger.warn("Error closing Turso client", { error: error.message })
      }
      this.client = null
    }
  }
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
