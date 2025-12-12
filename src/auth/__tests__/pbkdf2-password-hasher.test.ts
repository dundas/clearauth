import { describe, it, expect } from 'vitest'

import { createPbkdf2PasswordHasher } from '../../password-hasher.js'

describe('PBKDF2 Password Hasher', () => {
  it('should hash and verify correctly', async () => {
    const hasher = createPbkdf2PasswordHasher({ iterations: 100_000 })
    const password = 'TestPassword123!'

    const hashed = await hasher.hash(password)
    expect(typeof hashed).toBe('string')
    expect(hashed).toContain('$pbkdf2$')

    const ok = await hasher.verify(hashed, password)
    expect(ok).toBe(true)

    const bad = await hasher.verify(hashed, 'wrong-password')
    expect(bad).toBe(false)
  })

  it('should produce different hashes for the same password (random salt)', async () => {
    const hasher = createPbkdf2PasswordHasher({ iterations: 100_000 })
    const password = 'TestPassword123!'

    const hash1 = await hasher.hash(password)
    const hash2 = await hasher.hash(password)

    expect(hash1).not.toBe(hash2)
  })

  it('should reject invalid formats', async () => {
    const hasher = createPbkdf2PasswordHasher({ iterations: 100_000 })

    expect(await hasher.verify('not-a-hash', 'pw')).toBe(false)
    expect(await hasher.verify('$pbkdf2$', 'pw')).toBe(false)
  })

  it('should enforce parser bounds for iterations / key length', async () => {
    const hasher = createPbkdf2PasswordHasher({ iterations: 100_000 })

    const tooFewIterations = '$pbkdf2$sha256$i=1$l=32$AAAA$AAAA'
    expect(await hasher.verify(tooFewIterations, 'pw')).toBe(false)

    const tooManyIterations = '$pbkdf2$sha256$i=99999999$l=32$AAAA$AAAA'
    expect(await hasher.verify(tooManyIterations, 'pw')).toBe(false)

    const tooSmallKey = '$pbkdf2$sha256$i=100000$l=1$AAAA$AAAA'
    expect(await hasher.verify(tooSmallKey, 'pw')).toBe(false)

    const tooLargeKey = '$pbkdf2$sha256$i=100000$l=999$AAAA$AAAA'
    expect(await hasher.verify(tooLargeKey, 'pw')).toBe(false)
  })
})
