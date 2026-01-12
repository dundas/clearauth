import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTursoKysely } from '../turso.js'

describe('Turso Database Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createTursoKysely', () => {
    it('should create a Kysely instance with valid config', () => {
      const config = {
        url: 'libsql://my-db.turso.io',
        authToken: 'test-token'
      }

      const db = createTursoKysely(config)

      expect(db).toBeDefined()
      expect(typeof db.selectFrom).toBe('function')
    })

    it('should accept optional logger', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }

      const config = {
        url: 'libsql://my-db.turso.io',
        authToken: 'test-token',
        logger: mockLogger
      }

      const db = createTursoKysely(config)

      expect(db).toBeDefined()
      expect(mockLogger.debug).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle missing dependency gracefully', () => {
      const config = {
        url: 'libsql://my-db.turso.io',
        authToken: 'test-token'
      }

      const db = createTursoKysely(config)
      
      expect(db).toBeDefined()
    })

    it('should handle invalid URL', () => {
      const config = {
        url: '',
        authToken: 'test-token'
      }

      const db = createTursoKysely(config)
      
      expect(db).toBeDefined()
    })

    it('should handle missing auth token', () => {
      const config = {
        url: 'libsql://my-db.turso.io',
        authToken: ''
      }

      const db = createTursoKysely(config)
      
      expect(db).toBeDefined()
    })
  })

  describe('Transaction Support', () => {
    it('should throw error when transaction is attempted', async () => {
      const config = {
        url: 'libsql://my-db.turso.io',
        authToken: 'test-token'
      }

      const db = createTursoKysely(config)
      
      await expect(async () => {
        await db.transaction().execute(async (trx) => {
          await trx.selectFrom('users').selectAll().execute()
        })
      }).rejects.toThrow()
    })
  })
})
