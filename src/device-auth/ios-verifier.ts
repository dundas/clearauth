/**
 * iOS App Attest Verification
 *
 * Implements Apple App Attest attestation verification for iOS device authentication.
 * Verifies attestation objects, validates certificate chains against Apple root CA,
 * and extracts P-256 public keys from Secure Enclave.
 *
 * Apple App Attest Documentation:
 * https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity
 *
 * @module device-auth/ios-verifier
 */

import { decode as decodeCBOR } from 'cbor-x'
import { X509Certificate, X509ChainBuilder } from '@peculiar/x509'
import { verifySignature } from './signature-verifier.js'
import { APPLE_APP_ATTEST_ROOT_CA } from './apple-root-ca.js'

/**
 * OID (Object Identifier) for the App Attest nonce extension in certificates
 * This extension contains the challenge nonce used during attestation
 */
const APPLE_APP_ATTEST_NONCE_OID = '1.2.840.113635.100.8.2'

function toBuffer(value: unknown, fieldName: string): Buffer {
  if (Buffer.isBuffer(value)) {
    return value
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value)
  }
  throw new IOSAttestationError(`Missing or invalid ${fieldName}`)
}

function coseGet(coseKey: unknown, key: number): unknown {
  if (coseKey instanceof Map) {
    return coseKey.get(key)
  }
  if (coseKey && typeof coseKey === 'object') {
    return (coseKey as Record<string, unknown>)[String(key)]
  }
  return undefined
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return new Uint8Array(digest)
}

function readDerLength(bytes: Uint8Array, offset: number): { length: number; bytesRead: number } {
  if (offset >= bytes.length) {
    throw new IOSAttestationError('Invalid DER: truncated length')
  }
  const first = bytes[offset]
  if (first < 0x80) {
    return { length: first, bytesRead: 1 }
  }
  const numBytes = first & 0x7f
  if (numBytes === 0 || numBytes > 4 || offset + 1 + numBytes > bytes.length) {
    throw new IOSAttestationError('Invalid DER: unsupported length encoding')
  }
  let length = 0
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | bytes[offset + 1 + i]
  }
  return { length, bytesRead: 1 + numBytes }
}

function extractNonceFromDer(value: Uint8Array): Uint8Array {
  let data = value

  for (let depth = 0; depth < 3; depth++) {
    if (data.length < 2) break
    const tag = data[0]
    if (tag !== 0x04 && tag !== 0x30) break
    const { length, bytesRead } = readDerLength(data, 1)
    const headerLen = 1 + bytesRead
    if (headerLen + length > data.length) {
      throw new IOSAttestationError('Invalid DER: length exceeds buffer')
    }
    data = data.slice(headerLen, headerLen + length)
  }

  if (data.length === 32) {
    return data
  }

  for (let offset = 0; offset + 2 <= data.length; ) {
    const tag = data[offset]
    if (tag !== 0x04 && tag !== 0x30) {
      offset += 1
      continue
    }
    const { length, bytesRead } = readDerLength(data, offset + 1)
    const headerLen = 1 + bytesRead
    const start = offset + headerLen
    const end = start + length
    if (end > data.length) break
    const content = data.slice(start, end)
    if (tag === 0x04 && content.length === 32) {
      return content
    }
    offset = end
  }

  throw new IOSAttestationError('Unable to extract nonce from attestation certificate extension')
}

/**
 * Custom error for iOS attestation verification failures
 */
export class IOSAttestationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IOSAttestationError'
  }
}

/**
 * Attestation Object Structure (CBOR-encoded)
 */
export interface AttestationObject {
  /** Attestation format (should be "apple-appattest") */
  fmt: string
  /** Attestation statement containing certificate chain */
  attStmt: {
    /** X.509 certificate chain (DER-encoded) */
    x5c: Buffer[]
    /** Receipt data from App Attest */
    receipt?: Buffer
  }
  /** Authenticator data */
  authData: Buffer
}

/**
 * Authenticator Data Structure
 *
 * The authenticator data is a byte array with the following structure:
 * - RP ID Hash (32 bytes): SHA-256 hash of the relying party ID
 * - Flags (1 byte): Various flags
 * - Sign Count (4 bytes): Signature counter
 * - Attested Credential Data (variable): Contains the public key
 */
export interface AuthenticatorData {
  /** SHA-256 hash of relying party ID (App ID) */
  rpIdHash: Buffer
  /** Flags byte */
  flags: number
  /** Signature counter */
  signCount: number
  /** AAGUID (16 bytes) */
  aaguid: Buffer
  /** Credential ID length (2 bytes) */
  credentialIdLength: number
  /** Credential ID */
  credentialId: Buffer
  /** COSE-encoded public key */
  publicKeyCOSE: Buffer
}

/**
 * Parse App Attest attestation object from base64-encoded CBOR
 *
 * @param attestationBase64 - Base64-encoded CBOR attestation object
 * @returns Parsed attestation object
 * @throws {IOSAttestationError} If parsing fails or format is invalid
 */
export function parseAttestationObject(attestationBase64: string): AttestationObject {
  try {
    if (!attestationBase64 || attestationBase64.trim() === '') {
      throw new IOSAttestationError('Attestation object cannot be empty')
    }

    // Decode base64 to buffer
    const attestationBuffer = Buffer.from(attestationBase64, 'base64')

    // Decode CBOR
    const decoded = decodeCBOR(attestationBuffer) as unknown as AttestationObject

    // Validate structure
    if (!decoded.fmt) {
      throw new IOSAttestationError('Missing attestation format (fmt)')
    }

    if (decoded.fmt !== 'apple-appattest') {
      throw new IOSAttestationError(
        `Invalid attestation format: expected 'apple-appattest', got '${decoded.fmt}'`
      )
    }

    if (!decoded.attStmt) {
      throw new IOSAttestationError('Missing attestation statement (attStmt)')
    }

    if (!decoded.attStmt.x5c || !Array.isArray(decoded.attStmt.x5c)) {
      throw new IOSAttestationError('Missing or invalid certificate chain (x5c)')
    }

    const x5c = decoded.attStmt.x5c.map((item, index) => {
      try {
        return toBuffer(item, `certificate chain entry at index ${index}`)
      } catch {
        throw new IOSAttestationError(`Missing or invalid certificate chain (x5c) at index ${index}`)
      }
    })

    const authData = toBuffer(decoded.authData, 'authenticator data (authData)')

    return {
      fmt: decoded.fmt,
      attStmt: {
        x5c,
        receipt: decoded.attStmt.receipt ? toBuffer(decoded.attStmt.receipt, 'receipt') : undefined,
      },
      authData,
    }
  } catch (error) {
    if (error instanceof IOSAttestationError) {
      throw error
    }
    throw new IOSAttestationError(
      `Failed to parse attestation object: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Parse authenticator data structure
 *
 * @param authData - Raw authenticator data buffer
 * @returns Parsed authenticator data
 * @throws {IOSAttestationError} If parsing fails
 */
export function parseAuthenticatorData(authData: Buffer): AuthenticatorData {
  try {
    let offset = 0

    if (authData.length < 32 + 1 + 4) {
      throw new IOSAttestationError('Authenticator data too short')
    }

    // RP ID Hash (32 bytes)
    const rpIdHash = authData.slice(offset, offset + 32)
    offset += 32

    // Flags (1 byte)
    const flags = authData[offset]
    offset += 1

    // Sign Count (4 bytes, big-endian)
    const signCount = authData.readUInt32BE(offset)
    offset += 4

    // Check if attested credential data is present (bit 6 of flags)
    const hasAttestedCredentialData = (flags & 0x40) !== 0

    if (!hasAttestedCredentialData) {
      throw new IOSAttestationError('Authenticator data missing attested credential data')
    }

    if (authData.length < offset + 16 + 2) {
      throw new IOSAttestationError('Authenticator data too short for attested credential data')
    }

    // AAGUID (16 bytes)
    const aaguid = authData.slice(offset, offset + 16)
    offset += 16

    // Credential ID Length (2 bytes, big-endian)
    const credentialIdLength = authData.readUInt16BE(offset)
    offset += 2

    if (credentialIdLength <= 0) {
      throw new IOSAttestationError('Invalid credential ID length')
    }

    if (authData.length < offset + credentialIdLength) {
      throw new IOSAttestationError('Authenticator data truncated: credential ID exceeds buffer length')
    }

    // Credential ID
    const credentialId = authData.slice(offset, offset + credentialIdLength)
    offset += credentialIdLength

    // Public Key (COSE-encoded, rest of the buffer)
    const publicKeyCOSE = authData.slice(offset)

    if (publicKeyCOSE.length === 0) {
      throw new IOSAttestationError('Missing COSE public key in authenticator data')
    }

    return {
      rpIdHash,
      flags,
      signCount,
      aaguid,
      credentialIdLength,
      credentialId,
      publicKeyCOSE,
    }
  } catch (error) {
    if (error instanceof IOSAttestationError) {
      throw error
    }
    throw new IOSAttestationError(
      `Failed to parse authenticator data: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Extract P-256 public key from attestation
 *
 * Parses the COSE-encoded public key from the authenticator data.
 * COSE format for P-256:
 * - kty (1): 2 (EC2)
 * - alg (3): -7 (ES256)
 * - crv (-1): 1 (P-256)
 * - x (-2): x-coordinate (32 bytes)
 * - y (-3): y-coordinate (32 bytes)
 *
 * @param attestationBase64 - Base64-encoded CBOR attestation object
 * @returns P-256 public key in hex format (uncompressed, 0x04 + X + Y)
 * @throws {IOSAttestationError} If extraction fails
 */
export function extractPublicKeyFromAttestation(attestationBase64: string): string {
  try {
    // Parse attestation object
    const attestation = parseAttestationObject(attestationBase64)

    // Parse authenticator data
    const authData = parseAuthenticatorData(attestation.authData)

    // Decode COSE public key
    const coseKey = decodeCBOR(authData.publicKeyCOSE) as unknown

    // Validate key type (EC2 = 2)
    const kty = coseGet(coseKey, 1)
    if (kty !== 2) {
      throw new IOSAttestationError(`Invalid key type: expected 2 (EC2), got ${kty}`)
    }

    // Validate algorithm (ES256 = -7)
    const alg = coseGet(coseKey, 3)
    if (alg !== -7) {
      throw new IOSAttestationError(`Invalid algorithm: expected -7 (ES256), got ${alg}`)
    }

    // Validate curve (P-256 = 1)
    const crv = coseGet(coseKey, -1)
    if (crv !== 1) {
      throw new IOSAttestationError(`Invalid curve: expected 1 (P-256), got ${crv}`)
    }

    // Extract x and y coordinates
    const x = coseGet(coseKey, -2)
    const y = coseGet(coseKey, -3)

    if (!x || !y) {
      throw new IOSAttestationError('Missing x or y coordinate in public key')
    }

    const xBuf = toBuffer(x, 'x coordinate')
    const yBuf = toBuffer(y, 'y coordinate')

    if (xBuf.length !== 32 || yBuf.length !== 32) {
      throw new IOSAttestationError('Invalid coordinate length: expected 32 bytes each')
    }

    // Create uncompressed public key (0x04 + x + y)
    const publicKey = Buffer.concat([Buffer.from([0x04]), xBuf, yBuf])

    return publicKey.toString('hex')
  } catch (error) {
    if (error instanceof IOSAttestationError) {
      throw error
    }
    throw new IOSAttestationError(
      `Failed to extract public key: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Verify certificate chain against Apple Root CA
 *
 * The certificate chain should:
 * 1. Be valid (not expired)
 * 2. Have valid signatures
 * 3. Terminate at the Apple App Attest Root CA
 *
 * Apple App Attest Root CA can be downloaded from:
 * https://www.apple.com/certificateauthority/
 *
 * @param certificateChain - Array of DER-encoded certificates
 * @throws {IOSAttestationError} If verification fails
 */
export async function verifyCertificateChain(
  certificateChain: Array<Buffer | Uint8Array | string>,
  options?: {
    trustedRoots?: Array<Buffer | Uint8Array | string>
  }
): Promise<void> {
  try {
    if (!certificateChain || certificateChain.length === 0) {
      throw new IOSAttestationError('Certificate chain is empty')
    }

    // Convert to X509Certificate objects
    const certs = certificateChain.map((cert, index) => {
      try {
        return new X509Certificate(cert as any)
      } catch (error) {
        throw new IOSAttestationError(
          `Failed to parse certificate at index ${index}: ${error instanceof Error ? error.message : 'unknown'}`
        )
      }
    })

    const now = new Date()
    const trustedRoots = (options?.trustedRoots?.length
      ? options.trustedRoots
      : [APPLE_APP_ATTEST_ROOT_CA]
    ).map((root, index) => {
      try {
        return new X509Certificate(root as any)
      } catch (error) {
        throw new IOSAttestationError(
          `Failed to parse trusted root at index ${index}: ${error instanceof Error ? error.message : 'unknown'}`
        )
      }
    })

    const chainBuilder = new X509ChainBuilder({
      certificates: [...certs.slice(1), ...trustedRoots],
    })

    const leafCert = certs[0]
    const chain = await chainBuilder.build(leafCert)

    for (let i = 0; i < chain.length; i++) {
      const cert = chain[i]
      const notBefore = new Date(cert.notBefore)
      const notAfter = new Date(cert.notAfter)

      if (now < notBefore) {
        throw new IOSAttestationError(`Certificate ${i} is not yet valid`)
      }

      if (now > notAfter) {
        throw new IOSAttestationError(`Certificate ${i} has expired`)
      }
    }

    const chainRoot = chain[chain.length - 1]
    const chainRootThumbprint = new Uint8Array(await chainRoot.getThumbprint())

    let matchesTrustAnchor = false
    for (const root of trustedRoots) {
      const thumbprint = new Uint8Array(await root.getThumbprint())
      if (bytesEqual(chainRootThumbprint, thumbprint)) {
        matchesTrustAnchor = true
        break
      }
    }

    if (!matchesTrustAnchor) {
      throw new IOSAttestationError('Certificate chain does not terminate at a trusted Apple root CA')
    }

  } catch (error) {
    if (error instanceof IOSAttestationError) {
      throw error
    }
    throw new IOSAttestationError(
      `Certificate chain verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
    )
  }
}

/**
 * Verify iOS App Attest attestation
 *
 * Complete verification flow:
 * 1. Parse attestation object
 * 2. Verify certificate chain
 * 3. Extract public key
 * 4. Verify challenge signature
 *
 * @param payload - Attestation payload from iOS client
 * @returns Object with verification result and extracted public key
 */
export async function verifyIOSAttestation(payload: {
  attestation: string
  challenge: string
  signature: string
  keyId: string
}, options?: {
  trustedRoots?: Array<Buffer | Uint8Array | string>
}): Promise<{
  valid: boolean
  publicKey: string | null
  error?: string
}> {
  try {
    // Parse attestation object
    const attestation = parseAttestationObject(payload.attestation)

    // Verify certificate chain
    await verifyCertificateChain(attestation.attStmt.x5c, {
      trustedRoots: options?.trustedRoots,
    })

    const authData = parseAuthenticatorData(attestation.authData)

    // Bind the request keyId to the credentialId embedded in authenticator data
    const keyIdBytes = (() => {
      const raw = payload.keyId.trim()
      const hex = raw.replace(/^0x/i, '')
      if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
        return Buffer.from(hex, 'hex')
      }

      const normalized = raw.replace(/-/g, '+').replace(/_/g, '/')
      if (!/^[A-Za-z0-9+/]+=*$/.test(normalized)) {
        return Buffer.alloc(0)
      }

      const padLen = (4 - (normalized.length % 4)) % 4
      const padded = normalized + '='.repeat(padLen)
      return Buffer.from(padded, 'base64')
    })()

    if (keyIdBytes.length === 0) {
      throw new IOSAttestationError('Invalid keyId encoding')
    }

    if (!bytesEqual(keyIdBytes, authData.credentialId)) {
      throw new IOSAttestationError('keyId does not match attestation credentialId')
    }

    // Extract public key
    const publicKey = extractPublicKeyFromAttestation(payload.attestation)

    // Verify attestation nonce binds authData to clientDataHash (challenge)
    const leafCertDer = attestation.attStmt.x5c[0]
    const leafCert = new X509Certificate(leafCertDer as any)
    const nonceExt = leafCert.getExtension(APPLE_APP_ATTEST_NONCE_OID)
    if (!nonceExt) {
      throw new IOSAttestationError('Missing App Attest nonce extension in certificate')
    }

    const certNonce = extractNonceFromDer(new Uint8Array(nonceExt.value))
    const clientDataHash = await sha256(new TextEncoder().encode(payload.challenge))
    const expectedNonce = await sha256(
      Buffer.concat([attestation.authData, Buffer.from(clientDataHash)])
    )

    if (!bytesEqual(certNonce, expectedNonce)) {
      throw new IOSAttestationError('Attestation nonce does not match expected challenge hash')
    }

    // Verify challenge signature using extracted public key (P-256)
    const okSig = await verifySignature({
      message: payload.challenge,
      signature: payload.signature,
      publicKey,
      algorithm: 'P-256',
    })

    if (!okSig) {
      throw new IOSAttestationError('Challenge signature verification failed')
    }

    return {
      valid: true,
      publicKey,
    }
  } catch (error) {
    return {
      valid: false,
      publicKey: null,
      error: error instanceof Error ? error.message : 'unknown error',
    }
  }
}
