import { describe, it, expect } from 'vitest'

import { createArgon2idPasswordHasher } from '../../password-hasher-argon2.js'

describe('Argon2id Password Hasher Wrapper', () => {
  it('should hash and verify correctly', async () => {
    const hasher = createArgon2idPasswordHasher({ memoryCost: 4096, timeCost: 1, parallelism: 1 })
    const password = 'TestPassword123!'

    const hashed = await hasher.hash(password)
    expect(typeof hashed).toBe('string')
    expect(hashed).toContain('$argon2id$')

    const ok = await hasher.verify(hashed, password)
    expect(ok).toBe(true)

    const bad = await hasher.verify(hashed, 'wrong-password')
    expect(bad).toBe(false)
  })
})
