import type { CreateClearAuthOptions } from "./createMechAuth.js"
import { createClearAuth } from "./createMechAuth.js"
import { createArgon2idPasswordHasher } from "./password-hasher-argon2.js"

export function createClearAuthNode(options: CreateClearAuthOptions) {
  return createClearAuth({
    ...options,
    passwordHasher: options.passwordHasher ?? createArgon2idPasswordHasher(),
  })
}

export { defaultSessionConfig, longSessionConfig, shortSessionConfig } from "./createMechAuth.js"
export type { ClearAuthConfig } from "./types.js"
