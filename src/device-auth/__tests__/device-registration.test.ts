/**
 * Device Registration and Management Tests
 *
 * Tests for device listing, revocation, and usage tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Kysely } from 'kysely'
import { Database } from '../../database/schema.js'
import {
  listUserDevices,
  listActiveDevices,
  getDevice,
  revokeDevice,
  updateDeviceLastUsed,
} from '../device-registration.js'

// Mock database for testing
function createMockDb(): Kysely<Database> {
  const devices: any[] = []

  return {
    selectFrom: (table: string) => ({
      selectAll: () => ({
        where: (col: string, op: string, val: any) => {
          const filtered = devices.filter(d => d[col] === val)
          const resultChain = {
            execute: async () => filtered,
            executeTakeFirst: async () => filtered[0] || null,
          }
          const limitOffsetChain = {
            limit: () => ({
              offset: () => resultChain
            }),
            ...resultChain
          }
          
          return {
            where: (col2: string, op2: string, val2: any) => ({
              execute: async () => filtered.filter(d => d[col2] === val2),
              executeTakeFirst: async () => filtered.find(d => d[col2] === val2) || null,
              limit: () => ({
                offset: () => ({
                  execute: async () => filtered.filter(d => d[col2] === val2),
                })
              }),
              orderBy: () => ({
                orderBy: () => ({
                  execute: async () => filtered.filter(d => d[col2] === val2),
                }),
              }),
            }),
            orderBy: () => ({
              orderBy: () => ({
                execute: async () => filtered,
              }),
            }),
            ...limitOffsetChain
          }
        },
        executeTakeFirst: async () => devices[0] || null,
      }),
    }),
    updateTable: (table: string) => ({
      set: (values: any) => ({
        where: (col: string, op: string, val: any) => ({
          where: (col2: string, op2: string, val2: any) => ({
            where: (col3: string, op3: string, val3: any) => ({
              executeTakeFirst: async () => {
                const device = devices.find(d =>
                  d[col] === val && d[col2] === val2 && d[col3] === val3
                )
                if (device) {
                  Object.assign(device, values)
                  return { numUpdatedRows: 1n }
                }
                return { numUpdatedRows: 0n }
              },
            }),
            executeTakeFirst: async () => {
              const device = devices.find(d => d[col] === val && d[col2] === val2)
              if (device) {
                Object.assign(device, values)
                return { numUpdatedRows: 1n }
              }
              return { numUpdatedRows: 0n }
            },
          }),
          executeTakeFirst: async () => {
            const device = devices.find(d => d[col] === val)
            if (device) {
              Object.assign(device, values)
              return { numUpdatedRows: 1n }
            }
            return { numUpdatedRows: 0n }
          },
        }),
      }),
    }),
    _devices: devices, // For test setup
  } as any
}

describe('listUserDevices', () => {
  it('should list all devices for a user', async () => {
    const db = createMockDb()
    db._devices.push(
      {
        id: '1',
        device_id: 'dev_web3_abc',
        user_id: 'user-123',
        platform: 'web3',
        public_key: '0x1234',
        wallet_address: '0xabcd',
        key_algorithm: 'secp256k1',
        status: 'active',
        registered_at: new Date('2024-01-01'),
        last_used_at: new Date('2024-01-15'),
        created_at: new Date('2024-01-01'),
      },
      {
        id: '2',
        device_id: 'dev_ios_xyz',
        user_id: 'user-123',
        platform: 'ios',
        public_key: 'public-key-data',
        wallet_address: null,
        key_algorithm: 'P-256',
        status: 'active',
        registered_at: new Date('2024-01-02'),
        last_used_at: null,
        created_at: new Date('2024-01-02'),
      }
    )

    const devices = await listUserDevices(db, 'user-123')

    expect(devices).toHaveLength(2)
    expect(devices[0].deviceId).toBe('dev_web3_abc')
    expect(devices[0].platform).toBe('web3')
    expect(devices[1].deviceId).toBe('dev_ios_xyz')
  })

  it('should return empty array for user with no devices', async () => {
    const db = createMockDb()

    const devices = await listUserDevices(db, 'user-999')

    expect(devices).toHaveLength(0)
  })

  it('should include both active and revoked devices', async () => {
    const db = createMockDb()
    db._devices.push(
      {
        id: '1',
        device_id: 'dev_active',
        user_id: 'user-123',
        platform: 'web3',
        public_key: '0x1234',
        wallet_address: '0xabcd',
        key_algorithm: 'secp256k1',
        status: 'active',
        registered_at: new Date('2024-01-01'),
        last_used_at: new Date('2024-01-15'),
        created_at: new Date('2024-01-01'),
      },
      {
        id: '2',
        device_id: 'dev_revoked',
        user_id: 'user-123',
        platform: 'ios',
        public_key: 'key',
        wallet_address: null,
        key_algorithm: 'P-256',
        status: 'revoked',
        registered_at: new Date('2024-01-02'),
        last_used_at: null,
        created_at: new Date('2024-01-02'),
      }
    )

    const devices = await listUserDevices(db, 'user-123')

    expect(devices).toHaveLength(2)
    expect(devices.find(d => d.status === 'active')).toBeDefined()
    expect(devices.find(d => d.status === 'revoked')).toBeDefined()
  })
})

describe('listActiveDevices', () => {
  it('should list only active devices', async () => {
    const db = createMockDb()
    db._devices.push(
      {
        id: '1',
        device_id: 'dev_active_1',
        user_id: 'user-123',
        platform: 'web3',
        public_key: '0x1234',
        wallet_address: '0xabcd',
        key_algorithm: 'secp256k1',
        status: 'active',
        registered_at: new Date('2024-01-01'),
        last_used_at: new Date('2024-01-15'),
        created_at: new Date('2024-01-01'),
      },
      {
        id: '2',
        device_id: 'dev_revoked_1',
        user_id: 'user-123',
        platform: 'ios',
        public_key: 'key',
        wallet_address: null,
        key_algorithm: 'P-256',
        status: 'revoked',
        registered_at: new Date('2024-01-02'),
        last_used_at: null,
        created_at: new Date('2024-01-02'),
      }
    )

    const devices = await listActiveDevices(db, 'user-123')

    expect(devices).toHaveLength(1)
    expect(devices[0].deviceId).toBe('dev_active_1')
    expect(devices[0].status).toBe('active')
  })

  it('should return empty array if all devices are revoked', async () => {
    const db = createMockDb()
    db._devices.push({
      id: '1',
      device_id: 'dev_revoked',
      user_id: 'user-123',
      platform: 'web3',
      public_key: '0x1234',
      wallet_address: '0xabcd',
      key_algorithm: 'secp256k1',
      status: 'revoked',
      registered_at: new Date('2024-01-01'),
      last_used_at: null,
      created_at: new Date('2024-01-01'),
    })

    const devices = await listActiveDevices(db, 'user-123')

    expect(devices).toHaveLength(0)
  })
})

describe('getDevice', () => {
  it('should get a specific device by ID', async () => {
    const db = createMockDb()
    db._devices.push({
      id: '1',
      device_id: 'dev_web3_abc',
      user_id: 'user-123',
      platform: 'web3',
      public_key: '0x1234',
      wallet_address: '0xabcd',
      key_algorithm: 'secp256k1',
      status: 'active',
      registered_at: new Date('2024-01-01'),
      last_used_at: new Date('2024-01-15'),
      created_at: new Date('2024-01-01'),
    })

    const device = await getDevice(db, 'dev_web3_abc', 'user-123')

    expect(device).not.toBeNull()
    expect(device?.deviceId).toBe('dev_web3_abc')
    expect(device?.platform).toBe('web3')
  })

  it('should return null if device not found', async () => {
    const db = createMockDb()

    const device = await getDevice(db, 'dev_nonexistent', 'user-123')

    expect(device).toBeNull()
  })

  it('should return null if device belongs to different user', async () => {
    const db = createMockDb()
    db._devices.push({
      id: '1',
      device_id: 'dev_web3_abc',
      user_id: 'user-123',
      platform: 'web3',
      public_key: '0x1234',
      wallet_address: '0xabcd',
      key_algorithm: 'secp256k1',
      status: 'active',
      registered_at: new Date('2024-01-01'),
      last_used_at: new Date('2024-01-15'),
      created_at: new Date('2024-01-01'),
    })

    const device = await getDevice(db, 'dev_web3_abc', 'user-999')

    expect(device).toBeNull()
  })
})

describe('revokeDevice', () => {
  it('should revoke an active device', async () => {
    const db = createMockDb()
    db._devices.push({
      id: '1',
      device_id: 'dev_web3_abc',
      user_id: 'user-123',
      platform: 'web3',
      public_key: '0x1234',
      wallet_address: '0xabcd',
      key_algorithm: 'secp256k1',
      status: 'active',
      registered_at: new Date('2024-01-01'),
      last_used_at: new Date('2024-01-15'),
      created_at: new Date('2024-01-01'),
    })

    const result = await revokeDevice(db, 'dev_web3_abc', 'user-123')

    expect(result).toBe(true)
    expect(db._devices[0].status).toBe('revoked')
  })

  it('should return false if device not found', async () => {
    const db = createMockDb()

    const result = await revokeDevice(db, 'dev_nonexistent', 'user-123')

    expect(result).toBe(false)
  })

  it('should return false if device already revoked', async () => {
    const db = createMockDb()
    db._devices.push({
      id: '1',
      device_id: 'dev_web3_abc',
      user_id: 'user-123',
      platform: 'web3',
      public_key: '0x1234',
      wallet_address: '0xabcd',
      key_algorithm: 'secp256k1',
      status: 'revoked',
      registered_at: new Date('2024-01-01'),
      last_used_at: new Date('2024-01-15'),
      created_at: new Date('2024-01-01'),
    })

    const result = await revokeDevice(db, 'dev_web3_abc', 'user-123')

    expect(result).toBe(false)
  })

  it('should return false if device belongs to different user', async () => {
    const db = createMockDb()
    db._devices.push({
      id: '1',
      device_id: 'dev_web3_abc',
      user_id: 'user-123',
      platform: 'web3',
      public_key: '0x1234',
      wallet_address: '0xabcd',
      key_algorithm: 'secp256k1',
      status: 'active',
      registered_at: new Date('2024-01-01'),
      last_used_at: new Date('2024-01-15'),
      created_at: new Date('2024-01-01'),
    })

    const result = await revokeDevice(db, 'dev_web3_abc', 'user-999')

    expect(result).toBe(false)
    expect(db._devices[0].status).toBe('active') // Should not be revoked
  })
})

describe('updateDeviceLastUsed', () => {
  it('should update last_used_at timestamp', async () => {
    const db = createMockDb()
    const oldDate = new Date('2024-01-01')
    db._devices.push({
      id: '1',
      device_id: 'dev_web3_abc',
      user_id: 'user-123',
      platform: 'web3',
      public_key: '0x1234',
      wallet_address: '0xabcd',
      key_algorithm: 'secp256k1',
      status: 'active',
      registered_at: oldDate,
      last_used_at: oldDate,
      created_at: oldDate,
    })

    const result = await updateDeviceLastUsed(db, 'dev_web3_abc')

    expect(result).toBe(true)
    expect(db._devices[0].last_used_at).not.toEqual(oldDate)
    expect(db._devices[0].last_used_at).toBeInstanceOf(Date)
  })

  it('should return false if device not found', async () => {
    const db = createMockDb()

    const result = await updateDeviceLastUsed(db, 'dev_nonexistent')

    expect(result).toBe(false)
  })

  it('should update timestamp for revoked devices', async () => {
    const db = createMockDb()
    const oldDate = new Date('2024-01-01')
    db._devices.push({
      id: '1',
      device_id: 'dev_web3_abc',
      user_id: 'user-123',
      platform: 'web3',
      public_key: '0x1234',
      wallet_address: '0xabcd',
      key_algorithm: 'secp256k1',
      status: 'revoked',
      registered_at: oldDate,
      last_used_at: oldDate,
      created_at: oldDate,
    })

    const result = await updateDeviceLastUsed(db, 'dev_web3_abc')

    expect(result).toBe(true)
    expect(db._devices[0].last_used_at).not.toEqual(oldDate)
  })
})
