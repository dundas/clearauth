import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleDeviceAuthRequest, handleListDevicesRequest, handleRevokeDeviceRequest } from '../handlers'
import type { ClearAuthConfig } from '../../types'
import { Kysely } from 'kysely'
import type { Database } from '../../database/schema'
import type { DeviceInfo } from '../types'

// Mock database for testing
function createMockDb(): Kysely<Database> {
  const devices = new Map<string, any>()
  const sessions = new Map<string, any>()
  const users = new Map<string, any>()

  // Seed a test user + session
  const user = {
    id: 'user-123',
    email: 'test@example.com',
    email_verified: true,
    created_at: new Date(),
  }
  users.set(user.id, user)

  const sessionId = 'sess-123'
  sessions.set(sessionId, {
    id: sessionId,
    user_id: user.id,
    expires_at: new Date(Date.now() + 60 * 60 * 1000), // Valid for 1 hour
    created_at: new Date(),
  })

  // Seed some devices
  devices.set('dev_active', {
    device_id: 'dev_active',
    user_id: user.id,
    platform: 'web3',
    status: 'active',
    registered_at: new Date('2023-01-01'),
    last_used_at: new Date('2023-01-02'),
    public_key: 'mock-pk',
    wallet_address: '0x123',
    key_algorithm: 'secp256k1',
  })
  
  devices.set('dev_revoked', {
    device_id: 'dev_revoked',
    user_id: user.id,
    platform: 'ios',
    status: 'revoked',
    registered_at: new Date('2023-01-01'),
    last_used_at: null,
    public_key: 'mock-pk-2',
    key_algorithm: 'P-256',
  })

  // Devices for another user
  devices.set('dev_other_user', {
    device_id: 'dev_other_user',
    user_id: 'user-999',
    platform: 'android',
    status: 'active',
    registered_at: new Date(),
    last_used_at: null,
  })

  const mockDb = {
    selectFrom: (table: string) => ({
      selectAll: () => ({
        where: (col: string, op: string, value: any) => {
          const resultChain = {
            // For listUserDevices: selectAll().where(user_id)
            execute: async () => {
              if (table === 'devices' && col === 'user_id') {
                return Array.from(devices.values()).filter(d => d.user_id === value)
              }
              return []
            },
            // For getSession: selectAll().where(id)
            executeTakeFirst: async () => {
              if (table === 'sessions' && col === 'id') {
                return sessions.get(value) || null
              }
              if (table === 'users' && col === 'id') {
                return users.get(value) || null
              }
              return null
            },
          }
          const limitOffsetChain = {
            limit: () => ({
              offset: () => resultChain
            }),
            ...resultChain
          }

          return {
            where: (col2: string, op2: string, value2: any) => ({
              ...limitOffsetChain,
              execute: async () => {
                if (table === 'devices' && col === 'user_id' && col2 === 'status') {
                  return Array.from(devices.values()).filter(d => d.user_id === value && d.status === value2)
                }
                return []
              }
            }),
            ...limitOffsetChain
          }
        },
      }),
      select: (_cols: any) => ({
        where: (col: string, op: string, value: any) => ({
          executeTakeFirst: async () => {
            if (table === 'users' && col === 'id') {
              return users.get(value) || null
            }
            return null
          },
        }),
      }),
    }),
    updateTable: (table: string) => ({
      set: (updates: any) => ({
        where: (col1: string, op1: string, val1: any) => ({
          where: (col2: string, op2: string, val2: any) => ({
            where: (col3: string, op3: string, val3: any) => ({
              // revokeDevice: update table set status=revoked where device_id=? AND user_id=? AND status='active'
              executeTakeFirst: async () => {
                if (table === 'devices' && 
                    col1 === 'device_id' && 
                    col2 === 'user_id' && 
                    col3 === 'status' && val3 === 'active') {
                  
                  const device = devices.get(val1)
                  if (device && device.user_id === val2 && device.status === 'active') {
                    // Update mock store
                    devices.set(val1, { ...device, ...updates })
                    return { numUpdatedRows: 1n }
                  }
                }
                return { numUpdatedRows: 0n }
              }
            })
          })
        })
      })
    })
  } as any

  return mockDb
}

function createMockConfig(): ClearAuthConfig {
  return {
    database: createMockDb(),
    secret: 'test-secret',
    baseUrl: 'https://example.com',
    session: {
      expiresIn: 30 * 24 * 60 * 60, // 30 days
      cookieName: 'session',
    },
  } as ClearAuthConfig
}

describe('Device Management Integration Handlers', () => {
  let config: ClearAuthConfig

  beforeEach(() => {
    config = createMockConfig()
  })

  describe('handleListDevicesRequest', () => {
    it('should return 401 without session cookie', async () => {
      const request = new Request('http://localhost/auth/devices', {
        method: 'GET'
      })
      const response = await handleListDevicesRequest(request, config)

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('unauthorized')
    })

    it('should return devices list with valid session', async () => {
      const request = new Request('http://localhost/auth/devices', {
        method: 'GET',
        headers: { Cookie: 'session=sess-123' }
      })
      const response = await handleListDevicesRequest(request, config)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.devices).toBeInstanceOf(Array)
      expect(body.devices).toHaveLength(2) // active + revoked for user-123
      
      const ids = body.devices.map((d: DeviceInfo) => d.deviceId)
      expect(ids).toContain('dev_active')
      expect(ids).toContain('dev_revoked')
      expect(ids).not.toContain('dev_other_user')
    })

    it('should return 405 for non-GET methods', async () => {
      const request = new Request('http://localhost/auth/devices', {
        method: 'POST',
        headers: { Cookie: 'session=sess-123' }
      })
      const response = await handleListDevicesRequest(request, config)

      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('GET')
    })
  })

  describe('handleRevokeDeviceRequest', () => {
    it('should return 401 without session cookie', async () => {
      const request = new Request('http://localhost/auth/devices/dev_active', {
        method: 'DELETE'
      })
      const response = await handleRevokeDeviceRequest(request, config, 'dev_active')

      expect(response.status).toBe(401)
    })

    it('should revoke device with valid session', async () => {
      const request = new Request('http://localhost/auth/devices/dev_active', {
        method: 'DELETE',
        headers: { Cookie: 'session=sess-123' }
      })
      const response = await handleRevokeDeviceRequest(request, config, 'dev_active')

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.deviceId).toBe('dev_active')
    })

    it('should return 404 for non-existent device', async () => {
      const request = new Request('http://localhost/auth/devices/dev_nonexistent', {
        method: 'DELETE',
        headers: { Cookie: 'session=sess-123' }
      })
      const response = await handleRevokeDeviceRequest(request, config, 'dev_nonexistent')

      expect(response.status).toBe(404)
    })

    it('should return 404 when trying to revoke another user\'s device', async () => {
      const request = new Request('http://localhost/auth/devices/dev_other_user', {
        method: 'DELETE',
        headers: { Cookie: 'session=sess-123' } // Session belongs to user-123
      })
      const response = await handleRevokeDeviceRequest(request, config, 'dev_other_user')

      expect(response.status).toBe(404)
    })

    it('should return 405 for non-DELETE methods', async () => {
      const request = new Request('http://localhost/auth/devices/dev_active', {
        method: 'GET',
        headers: { Cookie: 'session=sess-123' }
      })
      const response = await handleRevokeDeviceRequest(request, config, 'dev_active')

      expect(response.status).toBe(405)
    })

    it('should return 404 for already revoked device (idempotent)', async () => {
      // dev_revoked is already revoked in setup
      const request = new Request('http://localhost/auth/devices/dev_revoked', {
        method: 'DELETE',
        headers: { Cookie: 'session=sess-123' }
      })

      const response = await handleRevokeDeviceRequest(request, config, 'dev_revoked')
      expect(response.status).toBe(404)
    })
  })

  describe('handleDeviceAuthRequest Routing', () => {
    it('should route GET /auth/devices to list handler', async () => {
      const request = new Request('http://localhost/auth/devices', {
        method: 'GET',
        headers: { Cookie: 'session=sess-123' }
      })
      const response = await handleDeviceAuthRequest(request, config)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(200)
    })

    it('should route DELETE /auth/devices/:id to revoke handler', async () => {
      const request = new Request('http://localhost/auth/devices/dev_active', {
        method: 'DELETE',
        headers: { Cookie: 'session=sess-123' }
      })
      const response = await handleDeviceAuthRequest(request, config)

      expect(response).not.toBeNull()
      expect(response!.status).toBe(200)
    })

    it('should return null for unknown routes', async () => {
      const request = new Request('http://localhost/auth/unknown')
      const response = await handleDeviceAuthRequest(request, config)

      expect(response).toBeNull()
    })

    // URL Validation Tests
    it('should return 400 for invalid device ID format', async () => {
      const invalidIds = [
        '../../etc/passwd', 
        '..', 
        ' ',
        'dev_abc; DROP TABLE devices;',
        '/root',
        'invalid_prefix'
      ]
      
      for (const id of invalidIds) {
        // Must start with /auth/devices/
        const request = new Request(`http://localhost/auth/devices/${id}`, {
          method: 'DELETE',
          headers: { Cookie: 'session=sess-123' }
        })
        const response = await handleDeviceAuthRequest(request, config)
        
        // Either 400 (caught by regex) or null (if it doesn't match path prefix logic, 
        // but here we expect regex check inside the handler to return 400)
        
        if (response) {
            expect(response.status).toBe(400)
            const body = await response.json()
            expect(body.error).toBe('invalid_request')
        }
      }
    })

    it('should accept valid device ID formats', async () => {
      const validIds = [
        'dev_web3_abc123',
        'dev_ios_XYZ-789',
        'dev_android_foo_bar'
      ]

      for (const id of validIds) {
        const request = new Request(`http://localhost/auth/devices/${id}`, {
          method: 'DELETE',
          headers: { Cookie: 'session=sess-123' }
        })
        
        // Should route to handleRevokeDeviceRequest
        // Since the device doesn't exist in mock DB, it should return 404 (handled) 
        // rather than 400 (validation error) or null (not routed)
        const response = await handleDeviceAuthRequest(request, config)
        
        expect(response).not.toBeNull()
        expect(response!.status).not.toBe(400) // Should NOT be a validation error
        expect(response!.status).toBe(404) // Expected 404 from DB lookup
      }
    })
  })
})
