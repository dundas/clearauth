/**
 * Web3 Wallet Signature Verification Tests
 *
 * Comprehensive tests for EIP-191 signature verification and Ethereum address recovery.
 */

import { describe, test, expect } from 'vitest'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { randomBytes } from '@noble/hashes/utils.js'
import {
  formatEIP191Message,
  hashEIP191Message,
  recoverEthereumAddress,
  verifyEIP191Signature,
  verifyAndRecoverAddress,
  EIP191VerificationError,
  AddressRecoveryError,
} from '../web3-verifier.js'

describe('Web3 Wallet Signature Verification', () => {
  const testMessage = 'challenge|1234567890'

  // Helper: Generate a valid private key for testing
  function generateTestPrivateKey(seed: number): Uint8Array {
    // Create a deterministic but valid private key
    const key = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      key[i] = ((seed + i) * 7 + 13) % 256
    }
    // Ensure it's within valid range (not 0, not >= ORDER)
    key[0] = Math.max(1, key[0] % 128) // Keep it small to avoid >= ORDER
    return key
  }

  // Helper: Derive Ethereum address from private key
  function getEthereumAddress(privateKey: Uint8Array): string {
    const publicKey = secp256k1.getPublicKey(privateKey, false) // uncompressed
    const publicKeyHash = keccak_256(publicKey.slice(1)) // skip 0x04 prefix
    const address = publicKeyHash.slice(-20)
    return '0x' + bytesToHex(address).toLowerCase()
  }

  // Helper: Sign message with EIP-191 format
  function signEIP191Message(message: string, privateKey: Uint8Array): string {
    const messageHash = hashEIP191Message(message)
    const signatureBytes = secp256k1.sign(messageHash, privateKey)

    // Convert to Signature object
    const signature = secp256k1.Signature.fromBytes(signatureBytes)

    // Get expected public key
    const expectedPublicKey = secp256k1.getPublicKey(privateKey, false)

    // Try both recovery bytes to find the correct one
    let recovery = 0
    for (let i = 0; i < 2; i++) {
      try {
        const recovered = signature.addRecoveryBit(i).recoverPublicKey(messageHash)
        const recoveredBytes = recovered.toBytes(false)
        if (areArraysEqual(recoveredBytes, expectedPublicKey)) {
          recovery = i
          break
        }
      } catch {
        // Try next recovery byte
      }
    }

    // Construct full signature (r + s + v)
    const r = bytesToHex(signatureBytes.slice(0, 32))
    const s = bytesToHex(signatureBytes.slice(32, 64))
    const v = (recovery + 27).toString(16).padStart(2, '0') // Add 27 for Ethereum compatibility

    return '0x' + r + s + v
  }

  describe('EIP-191 Message Formatting', () => {
    test('should format message with correct prefix', () => {
      const formatted = formatEIP191Message('Hello, World!')
      const decoded = new TextDecoder().decode(formatted)

      expect(decoded).toBe('\x19Ethereum Signed Message:\n13Hello, World!')
    })

    test('should format empty message', () => {
      const formatted = formatEIP191Message('')
      const decoded = new TextDecoder().decode(formatted)

      expect(decoded).toBe('\x19Ethereum Signed Message:\n0')
    })

    test('should format message with special characters', () => {
      const message = 'Test\nWith\tSpecial\r\nChars'
      const formatted = formatEIP191Message(message)
      const decoded = new TextDecoder().decode(formatted)

      expect(decoded).toContain('\x19Ethereum Signed Message:\n')
      expect(decoded).toContain(message)
      expect(decoded).toContain(message.length.toString())
    })

    test('should format message with unicode characters', () => {
      const message = 'Hello 你好 🌍'
      const formatted = formatEIP191Message(message)
      const messageBytes = new TextEncoder().encode(message)

      // Should contain the correct byte length
      expect(formatted.length).toBeGreaterThan(message.length)
      expect(formatted.includes(messageBytes[0])).toBe(true)
    })
  })

  describe('EIP-191 Message Hashing', () => {
    test('should hash formatted message with keccak256', () => {
      const hash = hashEIP191Message('test')

      expect(hash).toBeInstanceOf(Uint8Array)
      expect(hash.length).toBe(32) // 256 bits = 32 bytes
    })

    test('should produce consistent hashes for same message', () => {
      const hash1 = hashEIP191Message(testMessage)
      const hash2 = hashEIP191Message(testMessage)

      expect(bytesToHex(hash1)).toBe(bytesToHex(hash2))
    })

    test('should produce different hashes for different messages', () => {
      const hash1 = hashEIP191Message('message1')
      const hash2 = hashEIP191Message('message2')

      expect(bytesToHex(hash1)).not.toBe(bytesToHex(hash2))
    })
  })

  describe('Ethereum Address Recovery', () => {
    test('should recover correct Ethereum address from valid signature', () => {
      // Use a known private key for testing
      const privateKey = generateTestPrivateKey(1)
      const expectedAddress = getEthereumAddress(privateKey)
      const signature = signEIP191Message(testMessage, privateKey)

      const recoveredAddress = recoverEthereumAddress(testMessage, signature)

      expect(recoveredAddress.toLowerCase()).toBe(expectedAddress.toLowerCase())
    })

    test('should recover address with 0x prefix', () => {
      const privateKey = generateTestPrivateKey(2)
      const signature = signEIP191Message(testMessage, privateKey)

      const recoveredAddress = recoverEthereumAddress(testMessage, signature)

      expect(recoveredAddress).toMatch(/^0x[0-9a-f]{40}$/)
    })

    test('should handle signature with 0x prefix', () => {
      const privateKey = generateTestPrivateKey(3)
      const expectedAddress = getEthereumAddress(privateKey)
      let signature = signEIP191Message(testMessage, privateKey)

      // Ensure 0x prefix
      if (!signature.startsWith('0x')) {
        signature = '0x' + signature
      }

      const recoveredAddress = recoverEthereumAddress(testMessage, signature)

      expect(recoveredAddress.toLowerCase()).toBe(expectedAddress.toLowerCase())
    })

    test('should handle signature without 0x prefix', () => {
      const privateKey = generateTestPrivateKey(4)
      const expectedAddress = getEthereumAddress(privateKey)
      let signature = signEIP191Message(testMessage, privateKey)

      // Remove 0x prefix if present
      signature = signature.replace(/^0x/, '')

      const recoveredAddress = recoverEthereumAddress(testMessage, signature)

      expect(recoveredAddress.toLowerCase()).toBe(expectedAddress.toLowerCase())
    })

    test('should throw AddressRecoveryError for invalid signature length', () => {
      const invalidSignature = '0x1234' // Too short

      expect(() => recoverEthereumAddress(testMessage, invalidSignature)).toThrow(
        AddressRecoveryError
      )
    })

    test('should throw AddressRecoveryError for invalid recovery byte', () => {
      const privateKey = generateTestPrivateKey(5)
      let signature = signEIP191Message(testMessage, privateKey)

      // Modify recovery byte to invalid value (not 0, 1, 27, or 28)
      signature = signature.slice(0, -2) + '05' // Invalid recovery byte

      expect(() => recoverEthereumAddress(testMessage, signature)).toThrow(
        AddressRecoveryError
      )
    })

    test('should throw AddressRecoveryError for non-hex characters', () => {
      const invalidSignature = '0x' + 'gg'.repeat(65) // Non-hex characters

      expect(() => recoverEthereumAddress(testMessage, invalidSignature)).toThrow(
        AddressRecoveryError
      )
    })

    test('should recover different addresses for different private keys', () => {
      const privateKey1 = generateTestPrivateKey(6)
      const privateKey2 = generateTestPrivateKey(7)

      const signature1 = signEIP191Message(testMessage, privateKey1)
      const signature2 = signEIP191Message(testMessage, privateKey2)

      const address1 = recoverEthereumAddress(testMessage, signature1)
      const address2 = recoverEthereumAddress(testMessage, signature2)

      expect(address1).not.toBe(address2)
    })
  })

  describe('EIP-191 Signature Verification', () => {
    test('should verify valid signature with correct address', () => {
      const privateKey = generateTestPrivateKey(8)
      const expectedAddress = getEthereumAddress(privateKey)
      const signature = signEIP191Message(testMessage, privateKey)

      const isValid = verifyEIP191Signature(testMessage, signature, expectedAddress)

      expect(isValid).toBe(true)
    })

    test('should reject signature with wrong address', () => {
      const privateKey1 = generateTestPrivateKey(9)
      const privateKey2 = generateTestPrivateKey(10)
      const wrongAddress = getEthereumAddress(privateKey2)
      const signature = signEIP191Message(testMessage, privateKey1)

      const isValid = verifyEIP191Signature(testMessage, signature, wrongAddress)

      expect(isValid).toBe(false)
    })

    test('should handle address with 0x prefix', () => {
      const privateKey = generateTestPrivateKey(11)
      const expectedAddress = getEthereumAddress(privateKey)
      const signature = signEIP191Message(testMessage, privateKey)

      const isValid = verifyEIP191Signature(testMessage, signature, expectedAddress)

      expect(isValid).toBe(true)
    })

    test('should handle address without 0x prefix', () => {
      const privateKey = generateTestPrivateKey(12)
      let expectedAddress = getEthereumAddress(privateKey)
      expectedAddress = expectedAddress.replace(/^0x/, '') // Remove 0x prefix
      const signature = signEIP191Message(testMessage, privateKey)

      const isValid = verifyEIP191Signature(testMessage, signature, expectedAddress)

      expect(isValid).toBe(true)
    })

    test('should be case-insensitive for addresses', () => {
      const privateKey = generateTestPrivateKey(13)
      const expectedAddress = getEthereumAddress(privateKey)
      const signature = signEIP191Message(testMessage, privateKey)

      // Test with uppercase address
      const isValid1 = verifyEIP191Signature(
        testMessage,
        signature,
        expectedAddress.toUpperCase()
      )
      expect(isValid1).toBe(true)

      // Test with lowercase address
      const isValid2 = verifyEIP191Signature(
        testMessage,
        signature,
        expectedAddress.toLowerCase()
      )
      expect(isValid2).toBe(true)
    })

    test('should reject signature for different message', () => {
      const privateKey = generateTestPrivateKey(14)
      const expectedAddress = getEthereumAddress(privateKey)
      const signature = signEIP191Message('different message', privateKey)

      const isValid = verifyEIP191Signature(testMessage, signature, expectedAddress)

      expect(isValid).toBe(false)
    })

    test('should throw EIP191VerificationError for invalid signature format', () => {
      const invalidSignature = '0x1234' // Too short
      const address = '0x742d35cc6634c0532925a3b844bc9e7595f0beb'

      expect(() => verifyEIP191Signature(testMessage, invalidSignature, address)).toThrow(
        EIP191VerificationError
      )
    })
  })

  describe('verifyAndRecoverAddress()', () => {
    test('should return valid=true and address for valid signature', () => {
      const privateKey = generateTestPrivateKey(15)
      const expectedAddress = getEthereumAddress(privateKey)
      const signature = signEIP191Message(testMessage, privateKey)

      const result = verifyAndRecoverAddress(testMessage, signature)

      expect(result.valid).toBe(true)
      expect(result.address).toBe(expectedAddress.toLowerCase())
      expect(result.error).toBeUndefined()
    })

    test('should return valid=false and error for invalid signature', () => {
      const invalidSignature = '0x1234' // Too short

      const result = verifyAndRecoverAddress(testMessage, invalidSignature)

      expect(result.valid).toBe(false)
      expect(result.address).toBeNull()
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Invalid signature length')
    })

    test('should return valid address with 0x prefix', () => {
      const privateKey = generateTestPrivateKey(16)
      const signature = signEIP191Message(testMessage, privateKey)

      const result = verifyAndRecoverAddress(testMessage, signature)

      expect(result.valid).toBe(true)
      expect(result.address).toMatch(/^0x[0-9a-f]{40}$/)
    })
  })

  describe('Integration Tests', () => {
    test('should complete full sign-and-verify flow', () => {
      // 1. Create a private key
      const privateKey = generateTestPrivateKey(100)

      // 2. Derive Ethereum address
      const address = getEthereumAddress(privateKey)

      // 3. Sign message
      const signature = signEIP191Message(testMessage, privateKey)

      // 4. Verify signature
      const isValid = verifyEIP191Signature(testMessage, signature, address)

      expect(isValid).toBe(true)
    })

    test('should detect signature from wrong key', () => {
      const privateKey1 = generateTestPrivateKey(100)
      const privateKey2 = generateTestPrivateKey(101)

      const address1 = getEthereumAddress(privateKey1)
      const signature2 = signEIP191Message(testMessage, privateKey2)

      const isValid = verifyEIP191Signature(testMessage, signature2, address1)

      expect(isValid).toBe(false)
    })

    test('should handle multiple signatures from same key', () => {
      const privateKey = generateTestPrivateKey(102)
      const address = getEthereumAddress(privateKey)

      const sig1 = signEIP191Message('message1', privateKey)
      const sig2 = signEIP191Message('message2', privateKey)

      expect(verifyEIP191Signature('message1', sig1, address)).toBe(true)
      expect(verifyEIP191Signature('message2', sig2, address)).toBe(true)

      // Cross-verify should fail
      expect(verifyEIP191Signature('message1', sig2, address)).toBe(false)
      expect(verifyEIP191Signature('message2', sig1, address)).toBe(false)
    })
  })
})

// Utility functions
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function areArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
