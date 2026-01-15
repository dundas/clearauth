/**
 * Web3 Wallet Signature Verification
 *
 * Implements EIP-191 personal_sign signature verification and Ethereum
 * address recovery for Web3 wallet authentication (MetaMask, WalletConnect, etc.).
 *
 * EIP-191 Format:
 * "\x19Ethereum Signed Message:\n" + len(message) + message
 *
 * @module device-auth/web3-verifier
 */

import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'

/**
 * Custom error for EIP-191 verification failures
 */
export class EIP191VerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EIP191VerificationError'
  }
}

/**
 * Custom error for address recovery failures
 */
export class AddressRecoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AddressRecoveryError'
  }
}

/**
 * Format message according to EIP-191 personal_sign standard
 *
 * The format is: "\x19Ethereum Signed Message:\n" + len(message) + message
 *
 * @param message - Original message to format
 * @returns EIP-191 formatted message as Uint8Array
 *
 * @example
 * ```typescript
 * const formatted = formatEIP191Message('Hello, World!')
 * // Returns: "\x19Ethereum Signed Message:\n13Hello, World!"
 * ```
 */
export function formatEIP191Message(message: string): Uint8Array {
  const prefix = '\x19Ethereum Signed Message:\n'
  const messageBytes = new TextEncoder().encode(message)
  const lengthStr = messageBytes.length.toString()

  // Concatenate: prefix + length + message
  const prefixBytes = new TextEncoder().encode(prefix + lengthStr)
  const formatted = new Uint8Array(prefixBytes.length + messageBytes.length)
  formatted.set(prefixBytes, 0)
  formatted.set(messageBytes, prefixBytes.length)

  return formatted
}

/**
 * Hash message according to EIP-191 standard
 *
 * @param message - Message to hash
 * @returns Keccak-256 hash of EIP-191 formatted message
 */
export function hashEIP191Message(message: string): Uint8Array {
  const formatted = formatEIP191Message(message)
  return keccak_256(formatted)
}

/**
 * Recover Ethereum address from signature
 *
 * @param message - Original message that was signed
 * @param signature - Signature in hex format (130 hex chars with recovery byte)
 * @returns Ethereum address (lowercase, 0x-prefixed)
 * @throws {AddressRecoveryError} If address recovery fails
 *
 * @example
 * ```typescript
 * const address = recoverEthereumAddress(
 *   'challenge|1234567890',
 *   '0x1234...ab1c' // 130 hex chars
 * )
 * // Returns: '0x742d35cc6634c0532925a3b844bc9e7595f0beb'
 * ```
 */
export function recoverEthereumAddress(message: string, signature: string): string {
  try {
    // Remove 0x prefix if present
    const normalizedSig = signature.replace(/^0x/i, '')

    // Validate signature length (64 bytes r+s + 1 byte recovery = 65 bytes = 130 hex chars)
    if (normalizedSig.length !== 130) {
      throw new AddressRecoveryError(
        `Invalid signature length: expected 130 hex characters, got ${normalizedSig.length}`
      )
    }

    // Parse signature components
    const r = normalizedSig.slice(0, 64)
    const s = normalizedSig.slice(64, 128)
    const v = parseInt(normalizedSig.slice(128, 130), 16)

    // Normalize recovery byte (27/28 or 0/1)
    let recovery = v
    if (recovery >= 27) {
      recovery -= 27
    }

    // Validate recovery byte
    if (recovery !== 0 && recovery !== 1) {
      throw new AddressRecoveryError(`Invalid recovery byte: ${v}`)
    }

    // Hash message with EIP-191 format
    const messageHash = hashEIP191Message(message)

    // Create signature object for recovery
    const signatureBytes = hexToBytes(r + s)
    const sig = secp256k1.Signature.fromBytes(signatureBytes).addRecoveryBit(recovery)

    // Recover public key
    const recoveredPoint = sig.recoverPublicKey(messageHash)
    const publicKey = recoveredPoint.toBytes(false) // uncompressed

    // Ethereum address is the last 20 bytes of keccak256(publicKey[1:])
    // (skip the first byte which is 0x04 for uncompressed keys)
    const publicKeyHash = keccak_256(publicKey.slice(1))
    const address = publicKeyHash.slice(-20)

    // Return checksummed address
    return '0x' + bytesToHex(address).toLowerCase()
  } catch (error) {
    if (error instanceof AddressRecoveryError) {
      throw error
    }
    throw new AddressRecoveryError(
      `Failed to recover Ethereum address: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Verify EIP-191 personal_sign signature
 *
 * Verifies that the signature was created by signing the message with the
 * private key corresponding to the given Ethereum address.
 *
 * @param message - Original message that was signed
 * @param signature - Signature in hex format (130 hex chars with recovery byte)
 * @param expectedAddress - Expected Ethereum address (with or without 0x prefix)
 * @returns True if signature is valid and matches the expected address
 * @throws {EIP191VerificationError} If verification fails
 *
 * @example
 * ```typescript
 * const isValid = verifyEIP191Signature(
 *   'challenge|1234567890',
 *   '0x1234...ab1c',
 *   '0x742d35cc6634c0532925a3b844bc9e7595f0beb'
 * )
 * ```
 */
export function verifyEIP191Signature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    // Recover address from signature
    const recoveredAddress = recoverEthereumAddress(message, signature)

    // Normalize expected address (lowercase, with 0x prefix)
    const normalizedExpected = expectedAddress.toLowerCase().replace(/^0x/i, '0x')

    // Compare addresses (case-insensitive)
    return recoveredAddress.toLowerCase() === normalizedExpected.toLowerCase()
  } catch (error) {
    if (error instanceof AddressRecoveryError) {
      throw new EIP191VerificationError(
        `EIP-191 verification failed: ${error.message}`
      )
    }
    throw new EIP191VerificationError(
      `EIP-191 verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Verify EIP-191 signature and return the recovered address
 *
 * Convenience function that both verifies the signature is valid and
 * returns the recovered Ethereum address.
 *
 * @param message - Original message that was signed
 * @param signature - Signature in hex format (130 hex chars with recovery byte)
 * @returns Object with verification result and recovered address
 *
 * @example
 * ```typescript
 * const result = verifyAndRecoverAddress(
 *   'challenge|1234567890',
 *   '0x1234...ab1c'
 * )
 * if (result.valid) {
 *   console.log('Signed by:', result.address)
 * }
 * ```
 */
export function verifyAndRecoverAddress(
  message: string,
  signature: string
): { valid: boolean; address: string | null; error?: string } {
  try {
    const address = recoverEthereumAddress(message, signature)
    return { valid: true, address }
  } catch (error) {
    return {
      valid: false,
      address: null,
      error: error instanceof Error ? error.message : 'unknown error',
    }
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
