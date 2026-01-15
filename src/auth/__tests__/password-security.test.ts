/**
 * Password Hashing and Security Tests
 *
 * Tests for Argon2id password hashing, verification, and security properties.
 */

import { describe, it, expect } from 'vitest'
import { hash, verify } from '@node-rs/argon2'

describe('Password Hashing Security', () => {
  const ARGON2_CONFIG = {
    memoryCost: 19456, // 19 MiB
    timeCost: 2, // 2 iterations
    parallelism: 1, // Single thread
  }

  describe('Argon2id Hashing', () => {
    it('should hash a password successfully', async () => {
      const password = 'TestPassword123!'
      const hashed = await hash(password, ARGON2_CONFIG)

      expect(hashed).toBeTruthy()
      expect(typeof hashed).toBe('string')
      expect(hashed).not.toBe(password)
      expect(hashed).toContain('$argon2')
    })

    it('should produce different hashes for same password (salt randomness)', async () => {
      const password = 'TestPassword123!'
      const hash1 = await hash(password, ARGON2_CONFIG)
      const hash2 = await hash(password, ARGON2_CONFIG)

      expect(hash1).not.toBe(hash2)
    })

    it('should verify correct password', async () => {
      const password = 'TestPassword123!'
      const hashed = await hash(password, ARGON2_CONFIG)

      const isValid = await verify(hashed, password)
      expect(isValid).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!'
      const wrongPassword = 'WrongPassword456!'
      const hashed = await hash(password, ARGON2_CONFIG)

      const isValid = await verify(hashed, wrongPassword)
      expect(isValid).toBe(false)
    })

    it('should be case sensitive', async () => {
      const password = 'TestPassword123!'
      const wrongCase = 'testpassword123!'
      const hashed = await hash(password, ARGON2_CONFIG)

      const isValid = await verify(hashed, wrongCase)
      expect(isValid).toBe(false)
    })
  })

  describe('Timing Attack Resistance', () => {
    it('should take similar time for correct and incorrect passwords', async () => {
      const password = 'TestPassword123!'
      const wrongPassword = 'WrongPassword456!'
      const hashed = await hash(password, ARGON2_CONFIG)

      const samples = 5

      // Warm up (reduces variance on some machines)
      await verify(hashed, password)
      await verify(hashed, wrongPassword)

      const measure = async (candidate: string) => {
        const start = Date.now()
        for (let i = 0; i < samples; i++) {
          await verify(hashed, candidate)
        }
        return Date.now() - start
      }

      const correctMs = await measure(password)
      const wrongMs = await measure(wrongPassword)

      const min = Math.min(correctMs, wrongMs)
      const max = Math.max(correctMs, wrongMs)

      // We expect verification cost to be in the same ballpark for correct/incorrect passwords.
      // This is an inherently noisy measurement in CI and on developer machines.
      // Use a ratio bound rather than a strict millisecond threshold to avoid flakiness.
      // NOTE: Keep this bound loose enough to be stable across CI variance while still
      // catching obvious timing differences.
      expect(max / Math.max(min, 1)).toBeLessThan(2.5)
    })
  })

  describe('Hash Format Validation', () => {
    it('should produce valid Argon2id hash format', async () => {
      const password = 'TestPassword123!'
      const hashed = await hash(password, ARGON2_CONFIG)

      // Argon2id format: $argon2id$v=19$m=19456,t=2,p=1$salt$hash
      expect(hashed).toMatch(/^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$/)
    })

    it('should include correct parameters in hash', async () => {
      const password = 'TestPassword123!'
      const hashed = await hash(password, ARGON2_CONFIG)

      expect(hashed).toContain('m=19456') // Memory cost
      expect(hashed).toContain('t=2') // Time cost
      expect(hashed).toContain('p=1') // Parallelism
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty password', async () => {
      const password = ''
      const hashed = await hash(password, ARGON2_CONFIG)

      expect(hashed).toBeTruthy()
      const isValid = await verify(hashed, '')
      expect(isValid).toBe(true)
    })

    it('should handle very long passwords', async () => {
      const password = 'a'.repeat(1000)
      const hashed = await hash(password, ARGON2_CONFIG)

      expect(hashed).toBeTruthy()
      const isValid = await verify(hashed, password)
      expect(isValid).toBe(true)
    })

    it('should handle special characters', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`'
      const hashed = await hash(password, ARGON2_CONFIG)

      const isValid = await verify(hashed, password)
      expect(isValid).toBe(true)
    })

    it('should handle unicode characters', async () => {
      const password = '密码123🔒'
      const hashed = await hash(password, ARGON2_CONFIG)

      const isValid = await verify(hashed, password)
      expect(isValid).toBe(true)
    })
  })
})
