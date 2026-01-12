import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseKysely } from '../supabase.js'

describe('Supabase Database Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSupabaseKysely', () => {
    it('should create a Kysely instance with valid config', () => {
      const config = {
        connectionString: 'postgresql://postgres.project:pass@aws-0-region.pooler.supabase.com:6543/postgres'
      }

      const db = createSupabaseKysely(config)

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
        connectionString: 'postgresql://postgres.project:pass@aws-0-region.pooler.supabase.com:6543/postgres',
        logger: mockLogger
      }

      const db = createSupabaseKysely(config)

      expect(db).toBeDefined()
      expect(mockLogger.debug).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle missing dependency gracefully', () => {
      const config = {
        connectionString: 'postgresql://postgres.project:pass@aws-0-region.pooler.supabase.com:6543/postgres'
      }

      const db = createSupabaseKysely(config)
      
      expect(db).toBeDefined()
    })

    it('should handle invalid connection string', () => {
      const config = {
        connectionString: ''
      }

      const db = createSupabaseKysely(config)
      
      expect(db).toBeDefined()
    })
  })

  describe('Transaction Support', () => {
    it('should throw error when transaction is attempted', async () => {
      const config = {
        connectionString: 'postgresql://postgres.project:pass@aws-0-region.pooler.supabase.com:6543/postgres'
      }

      const db = createSupabaseKysely(config)
      
      await expect(async () => {
        await db.transaction().execute(async (trx) => {
          await trx.selectFrom('users').selectAll().execute()
        })
      }).rejects.toThrow()
    })
  })
})
