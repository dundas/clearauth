import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'

import type { PasswordHasher } from './password-hasher.js'

export type Argon2idPasswordHasherOptions = {
  memoryCost?: number
  timeCost?: number
  parallelism?: number
}

export function createArgon2idPasswordHasher(options: Argon2idPasswordHasherOptions = {}): PasswordHasher {
  const memoryCost = options.memoryCost ?? 19456
  const timeCost = options.timeCost ?? 2
  const parallelism = options.parallelism ?? 1

  return {
    id: 'argon2id',
    async hash(password: string): Promise<string> {
      return await argon2Hash(password, { memoryCost, timeCost, parallelism })
    },
    async verify(hash: string, password: string): Promise<boolean> {
      return await argon2Verify(hash, password)
    },
  }
}
