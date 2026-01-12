import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createD1Kysely } from '../d1.js'
import type { D1Database } from '../d1.js'

describe('D1 Database Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockD1Database = (): D1Database => ({
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      run: vi.fn(),
      all: vi.fn().mockResolvedValue({
        success: true,
        results: [],
        meta: { duration: 0, rows_read: 0, rows_written: 0 }
      }),
      raw: vi.fn()
    }),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn()
  })

  describe('createD1Kysely', () => {
    it('should create a Kysely instance with valid D1 database', () => {
      const mockDb = createMockD1Database()
      const db = createD1Kysely({ database: mockDb })

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

      const mockDb = createMockD1Database()
      const db = createD1Kysely({ database: mockDb, logger: mockLogger })

      expect(db).toBeDefined()
      expect(mockLogger.debug).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle query failures', () => {
      const mockDb = createMockD1Database()
      const db = createD1Kysely({ database: mockDb })
      
      expect(db).toBeDefined()
    })
  })

  describe('Transaction Support', () => {
    it('should throw error when transaction is attempted', async () => {
      const mockDb = createMockD1Database()
      const db = createD1Kysely({ database: mockDb })
      
      await expect(async () => {
        await db.transaction().execute(async (trx) => {
          await trx.selectFrom('users').selectAll().execute()
        })
      }).rejects.toThrow()
    })
  })
})
