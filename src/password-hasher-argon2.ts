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

  const loadArgon2 = async () => {
    try {
      return await import('@node-rs/argon2')
    } catch (error: any) {
      const message = `Failed to load native argon2 bindings. 
This is likely an architecture mismatch (e.g., loading ARM64 bindings in an x64 Node.js process).
Please ensure your Node.js architecture matches your environment, or use Bun.
Original error: ${error.message}`
      console.error(message)
      throw new Error(message)
    }
  }

  return {
    id: 'argon2id',
    async hash(password: string): Promise<string> {
      const { hash: argon2Hash } = await loadArgon2()
      return await argon2Hash(password, { memoryCost, timeCost, parallelism })
    },
    async verify(hash: string, password: string): Promise<boolean> {
      const { verify: argon2Verify } = await loadArgon2()
      return await argon2Verify(hash, password)
    },
  }
}
