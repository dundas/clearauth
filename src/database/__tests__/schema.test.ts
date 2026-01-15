import { describe, it, expect } from 'vitest'
import { isValidRefreshToken } from '../schema.js'
import type { RefreshToken } from '../schema.js'

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
