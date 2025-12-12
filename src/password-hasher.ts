import { base64url } from 'oslo/encoding'

export interface PasswordHasher {
  id: string
  hash(password: string): Promise<string>
  verify(hash: string, password: string): Promise<boolean>
}

export type Pbkdf2PasswordHasherOptions = {
  iterations?: number
  hash?: 'SHA-256' | 'SHA-512'
  saltLength?: number
  keyLength?: number
}

function encodeBase64UrlNoPadding(bytes: Uint8Array): string {
  return base64url.encode(bytes, { includePadding: false })
}

function decodeBase64UrlNoPadding(value: string): Uint8Array {
  return base64url.decode(value, { strict: false })
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

async function pbkdf2DeriveKeyBytes(params: {
  password: string
  salt: Uint8Array
  iterations: number
  hash: 'SHA-256' | 'SHA-512'
  keyLength: number
}): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(params.password), 'PBKDF2', false, [
    'deriveBits',
  ])

  // WebCrypto types can be picky about the exact ArrayBuffer type; Uint8Array is valid at runtime.
  const saltBufferSource = params.salt as unknown as BufferSource
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBufferSource,
      iterations: params.iterations,
      hash: params.hash,
    },
    keyMaterial,
    params.keyLength * 8
  )
  return new Uint8Array(bits)
}

export function createPbkdf2PasswordHasher(options: Pbkdf2PasswordHasherOptions = {}): PasswordHasher {
  const iterations = options.iterations ?? 600_000
  const hash = options.hash ?? 'SHA-256'
  const saltLength = options.saltLength ?? 16
  const keyLength = options.keyLength ?? 32

  const MIN_ITERATIONS = 100_000
  const MAX_ITERATIONS = 2_000_000
  const MIN_KEY_LENGTH = 16
  const MAX_KEY_LENGTH = 64
  const MIN_SALT_LENGTH = 8
  const MAX_SALT_LENGTH = 64

  return {
    id: 'pbkdf2',
    async hash(password: string): Promise<string> {
      const salt = new Uint8Array(saltLength)
      crypto.getRandomValues(salt)
      const derivedKey = await pbkdf2DeriveKeyBytes({ password, salt, iterations, hash, keyLength })

      const saltB64 = encodeBase64UrlNoPadding(salt)
      const keyB64 = encodeBase64UrlNoPadding(derivedKey)
      const hashName = hash.toLowerCase().replace('-', '')

      return `$pbkdf2$${hashName}$i=${iterations}$l=${keyLength}$${saltB64}$${keyB64}`
    },
    async verify(storedHash: string, password: string): Promise<boolean> {
      if (!storedHash.startsWith('$pbkdf2$')) {
        return false
      }

      const parts = storedHash.split('$')
      if (parts.length !== 7) {
        return false
      }

      const algorithm = parts[2]
      const iterationsPart = parts[3]
      const keyLengthPart = parts[4]
      const saltPart = parts[5]
      const keyPart = parts[6]

      if (!iterationsPart?.startsWith('i=') || !keyLengthPart?.startsWith('l=')) {
        return false
      }

      const parsedIterations = Number(iterationsPart.slice(2))
      const parsedKeyLength = Number(keyLengthPart.slice(2))
      if (!Number.isFinite(parsedIterations) || parsedIterations < MIN_ITERATIONS || parsedIterations > MAX_ITERATIONS) {
        return false
      }
      if (!Number.isFinite(parsedKeyLength) || parsedKeyLength < MIN_KEY_LENGTH || parsedKeyLength > MAX_KEY_LENGTH) {
        return false
      }

      let parsedHash: 'SHA-256' | 'SHA-512' | null = null
      if (algorithm === 'sha256') {
        parsedHash = 'SHA-256'
      } else if (algorithm === 'sha512') {
        parsedHash = 'SHA-512'
      }
      if (!parsedHash) {
        return false
      }

      let salt: Uint8Array
      let expectedKey: Uint8Array
      try {
        salt = decodeBase64UrlNoPadding(saltPart)
        expectedKey = decodeBase64UrlNoPadding(keyPart)
      } catch {
        return false
      }

      if (salt.length < MIN_SALT_LENGTH || salt.length > MAX_SALT_LENGTH) {
        return false
      }
      if (expectedKey.length !== parsedKeyLength) {
        return false
      }

      const derivedKey = await pbkdf2DeriveKeyBytes({
        password,
        salt,
        iterations: parsedIterations,
        hash: parsedHash,
        keyLength: parsedKeyLength,
      })

      return timingSafeEqual(derivedKey, expectedKey)
    },
  }
}
