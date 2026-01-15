/**
 * Device Authentication Types
 *
 * Type definitions for device key authentication using hardware-backed keys.
 * Supports Web3 wallets (MetaMask, SeedID), iOS (Secure Enclave), and Android (KeyStore).
 */

import type { Device, Challenge as DatabaseChallenge } from '../database/schema'

/**
 * Device Platform Types
 */
export type DevicePlatform = 'web3' | 'ios' | 'android'

/**
 * Cryptographic Algorithm Types
 */
export type KeyAlgorithm = 'secp256k1' | 'Ed25519' | 'P-256'

/**
 * Device Status Types
 */
export type DeviceStatus = 'active' | 'revoked'

/**
 * Challenge Response
 *
 * Response returned when generating a new challenge for device authentication.
 */
export interface ChallengeResponse {
  /**
   * Full challenge string in format: nonce|timestamp
   * This must be signed by the device's private key
   */
  challenge: string

  /**
   * Expiration time in seconds (typically 600 = 10 minutes)
   */
  expiresIn: number

  /**
   * Challenge creation timestamp (ISO 8601)
   */
  createdAt: string
}

/**
 * Device Registration Request
 *
 * Request payload for registering a new device.
 */
export interface DeviceRegistrationRequest {
  /**
   * Device platform
   */
  platform: DevicePlatform

  /**
   * Public key in appropriate format for the key algorithm
   * - secp256k1: hex string (0x-prefixed or raw hex)
   * - P-256: PEM, DER, or JWK format
   * - Ed25519: hex string or base64
   */
  publicKey: string

  /**
   * Cryptographic algorithm used by the device
   */
  keyAlgorithm: KeyAlgorithm

  /**
   * Ethereum wallet address (required for Web3, null for iOS/Android)
   */
  walletAddress?: string | null

  /**
   * Challenge that was issued to the device
   */
  challenge: string

  /**
   * Signature of the challenge using the device's private key
   * Format depends on the key algorithm:
   * - secp256k1: hex string (0x-prefixed or raw)
   * - P-256: DER-encoded signature
   * - Ed25519: hex string or base64
   */
  signature: string
}

/**
 * Device Registration Response
 *
 * Response returned after successfully registering a device.
 */
export interface DeviceRegistrationResponse {
  /**
   * Unique device identifier
   */
  deviceId: string

  /**
   * User ID this device is associated with
   */
  userId: string

  /**
   * Device platform
   */
  platform: DevicePlatform

  /**
   * Device status
   */
  status: DeviceStatus

  /**
   * Registration timestamp (ISO 8601)
   */
  registeredAt: string
}

/**
 * Device Authentication Request
 *
 * Request payload for authenticating with a registered device.
 */
export interface DeviceAuthenticationRequest {
  /**
   * Device identifier
   */
  deviceId: string

  /**
   * Challenge that was issued to the device
   */
  challenge: string

  /**
   * Signature of the challenge using the device's private key
   */
  signature: string
}

/**
 * Device Info
 *
 * Public device information (safe to expose to client).
 */
export interface DeviceInfo {
  deviceId: string
  platform: DevicePlatform
  keyAlgorithm: KeyAlgorithm
  status: DeviceStatus
  registeredAt: string
  lastUsedAt: string | null
}

/**
 * Type guard: Check if a string is a valid DevicePlatform
 */
export function isDevicePlatform(value: string): value is DevicePlatform {
  return value === 'web3' || value === 'ios' || value === 'android'
}

/**
 * Type guard: Check if a string is a valid KeyAlgorithm
 */
export function isKeyAlgorithm(value: string): value is KeyAlgorithm {
  return value === 'secp256k1' || value === 'Ed25519' || value === 'P-256'
}

/**
 * Type guard: Check if a string is a valid DeviceStatus
 */
export function isDeviceStatus(value: string): value is DeviceStatus {
  return value === 'active' || value === 'revoked'
}

/**
 * Convert database Device to DeviceInfo
 */
export function toDeviceInfo(device: Device): DeviceInfo {
  return {
    deviceId: device.device_id,
    platform: device.platform as DevicePlatform,
    keyAlgorithm: device.key_algorithm as KeyAlgorithm,
    status: device.status as DeviceStatus,
    registeredAt: device.registered_at.toISOString(),
    lastUsedAt: device.last_used_at ? device.last_used_at.toISOString() : null,
  }
}

/**
 * Export database types for convenience
 */
export type { Device, DatabaseChallenge }
