import { describe, it, expect, vi, beforeEach } from "vitest"
import { ClearAuthNetworkError } from "../../errors.js"
import type { ClearAuthConfig } from "../../types.js"
import type { Kysely } from "kysely"
import type { Database } from "../../database/schema.js"

const { mockListUserDevices, mockGetSessionFromCookie } = vi.hoisted(() => ({
  mockListUserDevices: vi.fn(),
  mockGetSessionFromCookie: vi.fn(),
}))

vi.mock("../device-registration.js", () => ({
  listUserDevices: mockListUserDevices,
  revokeDevice: vi.fn(),
}))

vi.mock("../../session/validate.js", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}))

import { handleListDevicesRequest } from "../handlers.js"

describe("handleListDevicesRequest infrastructure errors", () => {
  const config: ClearAuthConfig = {
    database: {} as Kysely<Database>,
    secret: "test-secret",
    baseUrl: "http://localhost:3000",
  }

  beforeEach(() => {
    mockListUserDevices.mockReset()
    mockGetSessionFromCookie.mockReset()
    mockGetSessionFromCookie.mockResolvedValue({
      user: { id: "user-1", email: "u@example.com" },
      session: { id: "sess-1" },
    })
  })

  it("returns 504 when listing devices hits upstream timeout class error", async () => {
    mockListUserDevices.mockRejectedValue(new ClearAuthNetworkError("upstream", 504))

    const response = await handleListDevicesRequest(
      new Request("http://localhost:3000/auth/devices", { method: "GET" }),
      config
    )

    expect(response.status).toBe(504)
    const body = await response.json()
    expect(body.error).toBe("temporarily_unavailable")
  })
})
