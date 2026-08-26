import { describe, it, expect, vi, beforeEach } from "vitest"
import { ClearAuthNetworkError, ClearAuthRateLimitError } from "../../errors.js"
import type { ClearAuthConfig } from "../../types.js"
import type { Kysely } from "kysely"
import type { Database } from "../../database/schema.js"

const { mockGenerateGitHubAuthUrl, mockHandleGitHubCallback, mockUpsertOAuthUser } = vi.hoisted(() => ({
  mockGenerateGitHubAuthUrl: vi.fn(),
  mockHandleGitHubCallback: vi.fn(),
  mockUpsertOAuthUser: vi.fn(),
}))

vi.mock("../github.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../github.js")>()
  return {
    ...actual,
    generateGitHubAuthUrl: mockGenerateGitHubAuthUrl,
    handleGitHubCallback: mockHandleGitHubCallback,
  }
})

vi.mock("../callbacks.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../callbacks.js")>()
  return {
    ...actual,
    upsertOAuthUser: mockUpsertOAuthUser,
  }
})

import { handleOAuthRequest } from "../handler.js"

describe("handleOAuthRequest infrastructure errors", () => {
  const config: ClearAuthConfig = {
    database: {} as Kysely<Database>,
    secret: "test-secret",
    baseUrl: "http://localhost:3000",
    oauth: {
      github: {
        clientId: "id",
        clientSecret: "secret",
        redirectUri: "http://localhost:3000/auth/callback/github",
      },
    },
  }

  beforeEach(() => {
    mockGenerateGitHubAuthUrl.mockReset()
    mockHandleGitHubCallback.mockReset()
    mockUpsertOAuthUser.mockReset()
  })

  it("returns 429 when OAuth login initiation hits Mech Storage rate limit", async () => {
    mockGenerateGitHubAuthUrl.mockRejectedValue(new ClearAuthRateLimitError(12_000))

    const response = await handleOAuthRequest(
      new Request("http://localhost:3000/auth/oauth/github"),
      config
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("12")
    const body = await response.json()
    expect(body.error).toBe("temporarily_unavailable")
  })

  it("returns 503 when OAuth callback persistence hits upstream outage", async () => {
    mockHandleGitHubCallback.mockResolvedValue({
      profile: { id: "gh-1", email: "u@example.com", name: "User" },
    })
    mockUpsertOAuthUser.mockRejectedValue(new ClearAuthNetworkError("upstream", 503))

    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:3000/auth/callback/github?code=abc&state=state-1",
        { headers: { Cookie: "oauth_state=state-1" } }
      ),
      config
    )

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error).toBe("temporarily_unavailable")
  })
})
