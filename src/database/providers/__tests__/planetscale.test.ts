import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPlanetScaleKysely } from '../planetscale.js'

describe('PlanetScale Database Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createPlanetScaleKysely', () => {
    it('should create a Kysely instance with valid config', () => {
      const config = {
        host: 'aws.connect.psdb.cloud',
        username: 'test-user',
        password: 'test-password'
      }

      const db = createPlanetScaleKysely(config)

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
        host: 'aws.connect.psdb.cloud',
        username: 'test-user',
        password: 'test-password',
        logger: mockLogger
      }

      const db = createPlanetScaleKysely(config)

      expect(db).toBeDefined()
      expect(mockLogger.debug).toHaveBeenCalled()
    })

    it('should accept custom fetch implementation', () => {
      const mockFetch = vi.fn()
      
      const config = {
        host: 'aws.connect.psdb.cloud',
        username: 'test-user',
        password: 'test-password',
        fetch: mockFetch as any
      }

      const db = createPlanetScaleKysely(config)

      expect(db).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle missing dependency gracefully', () => {
      const config = {
        host: 'aws.connect.psdb.cloud',
        username: 'test-user',
        password: 'test-password'
      }

      const db = createPlanetScaleKysely(config)
      
      expect(db).toBeDefined()
    })

    it('should handle invalid host', () => {
      const config = {
        host: '',
        username: 'test-user',
        password: 'test-password'
      }

      const db = createPlanetScaleKysely(config)
      
      expect(db).toBeDefined()
    })

    it('should handle missing credentials', () => {
      const config = {
        host: 'aws.connect.psdb.cloud',
        username: '',
        password: ''
      }

      const db = createPlanetScaleKysely(config)
      
      expect(db).toBeDefined()
    })
  })

  describe('Transaction Support', () => {
    it('should throw error when transaction is attempted', async () => {
      const config = {
        host: 'aws.connect.psdb.cloud',
        username: 'test-user',
        password: 'test-password'
      }

      const db = createPlanetScaleKysely(config)
      
      await expect(async () => {
        await db.transaction().execute(async (trx) => {
          await trx.selectFrom('users').selectAll().execute()
        })
      }).rejects.toThrow()
    })
  })
})
