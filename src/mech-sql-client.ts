import {
  ClearAuthSqlError,
  ClearAuthNetworkError,
  ClearAuthTimeoutError,
  ClearAuthRateLimitError,
} from "./errors.js"
import { Logger, getDefaultLogger } from "./logger.js"
import { validateUrl, validateUuid, validateNonEmpty, validatePositive, validateRange } from "./validation.js"

/**
 * Response type from Mech Storage PostgreSQL API
 */
export type MechSqlResponse = {
  success: boolean
  rows?: unknown[]
  rowCount?: number
  error?: {
    code: string
    message: string
    hints?: string[]
  }
}

/**
 * Configuration for MechSqlClient
 *
 * Minimal required config:
 * - appId: Your Mech app ID
 * - apiKey: Your Mech API key
 *
 * All other fields have sensible defaults:
 * - baseUrl: defaults to "https://storage.mechdna.net"
 * - appSchemaId: defaults to appId (most common case)
 * - timeout: defaults to 30000ms
 * - maxRetries: defaults to 2
 */
export type MechSqlClientConfig = {
  /** Mech Storage base URL. Defaults to "https://storage.mechdna.net" */
  baseUrl?: string
  /** Mech App ID. Required */
  appId: string
  /** Mech App Schema ID. Defaults to appId if not provided */
  appSchemaId?: string
  /** Mech API Key. Required */
  apiKey: string
  /** Request timeout in ms. Defaults to 30000 */
  timeout?: number
  /** Custom logger instance */
  logger?: Logger
  /** Max retry attempts for failed requests. Defaults to 2 */
  maxRetries?: number
}

/**
 * HTTP client for Mech Storage PostgreSQL API
 *
 * @example
 * ```ts
 * const client = new MechSqlClient()
 * const { rows } = await client.execute("SELECT * FROM users WHERE id = $1", [123])
 * ```
 */
export class MechSqlClient {
  private readonly baseUrl: string
  private readonly appId: string
  private readonly appSchemaId: string
  private readonly apiKey: string
  private readonly timeout: number
  private readonly logger: Logger
  private readonly maxRetries: number

  constructor(config: MechSqlClientConfig) {
    // Resolve values with smart defaults
    this.baseUrl = config.baseUrl ?? "https://storage.mechdna.net"
    this.appId = config.appId
    // appSchemaId defaults to appId if not explicitly provided (most common case)
    this.appSchemaId = config.appSchemaId ?? this.appId
    this.apiKey = config.apiKey
    this.timeout = config.timeout ?? 30000
    this.logger = config.logger ?? getDefaultLogger()
    this.maxRetries = config.maxRetries ?? 2

    // Validate configuration
    validateUrl(this.baseUrl, "baseUrl")
    validateNonEmpty(this.appId, "appId")
    validateUuid(this.appId, "appId")
    validateNonEmpty(this.appSchemaId, "appSchemaId")
    validateUuid(this.appSchemaId, "appSchemaId")
    validateNonEmpty(this.apiKey, "apiKey")
    validatePositive(this.timeout, "timeout")
    validateRange(this.maxRetries, 0, 5, "maxRetries")

    this.logger.debug("MechSqlClient initialized", {
      baseUrl: this.baseUrl,
      appId: this.appId,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    })
  }

  /**
   * Execute a SQL query against Mech Storage
   *
   * @param sql - SQL query string (use $1, $2, etc. for parameters)
   * @param params - Query parameters
   * @returns Object with rows and rowCount
   * @throws ClearAuthSqlError, ClearAuthNetworkError, ClearAuthTimeoutError, ClearAuthRateLimitError
   *
   * @example
   * ```ts
   * const { rows } = await client.execute(
   *   "SELECT * FROM users WHERE email = $1",
   *   ["user@example.com"]
   * )
   * ```
   */
  async execute<R = unknown>(sql: string, params: readonly unknown[] = []): Promise<{ rows: R[]; rowCount: number }> {
    return this.executeWithRetry(sql, params, 0)
  }

  private async executeWithRetry<R = unknown>(
    sql: string,
    params: readonly unknown[],
    attempt: number
  ): Promise<{ rows: R[]; rowCount: number }> {
    try {
      return await this.executeOnce<R>(sql, params)
    } catch (err) {
      if (attempt < this.maxRetries && this.isRetryable(err)) {
        const delay = Math.pow(2, attempt) * 100 // exponential backoff
        this.logger.warn(`Query failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`, {
          error: (err as Error).message,
          attempt
        })
        await new Promise((resolve) => setTimeout(resolve, delay))
        return this.executeWithRetry(sql, params, attempt + 1)
      }
      throw err
    }
  }

  private async executeOnce<R = unknown>(sql: string, params: readonly unknown[]): Promise<{ rows: R[]; rowCount: number }> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/apps/${this.appId}/postgresql/query`

    this.logger.debug("Executing SQL query", {
      url,
      paramCount: params.length,
      sqlLength: sql.length
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          "X-App-ID": this.appSchemaId
        },
        body: JSON.stringify({ sql, params }),
        signal: controller.signal
      })

      // Handle rate limiting
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10) * 1000
        this.logger.warn("Rate limited by Mech Storage", { retryAfter })
        throw new ClearAuthRateLimitError(retryAfter, { statusCode: 429 })
      }

      if (!res.ok) {
        const text = await res.text()
        this.logger.error("HTTP error from Mech Storage", {
          status: res.status,
          statusText: res.statusText,
          responseLength: text.length
        })
        throw new ClearAuthNetworkError(`HTTP ${res.status}: ${res.statusText}`, res.status, {
          responseText: text.substring(0, 500) // truncate for logging
        })
      }

      const json: MechSqlResponse = await res.json()

      if (json.success === false) {
        this.logger.error("Mech Storage returned error", {
          code: json.error?.code,
          message: json.error?.message
        })
        throw new ClearAuthSqlError(json.error?.message ?? "Unknown error", {
          code: json.error?.code,
          hints: json.error?.hints
        })
      }

      const rows = (json.rows ?? []) as R[]
      const rowCount: number = json.rowCount ?? rows.length

      this.logger.debug("Query executed successfully", {
        rowCount,
        rowsReturned: rows.length
      })

      return { rows, rowCount }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        this.logger.error("Query timeout", { timeout: this.timeout })
        throw new ClearAuthTimeoutError(`Query timed out after ${this.timeout}ms`, {
          timeout: this.timeout
        })
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof ClearAuthRateLimitError) return true
    if (err instanceof ClearAuthTimeoutError) return true
    if (err instanceof ClearAuthNetworkError && err.statusCode && err.statusCode >= 500) return true
    return false
  }
}
