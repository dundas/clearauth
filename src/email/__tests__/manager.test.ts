import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EmailManager } from '../manager.js'
import type { ClearAuthConfig, EmailProvider } from '../../types.js'
import { Kysely } from 'kysely'

describe('EmailManager', () => {
  let mockDb: Kysely<any>
  let baseConfig: ClearAuthConfig

  beforeEach(() => {
    mockDb = {} as Kysely<any>
    baseConfig = {
      database: mockDb,
      secret: 'test-secret',
      baseUrl: 'https://example.com'
    }
  })

  describe('constructor validation', () => {
    it('should throw error when provider is configured but baseUrl is missing', () => {
      const mockProvider: EmailProvider = {
        name: 'test',
        send: vi.fn()
      }

      const configWithoutBaseUrl = {
        database: mockDb,
        secret: 'test-secret',
        email: {
          provider: mockProvider
        }
      } as ClearAuthConfig

      expect(() => new EmailManager(configWithoutBaseUrl)).toThrow(
        '[ClearAuth] config.baseUrl is required when using email providers'
      )
    })

    it('should not throw when provider is configured and baseUrl is present', () => {
      const mockProvider: EmailProvider = {
        name: 'test',
        send: vi.fn()
      }

      const config = {
        ...baseConfig,
        email: {
          provider: mockProvider
        }
      }

      expect(() => new EmailManager(config)).not.toThrow()
    })

    it('should not throw when no provider is configured (callback mode)', () => {
      const config = {
        ...baseConfig,
        email: {
          sendVerificationEmail: vi.fn()
        }
      }

      expect(() => new EmailManager(config)).not.toThrow()
    })
  })

  describe('sendVerificationEmail', () => {
    it('should prioritize manual callback over provider', async () => {
      const mockCallback = vi.fn()
      const mockProvider: EmailProvider = {
        name: 'test',
        send: vi.fn()
      }

      const config = {
        ...baseConfig,
        email: {
          sendVerificationEmail: mockCallback,
          provider: mockProvider
        }
      }

      const manager = new EmailManager(config)
      await manager.sendVerificationEmail('test@example.com', 'token123', '/verify')

      expect(mockCallback).toHaveBeenCalledWith('test@example.com', 'token123', '/verify')
      expect(mockProvider.send).not.toHaveBeenCalled()
    })

    it('should use provider when callback is not provided', async () => {
      const mockProvider: EmailProvider = {
        name: 'test',
        send: vi.fn()
      }

      const config = {
        ...baseConfig,
        email: {
          provider: mockProvider
        }
      }

      const manager = new EmailManager(config)
      await manager.sendVerificationEmail('test@example.com', 'token123', '/verify')

      expect(mockProvider.send).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('Verify your email'),
        expect.stringContaining('https://example.com/verify'),
        expect.stringContaining('https://example.com/verify')
      )
    })

    it('should convert relative URL to absolute when using provider', async () => {
      const mockProvider: EmailProvider = {
        name: 'test',
        send: vi.fn()
      }

      const config = {
        ...baseConfig,
        baseUrl: 'https://myapp.com',
        email: {
          provider: mockProvider
        }
      }

      const manager = new EmailManager(config)
      await manager.sendVerificationEmail('test@example.com', 'token123', '/auth/verify?token=abc')

      const [, , html, text] = (mockProvider.send as any).mock.calls[0]
      expect(html).toContain('https://myapp.com/auth/verify?token=abc')
      expect(text).toContain('https://myapp.com/auth/verify?token=abc')
    })

    it('should log warning when neither callback nor provider is configured', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const config = { ...baseConfig }
      const manager = new EmailManager(config)
      await manager.sendVerificationEmail('test@example.com', 'token123', '/verify')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No email sending method configured for verification email')
      )

      consoleWarnSpy.mockRestore()
    })
  })

  describe('sendPasswordResetEmail', () => {
    it('should prioritize manual callback over provider', async () => {
      const mockCallback = vi.fn()
      const mockProvider: EmailProvider = {
        name: 'test',
        send: vi.fn()
      }

      const config = {
        ...baseConfig,
        email: {
          sendPasswordResetEmail: mockCallback,
          provider: mockProvider
        }
      }

      const manager = new EmailManager(config)
      await manager.sendPasswordResetEmail('test@example.com', 'token123', '/reset')

      expect(mockCallback).toHaveBeenCalledWith('test@example.com', 'token123', '/reset')
      expect(mockProvider.send).not.toHaveBeenCalled()
    })

    it('should use provider when callback is not provided', async () => {
      const mockProvider: EmailProvider = {
        name: 'test',
        send: vi.fn()
      }

      const config = {
        ...baseConfig,
        email: {
          provider: mockProvider
        }
      }

      const manager = new EmailManager(config)
      await manager.sendPasswordResetEmail('test@example.com', 'token123', '/reset')

      expect(mockProvider.send).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('Reset your password'),
        expect.stringContaining('https://example.com/reset'),
        expect.stringContaining('https://example.com/reset')
      )
    })

    it('should log warning when neither callback nor provider is configured', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const config = { ...baseConfig }
      const manager = new EmailManager(config)
      await manager.sendPasswordResetEmail('test@example.com', 'token123', '/reset')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No email sending method configured for password reset email')
      )

      consoleWarnSpy.mockRestore()
    })
  })

  describe('sendMagicLink', () => {
    it('should prioritize manual callback over provider', async () => {
      const mockCallback = vi.fn()
      const mockProvider: EmailProvider = {
        name: 'test',
        send: vi.fn()
      }

      const config = {
        ...baseConfig,
        email: {
          sendMagicLink: mockCallback,
          provider: mockProvider
        }
      }

      const manager = new EmailManager(config)
      await manager.sendMagicLink('test@example.com', 'token123', '/magic')

      expect(mockCallback).toHaveBeenCalledWith('test@example.com', 'token123', '/magic')
      expect(mockProvider.send).not.toHaveBeenCalled()
    })

    it('should use provider when callback is not provided', async () => {
      const mockProvider: EmailProvider = {
        name: 'test',
        send: vi.fn()
      }

      const config = {
        ...baseConfig,
        email: {
          provider: mockProvider
        }
      }

      const manager = new EmailManager(config)
      await manager.sendMagicLink('test@example.com', 'token123', '/magic')

      expect(mockProvider.send).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('Sign in to'),
        expect.stringContaining('https://example.com/magic'),
        expect.stringContaining('https://example.com/magic')
      )
    })

    it('should log warning when neither callback nor provider is configured', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const config = { ...baseConfig }
      const manager = new EmailManager(config)
      await manager.sendMagicLink('test@example.com', 'token123', '/magic')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No email sending method configured for magic link email')
      )

      consoleWarnSpy.mockRestore()
    })
  })
})
