import {
  ClearAuthNetworkError,
  ClearAuthRateLimitError,
  ClearAuthSqlError,
  ClearAuthTimeoutError,
} from "../errors.js"

export type InfrastructureErrorFormat = "auth" | "oauth"

type MappedInfrastructureError = {
  status: number
  code: string
  message: string
  retryAfterSeconds?: number
}

const PASS_THROUGH_NETWORK_STATUSES = new Set([502, 503, 504])

function mapInfrastructureError(error: unknown): MappedInfrastructureError | null {
  if (error instanceof ClearAuthRateLimitError) {
    return {
      status: 429,
      code: "RATE_LIMITED",
      message: "Service is busy. Please try again later.",
      retryAfterSeconds: Math.max(1, Math.ceil(error.retryAfter / 1000)),
    }
  }

  if (error instanceof ClearAuthTimeoutError) {
    return {
      status: 504,
      code: "GATEWAY_TIMEOUT",
      message: "Request timed out. Please try again.",
    }
  }

  if (error instanceof ClearAuthNetworkError) {
    const upstream = error.statusCode
    if (upstream && upstream >= 500) {
      const status = PASS_THROUGH_NETWORK_STATUSES.has(upstream) ? upstream : 503
      return {
        status,
        code: "SERVICE_UNAVAILABLE",
        message: "Service is temporarily unavailable. Please try again.",
      }
    }
    return null
  }

  if (error instanceof ClearAuthSqlError) {
    return {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    }
  }

  return null
}

function oauthErrorField(code: string): string {
  if (code === "INTERNAL_ERROR") {
    return "server_error"
  }
  return "temporarily_unavailable"
}

/**
 * Map Mech Storage / transport failures to a safe HTTP response, preserving status where appropriate.
 * Returns null when the error should be handled by the caller's generic fallback.
 */
export function infrastructureErrorResponse(
  error: unknown,
  format: InfrastructureErrorFormat = "auth"
): Response | null {
  const mapped = mapInfrastructureError(error)
  if (!mapped) {
    return null
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (mapped.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(mapped.retryAfterSeconds)
  }

  const body =
    format === "auth"
      ? { error: mapped.message, code: mapped.code }
      : { error: oauthErrorField(mapped.code), message: mapped.message }

  return new Response(JSON.stringify(body), {
    status: mapped.status,
    headers,
  })
}
