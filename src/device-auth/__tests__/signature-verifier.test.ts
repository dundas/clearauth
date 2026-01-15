/**
 * Signature Verification Tests
 *
 * Comprehensive tests for multi-curve signature verification.
 */

import { describe, test, expect } from 'vitest'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { p256 } from '@noble/curves/nist.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { randomBytes } from '@noble/hashes/utils.js'
import {
  verifySecp256k1Signature,
  verifyP256Signature,
  verifyEd25519Signature,
  verifySignature,
  parsePublicKey,
  parseSignature,
  InvalidSignatureError,
  UnsupportedAlgorithmError,
  InvalidPublicKeyError,
  InvalidSignatureFormatError,
} from '../signature-verifier.js'

describe('Signature Verification', () => {
  const testMessage = 'challenge|1234567890'

  describe('secp256k1 (Ethereum/Web3)', () => {
    test('should verify valid secp256k1 signature', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = secp256k1.getPublicKey(privateKey, false) // uncompressed

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign message
      const signature = secp256k1.sign(new Uint8Array(messageHash), privateKey)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey)
      const signatureHex = bytesToHex(signature)

      // Verify
      const isValid = await verifySecp256k1Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(true)
    })

    test('should verify valid secp256k1 signature with compressed public key', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = secp256k1.getPublicKey(privateKey, true) // compressed

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign message
      const signature = secp256k1.sign(new Uint8Array(messageHash), privateKey)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey)
      const signatureHex = bytesToHex(signature)

      // Verify
      const isValid = await verifySecp256k1Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(true)
    })

    test('should reject invalid secp256k1 signature', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = secp256k1.getPublicKey(privateKey, false)

      // Create invalid signature (all zeros)
      const invalidSignature = '0'.repeat(128)
      const publicKeyHex = bytesToHex(publicKey)

      // Verify should return false
      const isValid = await verifySecp256k1Signature(testMessage, invalidSignature, publicKeyHex)
      expect(isValid).toBe(false)
    })

    test('should reject secp256k1 signature with wrong public key', async () => {
      // Generate two key pairs
      const privateKey1 = randomBytes(32)
      const privateKey2 = randomBytes(32)
      const publicKey2 = secp256k1.getPublicKey(privateKey2, false)

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign with key 1
      const signature = secp256k1.sign(new Uint8Array(messageHash), privateKey1)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey2) // wrong key
      const signatureHex = bytesToHex(signature)

      // Verify should return false
      const isValid = await verifySecp256k1Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(false)
    })

    test('should accept secp256k1 signature with 0x prefix', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = secp256k1.getPublicKey(privateKey, false)

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign message
      const signature = secp256k1.sign(new Uint8Array(messageHash), privateKey)

      // Convert to hex strings with 0x prefix
      const publicKeyHex = '0x' + bytesToHex(publicKey)
      const signatureHex = '0x' + bytesToHex(signature)

      // Verify
      const isValid = await verifySecp256k1Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(true)
    })

    test('should throw InvalidSignatureFormatError for invalid signature length', async () => {
      const publicKey = '04' + '00'.repeat(64) // 130 hex chars (valid)
      const invalidSignature = '00'.repeat(32) // 64 hex chars (too short)

      await expect(
        verifySecp256k1Signature(testMessage, invalidSignature, publicKey)
      ).rejects.toThrow(InvalidSignatureFormatError)
    })

    test('should throw InvalidPublicKeyError for invalid public key length', async () => {
      const signature = '00'.repeat(64) // 128 hex chars (valid)
      const invalidPublicKey = '04' + '00'.repeat(30) // 62 hex chars (invalid length)

      await expect(
        verifySecp256k1Signature(testMessage, signature, invalidPublicKey)
      ).rejects.toThrow(InvalidPublicKeyError)
    })
  })

  describe('P-256 (iOS/Android)', () => {
    test('should verify valid P-256 signature', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = p256.getPublicKey(privateKey, false) // uncompressed

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign message
      const signature = p256.sign(new Uint8Array(messageHash), privateKey)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey)
      const signatureHex = bytesToHex(signature)

      // Verify
      const isValid = await verifyP256Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(true)
    })

    test('should verify valid P-256 signature with compressed public key', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = p256.getPublicKey(privateKey, true) // compressed

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign message
      const signature = p256.sign(new Uint8Array(messageHash), privateKey)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey)
      const signatureHex = bytesToHex(signature)

      // Verify
      const isValid = await verifyP256Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(true)
    })

    test('should reject invalid P-256 signature', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = p256.getPublicKey(privateKey, false)

      // Create invalid signature (all zeros)
      const invalidSignature = '0'.repeat(128)
      const publicKeyHex = bytesToHex(publicKey)

      // Verify should return false
      const isValid = await verifyP256Signature(testMessage, invalidSignature, publicKeyHex)
      expect(isValid).toBe(false)
    })

    test('should reject P-256 signature with wrong public key', async () => {
      // Generate two key pairs
      const privateKey1 = randomBytes(32)
      const privateKey2 = randomBytes(32)
      const publicKey2 = p256.getPublicKey(privateKey2, false)

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign with key 1
      const signature = p256.sign(new Uint8Array(messageHash), privateKey1)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey2) // wrong key
      const signatureHex = bytesToHex(signature)

      // Verify should return false
      const isValid = await verifyP256Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(false)
    })

    test('should accept P-256 signature with 0x prefix', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = p256.getPublicKey(privateKey, false)

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign message
      const signature = p256.sign(new Uint8Array(messageHash), privateKey)

      // Convert to hex strings with 0x prefix
      const publicKeyHex = '0x' + bytesToHex(publicKey)
      const signatureHex = '0x' + bytesToHex(signature)

      // Verify
      const isValid = await verifyP256Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(true)
    })

    test('should throw InvalidPublicKeyError for invalid public key length', async () => {
      const signature = '00'.repeat(64) // 128 hex chars (valid)
      const invalidPublicKey = '04' + '00'.repeat(30) // 62 hex chars (invalid length)

      await expect(verifyP256Signature(testMessage, signature, invalidPublicKey)).rejects.toThrow(
        InvalidPublicKeyError
      )
    })
  })

  describe('Ed25519 (SeedID)', () => {
    test('should verify valid Ed25519 signature', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = ed25519.getPublicKey(privateKey)

      // Sign message (Ed25519 doesn't pre-hash)
      const messageBytes = new TextEncoder().encode(testMessage)
      const signature = ed25519.sign(messageBytes, privateKey)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey)
      const signatureHex = bytesToHex(signature)

      // Verify
      const isValid = await verifyEd25519Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(true)
    })

    test('should reject invalid Ed25519 signature', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = ed25519.getPublicKey(privateKey)

      // Create invalid signature (all zeros)
      const invalidSignature = '0'.repeat(128)
      const publicKeyHex = bytesToHex(publicKey)

      // Verify should return false
      const isValid = await verifyEd25519Signature(testMessage, invalidSignature, publicKeyHex)
      expect(isValid).toBe(false)
    })

    test('should reject Ed25519 signature with wrong public key', async () => {
      // Generate two key pairs
      const privateKey1 = randomBytes(32)
      const privateKey2 = randomBytes(32)
      const publicKey2 = ed25519.getPublicKey(privateKey2)

      // Sign with key 1
      const messageBytes = new TextEncoder().encode(testMessage)
      const signature = ed25519.sign(messageBytes, privateKey1)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey2) // wrong key
      const signatureHex = bytesToHex(signature)

      // Verify should return false
      const isValid = await verifyEd25519Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(false)
    })

    test('should accept Ed25519 signature with 0x prefix', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = ed25519.getPublicKey(privateKey)

      // Sign message
      const messageBytes = new TextEncoder().encode(testMessage)
      const signature = ed25519.sign(messageBytes, privateKey)

      // Convert to hex strings with 0x prefix
      const publicKeyHex = '0x' + bytesToHex(publicKey)
      const signatureHex = '0x' + bytesToHex(signature)

      // Verify
      const isValid = await verifyEd25519Signature(testMessage, signatureHex, publicKeyHex)
      expect(isValid).toBe(true)
    })

    test('should throw InvalidSignatureFormatError for invalid signature length', async () => {
      const publicKey = '00'.repeat(32) // 64 hex chars (valid)
      const invalidSignature = '00'.repeat(32) // 64 hex chars (too short, should be 128)

      await expect(
        verifyEd25519Signature(testMessage, invalidSignature, publicKey)
      ).rejects.toThrow(InvalidSignatureFormatError)
    })

    test('should throw InvalidPublicKeyError for invalid public key length', async () => {
      const signature = '00'.repeat(64) // 128 hex chars (valid)
      const invalidPublicKey = '00'.repeat(16) // 32 hex chars (too short, should be 64)

      await expect(
        verifyEd25519Signature(testMessage, signature, invalidPublicKey)
      ).rejects.toThrow(InvalidPublicKeyError)
    })
  })

  describe('Universal verifySignature()', () => {
    test('should verify secp256k1 signature via universal function', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = secp256k1.getPublicKey(privateKey, false)

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign message
      const signature = secp256k1.sign(new Uint8Array(messageHash), privateKey)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey)
      const signatureHex = bytesToHex(signature)

      // Verify using universal function
      const isValid = await verifySignature({
        message: testMessage,
        signature: signatureHex,
        publicKey: publicKeyHex,
        algorithm: 'secp256k1',
      })
      expect(isValid).toBe(true)
    })

    test('should verify P-256 signature via universal function', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = p256.getPublicKey(privateKey, false)

      // Hash message
      const messageBytes = new TextEncoder().encode(testMessage)
      const messageHash = await crypto.subtle.digest('SHA-256', messageBytes)

      // Sign message
      const signature = p256.sign(new Uint8Array(messageHash), privateKey)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey)
      const signatureHex = bytesToHex(signature)

      // Verify using universal function
      const isValid = await verifySignature({
        message: testMessage,
        signature: signatureHex,
        publicKey: publicKeyHex,
        algorithm: 'P-256',
      })
      expect(isValid).toBe(true)
    })

    test('should verify Ed25519 signature via universal function', async () => {
      // Generate test key pair
      const privateKey = randomBytes(32)
      const publicKey = ed25519.getPublicKey(privateKey)

      // Sign message
      const messageBytes = new TextEncoder().encode(testMessage)
      const signature = ed25519.sign(messageBytes, privateKey)

      // Convert to hex strings
      const publicKeyHex = bytesToHex(publicKey)
      const signatureHex = bytesToHex(signature)

      // Verify using universal function
      const isValid = await verifySignature({
        message: testMessage,
        signature: signatureHex,
        publicKey: publicKeyHex,
        algorithm: 'Ed25519',
      })
      expect(isValid).toBe(true)
    })

    test('should throw UnsupportedAlgorithmError for invalid algorithm', async () => {
      await expect(
        verifySignature({
          message: testMessage,
          signature: '00'.repeat(64),
          publicKey: '04' + '00'.repeat(64),
          algorithm: 'RSA-2048' as any,
        })
      ).rejects.toThrow(UnsupportedAlgorithmError)
    })
  })

  describe('parsePublicKey()', () => {
    test('should parse hex public key', () => {
      const hexKey = '04' + 'a1b2c3'.repeat(21) + 'a1'
      const parsed = parsePublicKey(hexKey, 'hex')
      expect(parsed).toBe(hexKey)
    })

    test('should parse hex public key with 0x prefix', () => {
      const hexKey = '04' + 'a1b2c3'.repeat(21) + 'a1'
      const parsed = parsePublicKey('0x' + hexKey, 'hex')
      expect(parsed).toBe(hexKey)
    })

    test('should parse base64 public key', () => {
      const hexKey = '04' + 'a1b2c3'.repeat(21) + 'a1'
      const bytes = hexToBytes(hexKey)
      const base64 = btoa(String.fromCharCode(...bytes))

      const parsed = parsePublicKey(base64, 'base64')
      expect(parsed).toBe(hexKey)
    })

    test('should throw InvalidPublicKeyError for invalid format', () => {
      expect(() => parsePublicKey('invalid', 'invalid' as any)).toThrow(InvalidPublicKeyError)
    })
  })

  describe('parseSignature()', () => {
    test('should parse hex signature', () => {
      const hexSig = 'a1b2c3'.repeat(21) + 'a1b2'
      const parsed = parseSignature(hexSig, 'hex')
      expect(parsed).toBe(hexSig)
    })

    test('should parse hex signature with 0x prefix', () => {
      const hexSig = 'a1b2c3'.repeat(21) + 'a1b2'
      const parsed = parseSignature('0x' + hexSig, 'hex')
      expect(parsed).toBe(hexSig)
    })

    test('should parse base64 signature', () => {
      const hexSig = 'a1b2c3'.repeat(21) + 'a1b2'
      const bytes = hexToBytes(hexSig)
      const base64 = btoa(String.fromCharCode(...bytes))

      const parsed = parseSignature(base64, 'base64')
      expect(parsed).toBe(hexSig)
    })

    test('should throw InvalidSignatureFormatError for invalid format', () => {
      expect(() => parseSignature('invalid', 'invalid' as any)).toThrow(
        InvalidSignatureFormatError
      )
    })
  })

  describe('Error handling', () => {
    test('should return false for completely invalid signature data', async () => {
      const privateKey = randomBytes(32)
      const publicKey = secp256k1.getPublicKey(privateKey, false)
      const publicKeyHex = bytesToHex(publicKey)

      // Random garbage signature
      const garbageSignature = 'ff'.repeat(64)

      const isValid = await verifySecp256k1Signature(testMessage, garbageSignature, publicKeyHex)
      expect(isValid).toBe(false)
    })

    test('should throw for non-hex characters in signature', async () => {
      const publicKey = '04' + '00'.repeat(64)
      const invalidSignature = 'gg'.repeat(64) // non-hex characters

      await expect(
        verifySecp256k1Signature(testMessage, invalidSignature, publicKey)
      ).rejects.toThrow()
    })

    test('should throw for non-hex characters in public key', async () => {
      const signature = '00'.repeat(64)
      const invalidPublicKey = '04gg' + '00'.repeat(62) // non-hex characters

      await expect(
        verifySecp256k1Signature(testMessage, signature, invalidPublicKey)
      ).rejects.toThrow()
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
