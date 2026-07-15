import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../../database/schema.js'
import type { ClearAuthConfig } from '../../types.js'
import { handleAuthRequest } from '../handler.js'

function createMockDb(): Kysely<Database> {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn(),
    deleteFrom: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    insertInto: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
  } as unknown as Kysely<Database>
}

describe('POST /auth/resend-verification', () => {
  let database: Kysely<Database>
  let sendVerificationEmail: ReturnType<typeof vi.fn>
  let config: ClearAuthConfig

  beforeEach(() => {
    database = createMockDb()
    sendVerificationEmail = vi.fn(async () => {})
    config = {
      database,
      secret: 'test-secret',
      baseUrl: 'https://example.com',
      email: { sendVerificationEmail },
    }

    vi.mocked(
      database
        .selectFrom('users')
        .select(['id', 'email', 'email_verified'])
        .where('email', '=', 'user@example.com')
        .executeTakeFirst
    ).mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com',
      email_verified: false,
    })
    vi.mocked(
      database.deleteFrom('email_verification_tokens').where('user_id', '=', 'user-123').execute
    ).mockResolvedValue([])
    vi.mocked(database.insertInto('email_verification_tokens').values({} as never).execute)
      .mockResolvedValue([])
    vi.clearAllMocks()
  })

  it('delivers the token internally but returns only a generic success result', async () => {
    const request = new Request('https://example.com/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    })

    const response = await handleAuthRequest(request, config)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ success: true })
    expect(data).not.toHaveProperty('token')
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringMatching(/^[A-Za-z0-9_-]+$/),
      expect.stringMatching(/^\/auth\/verify-email\?token=[A-Za-z0-9_-]+$/)
    )
  })

  it('fails before token creation when no delivery mechanism is configured', async () => {
    const request = new Request('https://example.com/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    })

    const response = await handleAuthRequest(request, { ...config, email: undefined })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data).toEqual({ error: 'Internal server error', code: 'INTERNAL_ERROR' })
    expect(database.selectFrom).not.toHaveBeenCalled()
  })

  it('returns the same public result when the email is unknown', async () => {
    vi.mocked(
      database
        .selectFrom('users')
        .select(['id', 'email', 'email_verified'])
        .where('email', '=', 'unknown@example.com')
        .executeTakeFirst
    ).mockResolvedValueOnce(undefined)
    vi.clearAllMocks()

    const request = new Request('https://example.com/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@example.com' }),
    })

    const response = await handleAuthRequest(request, config)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ success: true })
    expect(sendVerificationEmail).not.toHaveBeenCalled()
  })
})
