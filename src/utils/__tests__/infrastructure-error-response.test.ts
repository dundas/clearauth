import { describe, it, expect } from "vitest"
import {
  ClearAuthNetworkError,
  ClearAuthRateLimitError,
  ClearAuthSqlError,
  ClearAuthTimeoutError,
} from "../../errors.js"
import { infrastructureErrorResponse } from "../infrastructure-error-response.js"

describe("infrastructureErrorResponse", () => {
  it("maps rate limit to 429 with Retry-After (auth format)", async () => {
    const res = infrastructureErrorResponse(
      new ClearAuthRateLimitError(45_000, { statusCode: 429 }),
      "auth"
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    expect(res!.headers.get("Retry-After")).toBe("45")
    const body = await res!.json()
    expect(body).toEqual({
      error: "Service is busy. Please try again later.",
      code: "RATE_LIMITED",
    })
  })

  it("maps timeout to 504", async () => {
    const res = infrastructureErrorResponse(new ClearAuthTimeoutError("timed out"), "auth")
    expect(res!.status).toBe(504)
    const body = await res!.json()
    expect(body.code).toBe("GATEWAY_TIMEOUT")
  })

  it("passes through 503 from network errors", async () => {
    const res = infrastructureErrorResponse(
      new ClearAuthNetworkError("upstream", 503),
      "auth"
    )
    expect(res!.status).toBe(503)
    const body = await res!.json()
    expect(body.code).toBe("SERVICE_UNAVAILABLE")
  })

  it("maps upstream 500 network errors to 503", async () => {
    const res = infrastructureErrorResponse(
      new ClearAuthNetworkError("upstream", 500),
      "auth"
    )
    expect(res!.status).toBe(503)
  })

  it("maps SQL errors to generic 500", async () => {
    const res = infrastructureErrorResponse(
      new ClearAuthSqlError("relation missing", { code: "42P01" }),
      "auth"
    )
    expect(res!.status).toBe(500)
    const body = await res!.json()
    expect(body).toEqual({ error: "Internal server error", code: "INTERNAL_ERROR" })
    expect(body.error).not.toContain("relation")
  })

  it("returns null for unrecognized network errors", () => {
    expect(
      infrastructureErrorResponse(new ClearAuthNetworkError("bad request", 400), "auth")
    ).toBeNull()
  })

  it("uses oauth error field for jwt-style responses", async () => {
    const res = infrastructureErrorResponse(
      new ClearAuthRateLimitError(1000),
      "oauth"
    )
    const body = await res!.json()
    expect(body.error).toBe("temporarily_unavailable")
    expect(body.message).toContain("busy")
  })

  it("uses temporarily_unavailable for oauth-format 503 and 504", async () => {
    for (const err of [
      new ClearAuthNetworkError("upstream", 503),
      new ClearAuthTimeoutError("timed out"),
    ]) {
      const res = infrastructureErrorResponse(err, "oauth")
      const body = await res!.json()
      expect(body.error).toBe("temporarily_unavailable")
    }
  })

  it("maps uncommon upstream 5xx to 503", async () => {
    const res = infrastructureErrorResponse(
      new ClearAuthNetworkError("upstream", 507),
      "auth"
    )
    expect(res!.status).toBe(503)
  })

  it("uses server_error in oauth format for SQL failures", async () => {
    const res = infrastructureErrorResponse(
      new ClearAuthSqlError("relation missing", { code: "42P01" }),
      "oauth"
    )
    const body = await res!.json()
    expect(body.error).toBe("server_error")
    expect(res!.status).toBe(500)
  })
})
