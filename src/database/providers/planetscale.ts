/**
 * Kysely dialect and driver implementation for PlanetScale
 *
 * This module provides a Kysely-compatible database driver that uses PlanetScale's
 * serverless driver over HTTP. It allows ClearAuth to use PlanetScale as a database
 * backend in edge environments.
 *
 * @example
 * ```ts
 * import { createPlanetScaleKysely } from "clearauth"
 *
 * const db = createPlanetScaleKysely({
 *   host: process.env.PLANETSCALE_HOST,
 *   username: process.env.PLANETSCALE_USERNAME,
 *   password: process.env.PLANETSCALE_PASSWORD
 * })
 * ```
 */

import {
  Kysely,
  Dialect,
  DialectAdapter,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  CompiledQuery,
  QueryResult,
  Driver,
  DatabaseConnection,
  TransactionSettings
} from "kysely"
import { Logger, getDefaultLogger } from "../../logger.js"

/**
 * Configuration for PlanetScale Kysely client
 */
export type PlanetScaleKyselyConfig = {
  /** PlanetScale database host */
  host: string
  /** PlanetScale username */
  username: string
  /** PlanetScale password */
  password: string
  /** Custom fetch implementation (optional) */
  fetch?: typeof fetch
  /** Custom logger instance */
  logger?: Logger
}

/**
 * Database connection implementation for PlanetScale
 * @internal
 */
class PlanetScaleDatabaseConnection implements DatabaseConnection {
  private readonly config: PlanetScaleKyselyConfig
  private readonly logger: Logger
  private connection: any = null

  constructor(config: PlanetScaleKyselyConfig, logger: Logger) {
    this.config = config
    this.logger = logger
  }

  private async getConnection() {
    if (!this.connection) {
      // Dynamically import PlanetScale to avoid bundling if not used
      const { connect } = await import("@planetscale/database")
      this.connection = connect({
        host: this.config.host,
        username: this.config.username,
        password: this.config.password,
        fetch: this.config.fetch
      })
    }
    return this.connection
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const conn = await this.getConnection()

    this.logger.debug("Executing PlanetScale query", {
      sqlLength: compiledQuery.sql.length,
      paramCount: compiledQuery.parameters.length
    })

    const result = await conn.execute(compiledQuery.sql, compiledQuery.parameters as any[])

    return {
      rows: result.rows as R[]
    } as QueryResult<R>
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    const result = await this.executeQuery<R>(compiledQuery)
    yield result
  }
}

class PlanetScaleDriver implements Driver {
  private readonly config: PlanetScaleKyselyConfig
  private readonly logger: Logger

  constructor(config: PlanetScaleKyselyConfig) {
    this.config = config
    this.logger = config.logger ?? getDefaultLogger()
    this.logger.debug("Creating PlanetScaleDriver")
  }

  async init(): Promise<void> {
    this.logger.debug("PlanetScaleDriver initialized")
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new PlanetScaleDatabaseConnection(this.config, this.logger)
  }

  async beginTransaction(_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    throw new Error(
      'Transactions are not supported by the PlanetScale adapter. ' +
      'ClearAuth does not currently use transactions, so this should not affect functionality. ' +
      'If you need transaction support, please open an issue at https://github.com/dundas/clearauth/issues'
    )
  }

  async commitTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the PlanetScale adapter')
  }

  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
    throw new Error('Transactions are not supported by the PlanetScale adapter')
  }

  async releaseConnection(_connection: DatabaseConnection): Promise<void> {}

  async destroy(): Promise<void> {}
}

class PlanetScaleMysqlDialect implements Dialect {
  private readonly config: PlanetScaleKyselyConfig

  constructor(config: PlanetScaleKyselyConfig) {
    this.config = config
  }

  createAdapter(): DialectAdapter {
    return new MysqlAdapter()
  }

  createDriver(): Driver {
    return new PlanetScaleDriver(this.config)
  }

  createIntrospector(db: Kysely<any>) {
    return new MysqlIntrospector(db)
  }

  createQueryCompiler() {
    return new MysqlQueryCompiler()
  }
}

/**
 * Create a Kysely instance configured for PlanetScale
 *
 * @param config - PlanetScale configuration
 * @returns Kysely instance
 *
 * @example
 * ```ts
 * const db = createPlanetScaleKysely({
 *   host: process.env.PLANETSCALE_HOST,
 *   username: process.env.PLANETSCALE_USERNAME,
 *   password: process.env.PLANETSCALE_PASSWORD
 * })
 * ```
 */
export function createPlanetScaleKysely(config: PlanetScaleKyselyConfig): Kysely<any> {
  const logger = config.logger ?? getDefaultLogger()
  logger.debug("Creating Kysely instance with PlanetScaleMysqlDialect")
  const dialect = new PlanetScaleMysqlDialect(config)
  const db = new Kysely({ dialect })
  logger.debug("Kysely instance created for PlanetScale")
  return db
}
