import { describe, it, expect } from "vitest"
import {
  defaultSessionConfig,
  shortSessionConfig,
  longSessionConfig,
  createClearAuth,
} from "../createMechAuth.js"
import { ClearAuthConfigError } from "../errors.js"

describe("createClearAuth API", () => {
  describe("session configs", () => {
    it("defaultSessionConfig has 7 day expiration", () => {
      expect(defaultSessionConfig.expiresIn).toBe(60 * 60 * 24 * 7) // 7 days
      expect(defaultSessionConfig.cookie.name).toBe('session')
      expect(defaultSessionConfig.cookie.httpOnly).toBe(true)
      expect(defaultSessionConfig.cookie.sameSite).toBe('lax')
      expect('secure' in defaultSessionConfig.cookie).toBe(false)
      expect(defaultSessionConfig.cookie.path).toBe('/')
    })

    it("shortSessionConfig has 1 hour expiration", () => {
      expect(shortSessionConfig.expiresIn).toBe(60 * 60) // 1 hour
      expect(shortSessionConfig.cookie.name).toBe('session')
      expect(shortSessionConfig.cookie.httpOnly).toBe(true)
      expect(shortSessionConfig.cookie.sameSite).toBe('strict')
      expect('secure' in shortSessionConfig.cookie).toBe(false)
    })

    it("longSessionConfig has 30 day expiration", () => {
      expect(longSessionConfig.expiresIn).toBe(60 * 60 * 24 * 30) // 30 days
      expect(longSessionConfig.cookie.name).toBe('session')
      expect(longSessionConfig.cookie.httpOnly).toBe(true)
      expect(longSessionConfig.cookie.sameSite).toBe('lax')
      expect('secure' in longSessionConfig.cookie).toBe(false)
    })
  })

  describe("createClearAuth()", () => {
    // Valid UUID for testing
    const TEST_APP_ID = '550e8400-e29b-41d4-a716-446655440000'
    const TEST_API_KEY = 'test-api-key-123'

    it("should throw error if secret is missing", () => {
      expect(() =>
        // @ts-expect-error Testing missing secret
        createClearAuth({
          database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
          baseUrl: 'https://example.com',
        })
      ).toThrow(ClearAuthConfigError)
    })

    it("should throw error if baseUrl is missing", () => {
      expect(() =>
        // @ts-expect-error Testing missing baseUrl
        createClearAuth({
          secret: 'test-secret',
          database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
        })
      ).toThrow(ClearAuthConfigError)
    })

    it("should throw error for default secret in production", () => {
      expect(() =>
        createClearAuth({
          secret: 'better-auth-secret-123456789',
          database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
          baseUrl: 'https://example.com',
          isProduction: true,
        })
      ).toThrow(ClearAuthConfigError)
    })

    it("should accept default secret in development", () => {
      // Should not throw
      const config = createClearAuth({
        secret: 'dev-secret-key',
        database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
        baseUrl: 'https://example.com',
        isProduction: false,
      })

      expect(config).toBeDefined()
      expect(config.secret).toBe('dev-secret-key')
      expect(config.baseUrl).toBe('https://example.com')
    })

    it("should create config with simplified database format", () => {
      const config = createClearAuth({
        secret: 'test-secret',
        database: {
          appId: TEST_APP_ID,
          apiKey: TEST_API_KEY,
        },
        baseUrl: 'https://example.com',
      })

      expect(config).toBeDefined()
      expect(config.database).toBeDefined()
      expect(config.secret).toBe('test-secret')
      expect(config.baseUrl).toBe('https://example.com')
    })

    it("should use default session config if not provided", () => {
      const config = createClearAuth({
        secret: 'test-secret',
        database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
        baseUrl: 'https://example.com',
      })

      expect(config.session).toEqual(defaultSessionConfig)
    })

    it("should accept custom session config", () => {
      const config = createClearAuth({
        secret: 'test-secret',
        database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
        baseUrl: 'https://example.com',
        session: longSessionConfig,
      })

      expect(config.session).toEqual(longSessionConfig)
    })

    it("should accept OAuth provider configuration", () => {
      const config = createClearAuth({
        secret: 'test-secret',
        database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
        baseUrl: 'https://example.com',
        oauth: {
          github: {
            clientId: 'github-id',
            clientSecret: 'github-secret',
            redirectUri: 'https://example.com/auth/callback/github',
          },
        },
      })

      expect(config.oauth?.github).toBeDefined()
      expect(config.oauth?.github?.clientId).toBe('github-id')
    })

    it("should accept password validation config", () => {
      const config = createClearAuth({
        secret: 'test-secret',
        database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
        baseUrl: 'https://example.com',
        password: {
          minLength: 12,
        },
      })

      expect(config.password?.minLength).toBe(12)
    })

    it("should default to minLength 8 if not provided", () => {
      const config = createClearAuth({
        secret: 'test-secret',
        database: { appId: TEST_APP_ID, apiKey: TEST_API_KEY },
        baseUrl: 'https://example.com',
      })

      expect(config.password?.minLength).toBe(8)
    })
  })
})
