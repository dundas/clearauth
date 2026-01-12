/**
 * Kysely dialect and driver implementation for Cloudflare D1
 *
 * This module provides a Kysely-compatible database driver that uses Cloudflare D1's
 * native binding. It allows ClearAuth to use D1 as a database backend in Cloudflare Workers.
 *
 * @example
 * ```ts
 * import { createD1Kysely } from "clearauth"
 *
 * // In your Cloudflare Worker
 * const db = createD1Kysely(env.DB)
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
 * Cloudflare D1 Database binding type
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement
  dump(): Promise<ArrayBuffer>
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<D1ExecResult>
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  run<T = unknown>(): Promise<D1Result<T>>
  all<T = unknown>(): Promise<D1Result<T>>
  raw<T = unknown>(): Promise<T[]>
}

export interface D1Result<T = unknown> {
  results?: T[]
  success: boolean
  meta: {
    duration: number
    rows_read: number
    rows_written: number
  }
}

export interface D1ExecResult {
  count: number
  duration: number
}

/**
 * Configuration for D1 Kysely client
 */
export type D1KyselyConfig = {
  /** D1 database binding from Cloudflare Workers environment */
  database: D1Database
  /** Custom logger instance */
  logger?: Logger
}

/**
 * Database connection implementation for Cloudflare D1
 * @internal
 */
class D1DatabaseConnection implements DatabaseConnection {
  private readonly db: D1Database
  private readonly logger: Logger

  constructor(db: D1Database, logger: Logger) {
    this.db = db
    this.logger = logger
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    this.logger.debug("Executing D1 query", {
      sqlLength: compiledQuery.sql.length,
      paramCount: compiledQuery.parameters.length
    })

    const stmt = this.db.prepare(compiledQuery.sql)
    const boundStmt = compiledQuery.parameters.length > 0
      ? stmt.bind(...compiledQuery.parameters)
      : stmt

    const result = await boundStmt.all()

    if (!result.success) {
      throw new Error("D1 query failed")
    }

    return {
      rows: (result.results ?? []) as R[]
    } as QueryResult<R>
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    const result = await this.executeQuery<R>(compiledQuery)
    yield result
  }
}

class D1Driver implements Driver {
  private readonly db: D1Database
  private readonly logger: Logger

  constructor(config: D1KyselyConfig) {
    this.db = config.database
    this.logger = config.logger ?? getDefaultLogger()
    this.logger.debug("Creating D1Driver")
  }

  async init(): Promise<void> {
    this.logger.debug("D1Driver initialized")
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1DatabaseConnection(this.db, this.logger)
  }

  async beginTransaction(_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    throw new Error(
      'Transactions are not supported by the D1 adapter. ' +
      'ClearAuth does not currently use transactions, so this should not affect functionality. ' +
      'If you need transaction support, please open an issue at https://github.com/dundas/clearauth/issues'
    )
  }

  async commitTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the D1 adapter')
  }

  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the D1 adapter')
  }

  async releaseConnection(_connection: DatabaseConnection): Promise<void> {}

  async destroy(): Promise<void> {}
}

class D1SqliteDialect implements Dialect {
  private readonly config: D1KyselyConfig

  constructor(config: D1KyselyConfig) {
    this.config = config
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter()
  }

  createDriver(): Driver {
    return new D1Driver(this.config)
  }

  createIntrospector(db: Kysely<any>) {
    return new SqliteIntrospector(db)
  }

  createQueryCompiler() {
    return new SqliteQueryCompiler()
  }
}

/**
 * Create a Kysely instance configured for Cloudflare D1
 *
 * @param database - D1 database binding from Cloudflare Workers environment
 * @param logger - Optional custom logger
 * @returns Kysely instance
 *
 * @example
 * ```ts
 * // In your Cloudflare Worker
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     const db = createD1Kysely(env.DB)
 *     // Use db with ClearAuth...
 *   }
 * }
 * ```
 */
export function createD1Kysely(database: D1Database, logger?: Logger): Kysely<any> {
  const log = logger ?? getDefaultLogger()
  log.debug("Creating Kysely instance with D1SqliteDialect")
  const dialect = new D1SqliteDialect({ database, logger: log })
  const db = new Kysely({ dialect })
  log.debug("Kysely instance created for D1")
  return db
}
