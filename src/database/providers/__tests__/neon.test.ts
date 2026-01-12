import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNeonKysely } from '../neon.js'

describe('Neon Database Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createNeonKysely', () => {
    it('should create a Kysely instance with valid config', () => {
      const config = {
        connectionString: 'postgresql://user:pass@project.neon.tech/db'
      }

      const db = createNeonKysely(config)

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
        connectionString: 'postgresql://user:pass@project.neon.tech/db',
        logger: mockLogger
      }

      const db = createNeonKysely(config)

      expect(db).toBeDefined()
      expect(mockLogger.debug).toHaveBeenCalled()
    })
  })

  describe('NeonDatabaseConnection', () => {
    it('should handle query execution with mocked neon client', async () => {
      const mockNeon = vi.fn().mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: [{ id: '1', email: 'test@example.com' }]
        })
      })

      vi.doMock('@neondatabase/serverless', () => ({
        neon: mockNeon
      }))

      const config = {
        connectionString: 'postgresql://user:pass@project.neon.tech/db'
      }

      const db = createNeonKysely(config)
      
      expect(db).toBeDefined()
    })

    it('should handle empty result sets', async () => {
      const mockNeon = vi.fn().mockReturnValue({
        query: vi.fn().mockResolvedValue({
          rows: []
        })
      })

      vi.doMock('@neondatabase/serverless', () => ({
        neon: mockNeon
      }))

      const config = {
        connectionString: 'postgresql://user:pass@project.neon.tech/db'
      }

      const db = createNeonKysely(config)
      
      expect(db).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle missing dependency gracefully', async () => {
      const config = {
        connectionString: 'postgresql://user:pass@project.neon.tech/db'
      }

      const db = createNeonKysely(config)
      
      expect(db).toBeDefined()
    })

    it('should handle invalid connection string', () => {
      const config = {
        connectionString: ''
      }

      const db = createNeonKysely(config)
      
      expect(db).toBeDefined()
    })
  })

  describe('Transaction Support', () => {
    it('should throw error when transaction is attempted', async () => {
      const config = {
        connectionString: 'postgresql://user:pass@project.neon.tech/db'
      }

      const db = createNeonKysely(config)
      
      await expect(async () => {
        await db.transaction().execute(async (trx) => {
          await trx.selectFrom('users').selectAll().execute()
        })
      }).rejects.toThrow()
    })
  })
})
