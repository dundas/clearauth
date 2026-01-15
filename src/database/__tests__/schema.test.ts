import { describe, it, expect } from 'vitest'
import { isValidRefreshToken, isValidDevice, isValidChallenge } from '../schema.js'
import type { RefreshToken, Device, Challenge } from '../schema.js'

describe('isValidRefreshToken', () => {
  const baseToken: RefreshToken = {
    id: 'test-uuid-123',
    user_id: 'user-uuid-456',
    token_hash: 'abc123def456',
    name: 'Test Device',
    created_at: new Date('2026-01-15T00:00:00Z'),
    last_used_at: null,
    expires_at: new Date(Date.now() + 86400000), // Tomorrow (24 hours from now)
    revoked_at: null,
  }

  it('should return true for valid non-revoked non-expired token', () => {
    const result = isValidRefreshToken(baseToken)
    expect(result).toBe(true)
  })

  it('should return false for expired token', () => {
    const expiredToken: RefreshToken = {
      ...baseToken,
      expires_at: new Date(Date.now() - 86400000), // Yesterday (24 hours ago)
    }
    const result = isValidRefreshToken(expiredToken)
    expect(result).toBe(false)
  })

  it('should return false for revoked token', () => {
    const revokedToken: RefreshToken = {
      ...baseToken,
      revoked_at: new Date('2026-01-15T12:00:00Z'),
    }
    const result = isValidRefreshToken(revokedToken)
    expect(result).toBe(false)
  })

  it('should return false for token that is both expired and revoked', () => {
    const invalidToken: RefreshToken = {
      ...baseToken,
      expires_at: new Date(Date.now() - 86400000), // Expired
      revoked_at: new Date('2026-01-15T12:00:00Z'), // Revoked
    }
    const result = isValidRefreshToken(invalidToken)
    expect(result).toBe(false)
  })

  it('should return false for token expiring right now (edge case)', () => {
    const expiringNowToken: RefreshToken = {
      ...baseToken,
      expires_at: new Date(Date.now() - 100), // 100ms ago
    }
    const result = isValidRefreshToken(expiringNowToken)
    expect(result).toBe(false)
  })

  it('should return true for token with last_used_at set', () => {
    const usedToken: RefreshToken = {
      ...baseToken,
      last_used_at: new Date('2026-01-14T12:00:00Z'),
    }
    const result = isValidRefreshToken(usedToken)
    expect(result).toBe(true)
  })

  it('should return true for token with name set', () => {
    const namedToken: RefreshToken = {
      ...baseToken,
      name: 'MacBook Pro 2024',
    }
    const result = isValidRefreshToken(namedToken)
    expect(result).toBe(true)
  })

  it('should return true for token with null name', () => {
    const noNameToken: RefreshToken = {
      ...baseToken,
      name: null,
    }
    const result = isValidRefreshToken(noNameToken)
    expect(result).toBe(true)
  })
})

describe('isValidDevice', () => {
  const baseDevice: Device = {
    id: 'device-uuid-123',
    device_id: 'dev_web3_abc123',
    user_id: 'user-uuid-456',
    platform: 'web3',
    public_key: '0x742d35Cc6634C0532925a3b844Bc9e7595f42a0d',
    wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f42a0d',
    key_algorithm: 'secp256k1',
    status: 'active',
    registered_at: new Date('2026-01-15T00:00:00Z'),
    last_used_at: null,
    created_at: new Date('2026-01-15T00:00:00Z'),
  }

  it('should return true for active device', () => {
    const result = isValidDevice(baseDevice)
    expect(result).toBe(true)
  })

  it('should return false for revoked device', () => {
    const revokedDevice: Device = {
      ...baseDevice,
      status: 'revoked',
    }
    const result = isValidDevice(revokedDevice)
    expect(result).toBe(false)
  })

  it('should return true for iOS device', () => {
    const iosDevice: Device = {
      ...baseDevice,
      platform: 'ios',
      key_algorithm: 'P-256',
      wallet_address: null,
    }
    const result = isValidDevice(iosDevice)
    expect(result).toBe(true)
  })

  it('should return true for Android device', () => {
    const androidDevice: Device = {
      ...baseDevice,
      platform: 'android',
      key_algorithm: 'P-256',
      wallet_address: null,
    }
    const result = isValidDevice(androidDevice)
    expect(result).toBe(true)
  })

  it('should return true for device with last_used_at', () => {
    const usedDevice: Device = {
      ...baseDevice,
      last_used_at: new Date('2026-01-15T12:00:00Z'),
    }
    const result = isValidDevice(usedDevice)
    expect(result).toBe(true)
  })
})

describe('isValidChallenge', () => {
  it('should return true for non-expired challenge', () => {
    const challenge: Challenge = {
      nonce: 'abc123def456',
      challenge: 'abc123def456|1705326960000',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 600000), // 10 minutes from now
    }
    const result = isValidChallenge(challenge)
    expect(result).toBe(true)
  })

  it('should return false for expired challenge', () => {
    const expiredChallenge: Challenge = {
      nonce: 'xyz789',
      challenge: 'xyz789|1705326960000',
      created_at: new Date(Date.now() - 700000), // 11.67 minutes ago
      expires_at: new Date(Date.now() - 100000), // 1.67 minutes ago
    }
    const result = isValidChallenge(expiredChallenge)
    expect(result).toBe(false)
  })

  it('should return false for challenge expiring right now', () => {
    const expiringChallenge: Challenge = {
      nonce: 'expiring123',
      challenge: 'expiring123|1705326960000',
      created_at: new Date(Date.now() - 600000),
      expires_at: new Date(Date.now() - 100), // 100ms ago
    }
    const result = isValidChallenge(expiringChallenge)
    expect(result).toBe(false)
  })
})
