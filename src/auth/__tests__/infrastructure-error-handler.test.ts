import { describe, it, expect, vi, beforeEach } from "vitest"
import { ClearAuthNetworkError, ClearAuthRateLimitError } from "../../errors.js"
import type { ClearAuthConfig } from "../../types.js"
import type { Kysely } from "kysely"
import type { Database } from "../../database/schema.js"

const { mockLoginUser } = vi.hoisted(() => ({
  mockLoginUser: vi.fn(),
}))

vi.mock("../login.js", () => ({
  loginUser: mockLoginUser,
  toPublicLoginResult: vi.fn(),
}))

import { handleAuthRequest } from "../handler.js"

describe("handleAuthRequest infrastructure errors", () => {
  const config: ClearAuthConfig = {
    database: {} as Kysely<Database>,
    secret: "test-secret",
    baseUrl: "http://localhost:3000",
  }

  beforeEach(() => {
    mockLoginUser.mockReset()
  })

  it("returns 429 when login hits Mech Storage rate limit", async () => {
    mockLoginUser.mockRejectedValue(new ClearAuthRateLimitError(30_000))

    const response = await handleAuthRequest(
      new Request("http://localhost:3000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u@example.com", password: "SecurePass123!" }),
      }),
      config
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("30")
    const body = await response.json()
    expect(body.code).toBe("RATE_LIMITED")
  })

  it("returns 502 when login hits upstream gateway error", async () => {
    mockLoginUser.mockRejectedValue(new ClearAuthNetworkError("upstream", 502))

    const response = await handleAuthRequest(
      new Request("http://localhost:3000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u@example.com", password: "SecurePass123!" }),
      }),
      config
    )

    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.code).toBe("SERVICE_UNAVAILABLE")
  })
})
