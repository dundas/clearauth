import { describe, it, expect, vi, beforeEach } from "vitest"
import { ClearAuthRateLimitError } from "../../errors.js"
import type { ClearAuthConfig } from "../../types.js"
import type { Kysely } from "kysely"
import type { Database } from "../../database/schema.js"

const { mockGenerateGitHubAuthUrl } = vi.hoisted(() => ({
  mockGenerateGitHubAuthUrl: vi.fn(),
}))

vi.mock("../github.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../github.js")>()
  return {
    ...actual,
    generateGitHubAuthUrl: mockGenerateGitHubAuthUrl,
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
})
