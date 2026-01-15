import { describe, it, expect } from 'vitest'
import {
  isDevicePlatform,
  isKeyAlgorithm,
  isDeviceStatus,
  toDeviceInfo,
  type Device,
} from '../types'

describe('Device Authentication Types', () => {
  describe('isDevicePlatform', () => {
    it('should return true for valid platforms', () => {
      expect(isDevicePlatform('web3')).toBe(true)
      expect(isDevicePlatform('ios')).toBe(true)
      expect(isDevicePlatform('android')).toBe(true)
    })

    it('should return false for invalid platforms', () => {
      expect(isDevicePlatform('windows')).toBe(false)
      expect(isDevicePlatform('macos')).toBe(false)
      expect(isDevicePlatform('')).toBe(false)
      expect(isDevicePlatform('WEB3')).toBe(false)
    })
  })

  describe('isKeyAlgorithm', () => {
    it('should return true for valid algorithms', () => {
      expect(isKeyAlgorithm('secp256k1')).toBe(true)
      expect(isKeyAlgorithm('Ed25519')).toBe(true)
      expect(isKeyAlgorithm('P-256')).toBe(true)
    })

    it('should return false for invalid algorithms', () => {
      expect(isKeyAlgorithm('RSA')).toBe(false)
      expect(isKeyAlgorithm('P-384')).toBe(false)
      expect(isKeyAlgorithm('')).toBe(false)
      expect(isKeyAlgorithm('SECP256K1')).toBe(false)
    })
  })

  describe('isDeviceStatus', () => {
    it('should return true for valid statuses', () => {
      expect(isDeviceStatus('active')).toBe(true)
      expect(isDeviceStatus('revoked')).toBe(true)
    })

    it('should return false for invalid statuses', () => {
      expect(isDeviceStatus('pending')).toBe(false)
      expect(isDeviceStatus('inactive')).toBe(false)
      expect(isDeviceStatus('')).toBe(false)
      expect(isDeviceStatus('ACTIVE')).toBe(false)
    })
  })

  describe('toDeviceInfo', () => {
    it('should convert Device to DeviceInfo with all fields', () => {
      const device: Device = {
        id: 'dev-uuid-123',
        device_id: 'dev_web3_abc123',
        user_id: 'user-uuid-456',
        platform: 'web3',
        public_key: '0x742d35Cc6634C0532925a3b844Bc9e7595f42a0d',
        wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f42a0d',
        key_algorithm: 'secp256k1',
        status: 'active',
        registered_at: new Date('2026-01-15T10:00:00Z'),
        last_used_at: new Date('2026-01-15T12:00:00Z'),
        created_at: new Date('2026-01-15T10:00:00Z'),
      }

      const info = toDeviceInfo(device)

      expect(info.deviceId).toBe('dev_web3_abc123')
      expect(info.platform).toBe('web3')
      expect(info.keyAlgorithm).toBe('secp256k1')
      expect(info.status).toBe('active')
      expect(info.registeredAt).toBe('2026-01-15T10:00:00.000Z')
      expect(info.lastUsedAt).toBe('2026-01-15T12:00:00.000Z')
    })

    it('should handle null last_used_at', () => {
      const device: Device = {
        id: 'dev-uuid-123',
        device_id: 'dev_ios_xyz789',
        user_id: 'user-uuid-456',
        platform: 'ios',
        public_key: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
        wallet_address: null,
        key_algorithm: 'P-256',
        status: 'active',
        registered_at: new Date('2026-01-15T10:00:00Z'),
        last_used_at: null,
        created_at: new Date('2026-01-15T10:00:00Z'),
      }

      const info = toDeviceInfo(device)

      expect(info.lastUsedAt).toBeNull()
    })

    it('should convert iOS device correctly', () => {
      const device: Device = {
        id: 'dev-uuid-ios',
        device_id: 'dev_ios_test',
        user_id: 'user-uuid-456',
        platform: 'ios',
        public_key: 'test-p256-key',
        wallet_address: null,
        key_algorithm: 'P-256',
        status: 'active',
        registered_at: new Date('2026-01-15T10:00:00Z'),
        last_used_at: null,
        created_at: new Date('2026-01-15T10:00:00Z'),
      }

      const info = toDeviceInfo(device)

      expect(info.platform).toBe('ios')
      expect(info.keyAlgorithm).toBe('P-256')
    })

    it('should convert Android device correctly', () => {
      const device: Device = {
        id: 'dev-uuid-android',
        device_id: 'dev_android_test',
        user_id: 'user-uuid-456',
        platform: 'android',
        public_key: 'test-p256-key',
        wallet_address: null,
        key_algorithm: 'P-256',
        status: 'active',
        registered_at: new Date('2026-01-15T10:00:00Z'),
        last_used_at: null,
        created_at: new Date('2026-01-15T10:00:00Z'),
      }

      const info = toDeviceInfo(device)

      expect(info.platform).toBe('android')
      expect(info.keyAlgorithm).toBe('P-256')
    })

    it('should convert revoked device correctly', () => {
      const device: Device = {
        id: 'dev-uuid-revoked',
        device_id: 'dev_web3_revoked',
        user_id: 'user-uuid-456',
        platform: 'web3',
        public_key: '0x742d35Cc6634C0532925a3b844Bc9e7595f42a0d',
        wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f42a0d',
        key_algorithm: 'secp256k1',
        status: 'revoked',
        registered_at: new Date('2026-01-15T10:00:00Z'),
        last_used_at: new Date('2026-01-15T11:00:00Z'),
        created_at: new Date('2026-01-15T10:00:00Z'),
      }

      const info = toDeviceInfo(device)

      expect(info.status).toBe('revoked')
    })
  })
})
