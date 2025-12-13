/**
 * Kysely dialect and driver implementation for Mech Storage
 *
 * This module provides a Kysely-compatible database driver that uses Mech Storage's
 * PostgreSQL HTTP API as the backend. It allows Better Auth and other Kysely-based
 * applications to use Mech Storage as their database without direct PostgreSQL connections.
 *
 * @example
 * ```ts
 * import { createMechKysely } from "clearauth"
 * import { betterAuth } from "better-auth"
 *
 * const db = createMechKysely()
 * const auth = betterAuth({
 *   database: { db, type: "postgres" }
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
import { MechSqlClient, MechSqlClientConfig } from "./mech-sql-client.js"
import { Logger, getDefaultLogger } from "./logger.js"

/**
 * Database connection implementation for Mech Storage
 *
 * Implements Kysely's DatabaseConnection interface by delegating SQL execution
 * to the MechSqlClient, which uses Mech Storage's HTTP API.
 *
 * @internal
 */
class MechDatabaseConnection implements DatabaseConnection {
  private readonly client: MechSqlClient

  constructor(client: MechSqlClient) {
    this.client = client
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const result = await this.client.execute<R>(compiledQuery.sql, compiledQuery.parameters ?? [])
    return {
      rows: result.rows
    } as QueryResult<R>
  }

  async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    const result = await this.executeQuery<R>(compiledQuery)
    yield result
  }
}

class MechDriver implements Driver {
  private readonly client: MechSqlClient
  private readonly logger: Logger

  constructor(config: MechSqlClientConfig, logger?: Logger) {
    this.logger = logger ?? getDefaultLogger()
    this.logger.debug("Creating MechDriver", { configProvided: !!config })
    this.client = new MechSqlClient(config)
  }

  async init(): Promise<void> {
    this.logger.debug("MechDriver initialized")
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new MechDatabaseConnection(this.client)
  }

  async beginTransaction(_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {}

  async commitTransaction(_connection: DatabaseConnection): Promise<void> {}

  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {}

  async releaseConnection(_connection: DatabaseConnection): Promise<void> {}

  async destroy(): Promise<void> {}
}

class MechPostgresDialect implements Dialect {
  private readonly config: MechSqlClientConfig

  constructor(config: MechSqlClientConfig) {
    this.config = config
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter()
  }

  createDriver(): Driver {
    return new MechDriver(this.config)
  }

  createIntrospector(db: Kysely<any>) {
    return new PostgresIntrospector(db)
  }

  createQueryCompiler() {
    return new PostgresQueryCompiler()
  }
}

export type MechKyselyConfig = MechSqlClientConfig

export function createMechKysely(config: MechKyselyConfig): Kysely<any> {
  const logger = config.logger ?? getDefaultLogger()
  logger.debug("Creating Kysely instance with MechPostgresDialect")
  const dialect = new MechPostgresDialect(config)
  const db = new Kysely({ dialect })
  logger.debug("Kysely instance created")
  return db
}
