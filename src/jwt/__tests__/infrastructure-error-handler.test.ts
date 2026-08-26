import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateKeyPair, exportPKCS8, exportSPKI } from "jose"
import { ClearAuthNetworkError } from "../../errors.js"
import type { JwtConfig } from "../types.js"
import type { Kysely } from "kysely"
import type { Database } from "../../database/schema.js"

const { mockCreateRefreshToken } = vi.hoisted(() => ({
  mockCreateRefreshToken: vi.fn(),
}))

vi.mock("../refresh-tokens.js", () => ({
  createRefreshToken: mockCreateRefreshToken,
  getRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  updateLastUsed: vi.fn(),
}))

import { handleTokenRequest } from "../handlers.js"

describe("handleTokenRequest infrastructure errors", () => {
  const db = {} as Kysely<Database>
  let jwtConfig: JwtConfig

  beforeEach(async () => {
    mockCreateRefreshToken.mockReset()
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true })
    jwtConfig = {
      privateKey: await exportPKCS8(privateKey),
      publicKey: await exportSPKI(publicKey),
      algorithm: "ES256",
    }
  })

  it("returns 503 when refresh token persistence hits upstream outage", async () => {
    mockCreateRefreshToken.mockRejectedValue(new ClearAuthNetworkError("upstream", 503))

    const response = await handleTokenRequest(
      new Request("http://localhost:3000/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user-1", email: "u@example.com" }),
      }),
      db,
      jwtConfig
    )

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error).toBe("temporarily_unavailable")
  })
})
