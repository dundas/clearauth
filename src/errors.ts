/**
 * Error types for ClearAuth
 */

export class ClearAuthError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: Record<string, any>) {
    super(message)
    this.name = "ClearAuthError"
  }
}

export class ClearAuthSqlError extends ClearAuthError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "CLEARAUTH_SQL_ERROR", details)
    this.name = "ClearAuthSqlError"
  }
}

export class ClearAuthConfigError extends ClearAuthError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "CLEARAUTH_CONFIG_ERROR", details)
    this.name = "ClearAuthConfigError"
  }
}

export class ClearAuthNetworkError extends ClearAuthError {
  constructor(message: string, public readonly statusCode?: number, details?: Record<string, any>) {
    super(message, "CLEARAUTH_NETWORK_ERROR", details)
    this.name = "ClearAuthNetworkError"
  }
}

export class ClearAuthTimeoutError extends ClearAuthError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "CLEARAUTH_TIMEOUT_ERROR", details)
    this.name = "ClearAuthTimeoutError"
  }
}

export class ClearAuthRateLimitError extends ClearAuthError {
  constructor(public readonly retryAfter: number, details?: Record<string, any>) {
    super(`Rate limit exceeded. Retry after ${retryAfter}ms`, "CLEARAUTH_RATE_LIMIT_ERROR", details)
    this.name = "ClearAuthRateLimitError"
  }
}
