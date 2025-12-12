import type { CreateMechAuthOptions } from "./createMechAuth.js"
import { createMechAuth } from "./createMechAuth.js"
import { createArgon2idPasswordHasher } from "./password-hasher-argon2.js"

export function createMechAuthNode(options: CreateMechAuthOptions) {
  return createMechAuth({
    ...options,
    passwordHasher: options.passwordHasher ?? createArgon2idPasswordHasher(),
  })
}

export { defaultSessionConfig, longSessionConfig, shortSessionConfig } from "./createMechAuth.js"
export type { MechAuthConfig } from "./types.js"
