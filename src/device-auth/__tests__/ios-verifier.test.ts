/**
 * iOS App Attest Verification Tests
 *
 * Unit tests for iOS App Attest parsing and verification. These tests use
 * locally generated certificates to avoid relying on Apple PKI at test time.
 */

import { describe, it, expect } from 'vitest'
import { encode as encodeCBOR } from 'cbor-x'
import { randomBytes } from '@noble/hashes/utils.js'
import { p256 } from '@noble/curves/nist.js'
import {
  BasicConstraintsExtension,
  Extension,
  X509Certificate,
  X509CertificateGenerator,
} from '@peculiar/x509'
import {
  parseAttestationObject,
  extractPublicKeyFromAttestation,
  verifyCertificateChain,
  verifyIOSAttestation,
  IOSAttestationError,
} from '../ios-verifier.js'

const NONCE_OID = '1.2.840.113635.100.8.2'

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function derOctetString(payload: Uint8Array): Uint8Array {
  if (payload.length > 127) {
    throw new Error('Test helper only supports short lengths')
  }
  return Uint8Array.from([0x04, payload.length, ...payload])
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(digest)
}

function makeAttestationBase64(options: {
  authData: Buffer
  leafCertDer: Buffer
}): string {
  const attestationObject = {
    fmt: 'apple-appattest',
    attStmt: {
      x5c: [options.leafCertDer],
    },
    authData: options.authData,
  }

  return Buffer.from(encodeCBOR(attestationObject)).toString('base64')
}

async function createTestRootCA(): Promise<{ keys: CryptoKeyPair; cert: X509Certificate; der: Buffer }> {
  const keys = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair

  const cert = await X509CertificateGenerator.createSelfSigned({
    name: 'CN=Test Root CA',
    keys,
    extensions: [new BasicConstraintsExtension(true, undefined, true)],
  })

  return { keys, cert, der: Buffer.from(new Uint8Array(cert.rawData)) }
}

async function createTestLeafCert(options: {
  issuerName: string
  issuerKey: CryptoKey
  nonce: Uint8Array
  notBefore?: Date
  notAfter?: Date
}): Promise<{ cert: X509Certificate; der: Buffer }> {
  const leafKeys = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair

  const cert = await X509CertificateGenerator.create({
    subject: 'CN=Test Leaf',
    issuer: options.issuerName,
    publicKey: leafKeys.publicKey,
    signingKey: options.issuerKey,
    notBefore: options.notBefore,
    notAfter: options.notAfter,
    extensions: [
      new BasicConstraintsExtension(false),
      new Extension(NONCE_OID, false, derOctetString(options.nonce)),
    ],
  })

  return { cert, der: Buffer.from(new Uint8Array(cert.rawData)) }
}

function buildAuthenticatorData(options: {
  credentialId: Buffer
  publicKeyCOSE: Buffer
}): Buffer {
  const rpIdHash = Buffer.from(randomBytes(32))
  const flags = Buffer.from([0x40]) // attested credential data
  const signCount = Buffer.alloc(4)
  signCount.writeUInt32BE(0, 0)
  const aaguid = Buffer.alloc(16)
  const credLen = Buffer.alloc(2)
  credLen.writeUInt16BE(options.credentialId.length, 0)

  return Buffer.concat([
    rpIdHash,
    flags,
    signCount,
    aaguid,
    credLen,
    options.credentialId,
    options.publicKeyCOSE,
  ])
}

describe('parseAttestationObject', () => {
  it('parses a valid CBOR attestation object', () => {
    const authData = Buffer.from('00', 'hex')
    const leafCertDer = Buffer.from('01', 'hex')
    const base64 = makeAttestationBase64({ authData, leafCertDer })

    const parsed = parseAttestationObject(base64)
    expect(parsed.fmt).toBe('apple-appattest')
    expect(parsed.attStmt.x5c).toHaveLength(1)
    expect(Buffer.isBuffer(parsed.authData)).toBe(true)
  })

  it('throws for invalid base64/CBOR', () => {
    expect(() => parseAttestationObject('not!!!valid!!!base64!!!')).toThrow(IOSAttestationError)
  })

  it('throws for empty attestation', () => {
    expect(() => parseAttestationObject('')).toThrow(IOSAttestationError)
  })
})

describe('extractPublicKeyFromAttestation', () => {
  it('extracts P-256 public key in uncompressed hex format', () => {
    const privateKey = randomBytes(32)
    const publicKey = p256.getPublicKey(privateKey, false) // uncompressed (04 || X || Y)
    const x = Buffer.from(publicKey.slice(1, 33))
    const y = Buffer.from(publicKey.slice(33, 65))

    const coseKey = new Map<number, unknown>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, x],
      [-3, y],
    ])
    const publicKeyCOSE = Buffer.from(encodeCBOR(coseKey))
    const credentialId = Buffer.from(randomBytes(16))
    const authData = buildAuthenticatorData({ credentialId, publicKeyCOSE })

    const base64 = makeAttestationBase64({ authData, leafCertDer: Buffer.from('01', 'hex') })
    const extracted = extractPublicKeyFromAttestation(base64)

    expect(extracted).toBe(bytesToHex(publicKey))
  })
})

describe('verifyCertificateChain', () => {
  it('verifies a valid chain that terminates at a trusted root', async () => {
    const root = await createTestRootCA()
    const leaf = await createTestLeafCert({
      issuerName: root.cert.subject,
      issuerKey: root.keys.privateKey,
      nonce: randomBytes(32),
    })

    await expect(
      verifyCertificateChain([leaf.der], { trustedRoots: [root.der] })
    ).resolves.toBeUndefined()
  })

  it('rejects a chain that does not terminate at a trusted root', async () => {
    const trusted = await createTestRootCA()
    const untrusted = await createTestRootCA()

    const leaf = await createTestLeafCert({
      issuerName: untrusted.cert.subject,
      issuerKey: untrusted.keys.privateKey,
      nonce: randomBytes(32),
    })

    await expect(
      verifyCertificateChain([leaf.der], { trustedRoots: [trusted.der] })
    ).rejects.toThrow(IOSAttestationError)
  })

  it('rejects expired certificates', async () => {
    const root = await createTestRootCA()
    const leaf = await createTestLeafCert({
      issuerName: root.cert.subject,
      issuerKey: root.keys.privateKey,
      nonce: randomBytes(32),
      notBefore: new Date(Date.now() - 10_000),
      notAfter: new Date(Date.now() - 5_000),
    })

    await expect(
      verifyCertificateChain([leaf.der], { trustedRoots: [root.der] })
    ).rejects.toThrow(IOSAttestationError)
  })
})

describe('verifyIOSAttestation', () => {
  it('returns public key for a valid attestation bound to challenge', async () => {
    const challenge = 'challenge|1705326960000'

    // Attested keypair (used to sign the challenge and embedded in authData COSE key)
    const attestedPrivateKey = randomBytes(32)
    const attestedPublicKey = p256.getPublicKey(attestedPrivateKey, false)
    const x = Buffer.from(attestedPublicKey.slice(1, 33))
    const y = Buffer.from(attestedPublicKey.slice(33, 65))
    const coseKey = new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, x],
      [-3, y],
    ])
    const publicKeyCOSE = Buffer.from(encodeCBOR(coseKey))

    const credentialId = Buffer.from(randomBytes(16))
    const authData = buildAuthenticatorData({ credentialId, publicKeyCOSE })

    const clientDataHash = await sha256(new TextEncoder().encode(challenge))
    const nonce = await sha256(Buffer.concat([authData, Buffer.from(clientDataHash)]))

    const root = await createTestRootCA()
    const leaf = await createTestLeafCert({
      issuerName: root.cert.subject,
      issuerKey: root.keys.privateKey,
      nonce,
    })

    const attestation = makeAttestationBase64({ authData, leafCertDer: leaf.der })

    // Sign sha256(challenge) to match signature-verifier test convention
    const challengeHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge))
    const signature = p256.sign(new Uint8Array(challengeHash), attestedPrivateKey)

    const result = await verifyIOSAttestation(
      {
        attestation,
        challenge,
        signature: bytesToHex(signature),
        keyId: credentialId.toString('base64'),
      },
      { trustedRoots: [root.der] }
    )

    expect(result.valid).toBe(true)
    expect(result.publicKey).toBe(bytesToHex(attestedPublicKey))
  })

  it('rejects when the challenge does not match the attestation nonce', async () => {
    const challenge = 'challenge|1705326960000'
    const badChallenge = 'challenge|1705326969999'

    const attestedPrivateKey = randomBytes(32)
    const attestedPublicKey = p256.getPublicKey(attestedPrivateKey, false)
    const x = Buffer.from(attestedPublicKey.slice(1, 33))
    const y = Buffer.from(attestedPublicKey.slice(33, 65))
    const coseKey = new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, x],
      [-3, y],
    ])
    const publicKeyCOSE = Buffer.from(encodeCBOR(coseKey))

    const credentialId = Buffer.from(randomBytes(16))
    const authData = buildAuthenticatorData({ credentialId, publicKeyCOSE })

    const clientDataHash = await sha256(new TextEncoder().encode(challenge))
    const nonce = await sha256(Buffer.concat([authData, Buffer.from(clientDataHash)]))

    const root = await createTestRootCA()
    const leaf = await createTestLeafCert({
      issuerName: root.cert.subject,
      issuerKey: root.keys.privateKey,
      nonce,
    })
    const attestation = makeAttestationBase64({ authData, leafCertDer: leaf.der })

    const challengeHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(badChallenge))
    const signature = p256.sign(new Uint8Array(challengeHash), attestedPrivateKey)

    const result = await verifyIOSAttestation(
      {
        attestation,
        challenge: badChallenge,
        signature: bytesToHex(signature),
        keyId: credentialId.toString('base64'),
      },
      { trustedRoots: [root.der] }
    )

    expect(result.valid).toBe(false)
    expect(result.publicKey).toBe(null)
  })

  it('rejects when keyId does not match credentialId', async () => {
    const challenge = 'challenge|1705326960000'

    const attestedPrivateKey = randomBytes(32)
    const attestedPublicKey = p256.getPublicKey(attestedPrivateKey, false)
    const x = Buffer.from(attestedPublicKey.slice(1, 33))
    const y = Buffer.from(attestedPublicKey.slice(33, 65))
    const coseKey = new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, x],
      [-3, y],
    ])
    const publicKeyCOSE = Buffer.from(encodeCBOR(coseKey))

    const credentialId = Buffer.from(randomBytes(16))
    const authData = buildAuthenticatorData({ credentialId, publicKeyCOSE })

    const clientDataHash = await sha256(new TextEncoder().encode(challenge))
    const nonce = await sha256(Buffer.concat([authData, Buffer.from(clientDataHash)]))

    const root = await createTestRootCA()
    const leaf = await createTestLeafCert({
      issuerName: root.cert.subject,
      issuerKey: root.keys.privateKey,
      nonce,
    })

    const attestation = makeAttestationBase64({ authData, leafCertDer: leaf.der })

    const challengeHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge))
    const signature = p256.sign(new Uint8Array(challengeHash), attestedPrivateKey)

    const result = await verifyIOSAttestation(
      {
        attestation,
        challenge,
        signature: bytesToHex(signature),
        keyId: Buffer.from(randomBytes(16)).toString('base64'),
      },
      { trustedRoots: [root.der] }
    )

    expect(result.valid).toBe(false)
    expect(result.publicKey).toBe(null)
  })
})

