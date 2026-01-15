/**
 * Multi-Curve Signature Verification
 *
 * Provides signature verification for device authentication across multiple
 * cryptographic curves:
 * - secp256k1: Web3 wallets (MetaMask, Ethereum)
 * - P-256 (NIST P-256): iOS Secure Enclave, Android KeyStore
 * - Ed25519: SeedID, modern crypto applications
 *
 * All implementations use audited cryptographic libraries and follow
 * best practices for signature verification.
 *
 * @module device-auth/signature-verifier
 */

import { secp256k1 } from '@noble/curves/secp256k1.js'
import { p256 } from '@noble/curves/nist.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import type { KeyAlgorithm } from './types.js'

/**
 * Custom error classes for signature verification
 */

/**
 * Thrown when signature verification fails
 */
export class InvalidSignatureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSignatureError'
  }
}

/**
 * Thrown when key algorithm is not supported
 */
export class UnsupportedAlgorithmError extends Error {
  constructor(algorithm: string) {
    super(`Unsupported key algorithm: ${algorithm}`)
    this.name = 'UnsupportedAlgorithmError'
  }
}

/**
 * Thrown when public key format is invalid
 */
export class InvalidPublicKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPublicKeyError'
  }
}

/**
 * Thrown when signature format is invalid
 */
export class InvalidSignatureFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSignatureFormatError'
  }
}

/**
 * Public Key Format Types
 */
export type PublicKeyFormat = 'hex' | 'base64' | 'raw'

/**
 * Signature Verification Options
 */
export interface SignatureVerificationOptions {
  /**
   * Message that was signed (typically the challenge string)
   */
  message: string

  /**
   * Signature to verify (hex, base64, or raw bytes)
   */
  signature: string

  /**
   * Public key in appropriate format for the algorithm
   */
  publicKey: string

  /**
   * Key algorithm to use
   */
  algorithm: KeyAlgorithm

  /**
   * Format of the public key (default: 'hex')
   */
  publicKeyFormat?: PublicKeyFormat

  /**
   * Format of the signature (default: 'hex')
   */
  signatureFormat?: PublicKeyFormat
}

/**
 * Verify a signature using secp256k1 (Ethereum/Bitcoin)
 *
 * This function verifies ECDSA signatures on the secp256k1 curve,
 * commonly used by Web3 wallets like MetaMask.
 *
 * @param message - Message that was signed (UTF-8 string)
 * @param signature - Signature in hex format (128 chars) or with recovery byte (130 chars)
 * @param publicKey - Public key in hex format (compressed 66 chars or uncompressed 130 chars)
 * @returns True if signature is valid
 * @throws {InvalidSignatureError} If signature verification fails
 * @throws {InvalidPublicKeyError} If public key format is invalid
 * @throws {InvalidSignatureFormatError} If signature format is invalid
 *
 * @example
 * ```typescript
 * const isValid = await verifySecp256k1Signature(
 *   'challenge|1234567890',
 *   '3045022100...',
 *   '04a1b2c3...'
 * )
 * ```
 */
export async function verifySecp256k1Signature(
  message: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    // Normalize inputs: remove 0x prefix if present
    const normalizedSignature = signature.replace(/^0x/i, '')
    const normalizedPublicKey = publicKey.replace(/^0x/i, '')

    // Validate signature format (64 bytes = 128 hex chars, or 65 bytes = 130 hex chars with recovery)
    if (normalizedSignature.length !== 128 && normalizedSignature.length !== 130) {
      throw new InvalidSignatureFormatError(
        `secp256k1 signature must be 128 or 130 hex characters, got ${normalizedSignature.length}`
      )
    }

    // Validate public key format (33 bytes compressed = 66 hex, or 65 bytes uncompressed = 130 hex)
    if (normalizedPublicKey.length !== 66 && normalizedPublicKey.length !== 130) {
      throw new InvalidPublicKeyError(
        `secp256k1 public key must be 66 (compressed) or 130 (uncompressed) hex characters, got ${normalizedPublicKey.length}`
      )
    }

    // Convert message to bytes (UTF-8)
    const messageBytes = new TextEncoder().encode(message)

    // Hash the message using SHA-256 (standard for secp256k1)
    const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)
    const messageHashArray = new Uint8Array(messageHash)

    // Convert signature hex to bytes (strip recovery byte if present)
    const signatureBytes = hexToBytes(normalizedSignature.slice(0, 128))

    // Convert public key hex to bytes
    const publicKeyBytes = hexToBytes(normalizedPublicKey)

    // Verify signature using @noble/curves
    const isValid = secp256k1.verify(signatureBytes, messageHashArray, publicKeyBytes)

    return isValid
  } catch (error) {
    if (
      error instanceof InvalidSignatureFormatError ||
      error instanceof InvalidPublicKeyError
    ) {
      throw error
    }
    throw new InvalidSignatureError(
      `secp256k1 signature verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Verify a signature using P-256 (NIST P-256 / prime256v1)
 *
 * This function verifies ECDSA signatures on the P-256 curve,
 * used by iOS Secure Enclave and Android KeyStore.
 *
 * @param message - Message that was signed (UTF-8 string)
 * @param signature - Signature in hex or DER format
 * @param publicKey - Public key in hex format (compressed 66 chars or uncompressed 130 chars)
 * @returns True if signature is valid
 * @throws {InvalidSignatureError} If signature verification fails
 * @throws {InvalidPublicKeyError} If public key format is invalid
 * @throws {InvalidSignatureFormatError} If signature format is invalid
 *
 * @example
 * ```typescript
 * const isValid = await verifyP256Signature(
 *   'challenge|1234567890',
 *   '3045022100...',
 *   '04a1b2c3...'
 * )
 * ```
 */
export async function verifyP256Signature(
  message: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    // Normalize inputs: remove 0x prefix if present
    const normalizedSignature = signature.replace(/^0x/i, '')
    const normalizedPublicKey = publicKey.replace(/^0x/i, '')

    // Validate public key format (33 bytes compressed = 66 hex, or 65 bytes uncompressed = 130 hex)
    if (normalizedPublicKey.length !== 66 && normalizedPublicKey.length !== 130) {
      throw new InvalidPublicKeyError(
        `P-256 public key must be 66 (compressed) or 130 (uncompressed) hex characters, got ${normalizedPublicKey.length}`
      )
    }

    // Convert message to bytes (UTF-8)
    const messageBytes = new TextEncoder().encode(message)

    // Hash the message using SHA-256 (standard for P-256)
    const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)
    const messageHashArray = new Uint8Array(messageHash)

    // Convert signature hex to bytes
    // Handle both raw signature (64 bytes) and DER-encoded signature
    let signatureBytes: Uint8Array
    if (normalizedSignature.length === 128) {
      // Raw r+s format (64 bytes = 128 hex chars)
      signatureBytes = hexToBytes(normalizedSignature)
    } else {
      // DER-encoded or other format - try to parse
      signatureBytes = hexToBytes(normalizedSignature)
    }

    // Convert public key hex to bytes
    const publicKeyBytes = hexToBytes(normalizedPublicKey)

    // Verify signature using @noble/curves
    const isValid = p256.verify(signatureBytes, messageHashArray, publicKeyBytes)

    return isValid
  } catch (error) {
    if (
      error instanceof InvalidSignatureFormatError ||
      error instanceof InvalidPublicKeyError
    ) {
      throw error
    }
    throw new InvalidSignatureError(
      `P-256 signature verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Verify a signature using Ed25519 (Edwards Curve)
 *
 * This function verifies EdDSA signatures on the Ed25519 curve,
 * used by SeedID and modern cryptographic applications.
 *
 * @param message - Message that was signed (UTF-8 string)
 * @param signature - Signature in hex format (128 hex chars = 64 bytes)
 * @param publicKey - Public key in hex format (64 hex chars = 32 bytes)
 * @returns True if signature is valid
 * @throws {InvalidSignatureError} If signature verification fails
 * @throws {InvalidPublicKeyError} If public key format is invalid
 * @throws {InvalidSignatureFormatError} If signature format is invalid
 *
 * @example
 * ```typescript
 * const isValid = await verifyEd25519Signature(
 *   'challenge|1234567890',
 *   'a1b2c3...',
 *   'd4e5f6...'
 * )
 * ```
 */
export async function verifyEd25519Signature(
  message: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    // Normalize inputs: remove 0x prefix if present
    const normalizedSignature = signature.replace(/^0x/i, '')
    const normalizedPublicKey = publicKey.replace(/^0x/i, '')

    // Validate signature format (64 bytes = 128 hex chars)
    if (normalizedSignature.length !== 128) {
      throw new InvalidSignatureFormatError(
        `Ed25519 signature must be 128 hex characters (64 bytes), got ${normalizedSignature.length}`
      )
    }

    // Validate public key format (32 bytes = 64 hex chars)
    if (normalizedPublicKey.length !== 64) {
      throw new InvalidPublicKeyError(
        `Ed25519 public key must be 64 hex characters (32 bytes), got ${normalizedPublicKey.length}`
      )
    }

    // Convert message to bytes (UTF-8)
    const messageBytes = new TextEncoder().encode(message)

    // Convert signature hex to bytes
    const signatureBytes = hexToBytes(normalizedSignature)

    // Convert public key hex to bytes
    const publicKeyBytes = hexToBytes(normalizedPublicKey)

    // Verify signature using @noble/curves
    // Ed25519 does NOT hash the message - the signature already includes the hash
    const isValid = ed25519.verify(signatureBytes, messageBytes, publicKeyBytes)

    return isValid
  } catch (error) {
    if (
      error instanceof InvalidSignatureFormatError ||
      error instanceof InvalidPublicKeyError
    ) {
      throw error
    }
    throw new InvalidSignatureError(
      `Ed25519 signature verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Universal signature verification function
 *
 * Automatically dispatches to the correct verification function based on
 * the key algorithm.
 *
 * @param options - Signature verification options
 * @returns True if signature is valid
 * @throws {UnsupportedAlgorithmError} If algorithm is not supported
 * @throws {InvalidSignatureError} If signature verification fails
 * @throws {InvalidPublicKeyError} If public key format is invalid
 * @throws {InvalidSignatureFormatError} If signature format is invalid
 *
 * @example
 * ```typescript
 * const isValid = await verifySignature({
 *   message: 'challenge|1234567890',
 *   signature: '3045022100...',
 *   publicKey: '04a1b2c3...',
 *   algorithm: 'secp256k1',
 * })
 * ```
 */
export async function verifySignature(
  options: SignatureVerificationOptions
): Promise<boolean> {
  const { message, signature, publicKey, algorithm } = options

  switch (algorithm) {
    case 'secp256k1':
      return verifySecp256k1Signature(message, signature, publicKey)

    case 'P-256':
      return verifyP256Signature(message, signature, publicKey)

    case 'Ed25519':
      return verifyEd25519Signature(message, signature, publicKey)

    default:
      throw new UnsupportedAlgorithmError(algorithm)
  }
}

/**
 * Parse public key from various formats
 *
 * Supports:
 * - Hex strings (with or without 0x prefix)
 * - Base64 strings
 * - Raw bytes (Uint8Array)
 *
 * @param publicKey - Public key in various formats
 * @param format - Format of the public key
 * @returns Public key as hex string (without 0x prefix)
 * @throws {InvalidPublicKeyError} If public key format is invalid
 *
 * @example
 * ```typescript
 * const hexKey = parsePublicKey('04a1b2c3...', 'hex')
 * const hexKey2 = parsePublicKey('BKGyxQ==', 'base64')
 * ```
 */
export function parsePublicKey(publicKey: string, format: PublicKeyFormat = 'hex'): string {
  try {
    switch (format) {
      case 'hex':
        // Remove 0x prefix if present
        return publicKey.replace(/^0x/i, '')

      case 'base64': {
        // Decode base64 to bytes, then convert to hex
        const decoded = atob(publicKey)
        const bytes = new Uint8Array(decoded.length)
        for (let i = 0; i < decoded.length; i++) {
          bytes[i] = decoded.charCodeAt(i)
        }
        return bytesToHex(bytes)
      }

      case 'raw':
        // Assume it's already in the correct format
        return publicKey

      default:
        throw new InvalidPublicKeyError(`Unsupported public key format: ${format}`)
    }
  } catch (error) {
    throw new InvalidPublicKeyError(
      `Failed to parse public key: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Parse signature from various formats
 *
 * @param signature - Signature in various formats
 * @param format - Format of the signature
 * @returns Signature as hex string (without 0x prefix)
 * @throws {InvalidSignatureFormatError} If signature format is invalid
 */
export function parseSignature(signature: string, format: PublicKeyFormat = 'hex'): string {
  try {
    switch (format) {
      case 'hex':
        // Remove 0x prefix if present
        return signature.replace(/^0x/i, '')

      case 'base64': {
        // Decode base64 to bytes, then convert to hex
        const decoded = atob(signature)
        const bytes = new Uint8Array(decoded.length)
        for (let i = 0; i < decoded.length; i++) {
          bytes[i] = decoded.charCodeAt(i)
        }
        return bytesToHex(bytes)
      }

      case 'raw':
        // Assume it's already in the correct format
        return signature

      default:
        throw new InvalidSignatureFormatError(`Unsupported signature format: ${format}`)
    }
  } catch (error) {
    throw new InvalidSignatureFormatError(
      `Failed to parse signature: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Utility: Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length')
  }

  // Validate hex characters
  if (!/^[0-9a-f]*$/i.test(hex)) {
    throw new Error('Invalid hex string: contains non-hexadecimal characters')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

/**
 * Utility: Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
