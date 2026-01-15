# PRD-0004: Device Key Authentication

**Status**: Draft
**Created**: 2026-01-15
**Target Version**: 0.6.0
**Priority**: High
**Estimated Effort**: 3-4 weeks (~200 developer hours)

---

## Introduction

Add **phishing-resistant, hardware-backed device key authentication** to ClearAuth, enabling users to authenticate using cryptographic keys stored on their devices instead of passwords. This provides a more secure authentication method that prevents phishing, replay attacks, and MITM attacks while maintaining excellent user experience through biometric integration.

### Problem Statement

Current authentication methods in ClearAuth (email/password, OAuth, JWT tokens) have fundamental security weaknesses:
- **Passwords are phishable**: Users can be tricked into entering credentials on fake sites
- **Replay attacks possible**: Stolen credentials can be reused
- **MITM vulnerable**: Passwords transmitted over network can be intercepted
- **No hardware backing**: Authentication relies on knowledge (password) rather than possession (device)

Device key authentication solves these problems by:
- Private keys never leave the device
- Every request cryptographically signed
- Hardware-backed keys (Secure Enclave, StrongBox, Wallets)
- Biometric gating (Face ID, Touch ID, fingerprint)

### Target Users

1. **Security-conscious users**: Want maximum security for their accounts
2. **Web3 users**: Already have wallets (MetaMask, SeedID) and understand cryptographic authentication
3. **Mobile app users**: iOS and Android native app users who benefit from hardware-backed authentication
4. **Enterprise users**: Organizations requiring phishing-resistant authentication

---

## Goals

### Primary Goals

1. **Enable Web3 Wallet Authentication** (Week 1 - MVP)
   - Users can sign in with MetaMask, SeedID Wallet, or any EIP-191 compatible wallet
   - Fastest path to production (3-5 days)

2. **Enable iOS Device Authentication** (Week 2)
   - Users authenticate with keys in Apple Secure Enclave
   - Integration with App Attest for device verification

3. **Enable Android Device Authentication** (Week 3)
   - Users authenticate with keys in Android KeyStore
   - Integration with Play Integrity API for device verification

4. **Multi-Device Support**
   - Each device gets unique cryptographic key pair
   - Users can manage multiple devices (phone, tablet, desktop wallet)
   - Device-specific audit trail

5. **Backwards Compatibility**
   - Works alongside existing email/password authentication
   - Integrates with JWT infrastructure from v0.5.0
   - No breaking changes to existing APIs

### Secondary Goals

1. **Device Management**
   - List all registered devices
   - Revoke individual devices
   - View last-used timestamps

2. **Security Hardening**
   - Challenge-response flow prevents replay attacks
   - Signature verification on every request
   - Hardware attestation proves device authenticity

3. **Developer Experience**
   - Clear API for device registration
   - Simple client SDKs for Web3, iOS, Android
   - Comprehensive documentation with examples

---

## User Stories

### Web3 Users

**As a Web3 user**
I want to sign in with my MetaMask wallet
So that I don't need to create another password and can use my existing Web3 identity

**As a Web3 user**
I want to sign requests with my wallet key
So that my API requests are cryptographically authenticated and cannot be replayed

**As a SeedID user**
I want to derive device keys from my seed phrase
So that I can recover access on new devices without server-side backup

### iOS Users

**As an iOS user**
I want to register my iPhone using Face ID
So that I can authenticate securely without typing passwords

**As an iOS user**
I want my private key stored in Secure Enclave
So that even if my phone is compromised, my key cannot be extracted

**As an iOS user**
I want to see which devices have access to my account
So that I can revoke access if I lose a device

### Android Users

**As an Android user**
I want to register my Android device using fingerprint
So that I have biometric-gated authentication

**As an Android user**
I want my key backed by StrongBox (if available)
So that I have hardware-level security

### Developers

**As a developer integrating ClearAuth**
I want clear examples for Web3, iOS, and Android
So that I can implement device authentication quickly

**As a developer**
I want device authentication to work alongside existing auth methods
So that I can gradually migrate users

---

## Functional Requirements

### FR1: Challenge-Response Authentication Flow

**Description**: Implement nonce-based challenge-response to prevent replay attacks

**Requirements**:
1.1. `POST /auth/challenge` endpoint generates cryptographic nonce
1.2. Challenge format: `{nonce}|{timestamp}`
1.3. Nonce must be unique (32 bytes random)
1.4. Challenge expires after 10 minutes
1.5. Challenge stored in Redis/database with TTL
1.6. Each challenge can only be used once (consumed on verification)

**Acceptance Criteria**:
- ✅ Challenge endpoint returns fresh nonce + timestamp
- ✅ Same challenge never returned twice
- ✅ Expired challenges rejected (> 10 minutes)
- ✅ Used challenges rejected on reuse

---

### FR2: Web3 Wallet Device Registration

**Description**: Allow users to register Web3 wallets (MetaMask, SeedID) as authentication devices

**Requirements**:
2.1. `POST /auth/device/register` endpoint accepts Web3 registration
2.2. Verify EIP-191 signature format
2.3. Recover Ethereum address from signature
2.4. Verify recovered address matches claimed wallet address
2.5. Support secp256k1 curve (Ethereum standard)
2.6. Create device record with wallet address as public key identifier
2.7. Issue device-bound JWT token

**Request Format**:
```json
{
  "platform": "web3",
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42a0d",
  "signature": "0x1234567890abcdef...",
  "challenge": "nonce_xyz123|1705326960000"
}
```

**Response Format**:
```json
{
  "deviceId": "dev_web3_abc123",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "ref_token_xyz",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

**Acceptance Criteria**:
- ✅ MetaMask wallet registration works
- ✅ SeedID wallet registration works
- ✅ Invalid signatures rejected
- ✅ Address mismatch rejected
- ✅ Device-bound JWT issued
- ✅ Wallet address stored as device identifier

---

### FR3: iOS Device Registration

**Description**: Allow iOS users to register devices using App Attest + Secure Enclave

**Requirements**:
3.1. `POST /auth/device/register` endpoint accepts iOS registration
3.2. Verify iOS App Attest attestation object
3.3. Validate certificate chain to Apple root CA
3.4. Extract public key from attestation
3.5. Verify assertion signature matches attestation
3.6. Support P-256 curve (Apple Secure Enclave standard)
3.7. Create device record with extracted public key
3.8. Issue device-bound JWT token

**Request Format**:
```json
{
  "platform": "ios",
  "keyId": "xyz123abc",
  "attestation": "base64_encoded_attestation_object",
  "signature": "base64_encoded_signature",
  "challenge": "nonce_xyz123|1705326960000",
  "userId": "user-123"
}
```

**Acceptance Criteria**:
- ✅ App Attest attestation verified
- ✅ Certificate chain validated
- ✅ Public key extracted correctly
- ✅ Signature verification works
- ✅ Invalid attestations rejected
- ✅ Device-bound JWT issued

---

### FR4: Android Device Registration

**Description**: Allow Android users to register devices using KeyStore + Play Integrity

**Requirements**:
4.1. `POST /auth/device/register` endpoint accepts Android registration
4.2. Verify Google Play Integrity token
4.3. Decode JWT token from Play Integrity API
4.4. Validate token signature with Google public keys
4.5. Extract device verdict (meets integrity requirements)
4.6. Support P-256 curve (Android KeyStore standard)
4.7. Accept user-provided public key (from KeyStore)
4.8. Create device record with provided public key
4.9. Issue device-bound JWT token

**Request Format**:
```json
{
  "platform": "android",
  "integrityToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6ImtleTEifQ...",
  "publicKey": "base64_encoded_public_key",
  "signature": "base64_encoded_signature",
  "challenge": "nonce_abc456|1705326960000",
  "userId": "user-123"
}
```

**Acceptance Criteria**:
- ✅ Play Integrity token verified
- ✅ Token signature validated
- ✅ Device verdict checked (meets integrity)
- ✅ Public key stored correctly
- ✅ Signature verification works
- ✅ Invalid tokens rejected
- ✅ Device-bound JWT issued

---

### FR5: Device-Bound JWT Tokens

**Description**: Enhance JWT tokens to bind them to specific devices

**Requirements**:
5.1. Add `device_id` claim to JWT payload
5.2. Add `device_key_binding` claim with algorithm and public key thumbprint
5.3. Public key thumbprint: SHA-256 hash of public key
5.4. Token verification must check device exists and is active
5.5. Revoked devices must immediately invalidate tokens
5.6. Reuse existing JWT infrastructure from v0.5.0

**JWT Payload Format**:
```json
{
  "sub": "user-123",
  "device_id": "dev_web3_abc123",
  "device_key_binding": {
    "algorithm": "secp256k1",
    "public_key_thumbprint": "sha256_hash_of_public_key"
  },
  "iat": 1705326960,
  "exp": 1705330560
}
```

**Acceptance Criteria**:
- ✅ Tokens include device_id claim
- ✅ Tokens include device_key_binding
- ✅ Token validation checks device status
- ✅ Revoked device tokens rejected immediately
- ✅ Backwards compatible with existing JWT tokens (device_id optional)

---

### FR6: Request Signature Verification Middleware

**Description**: Verify every API request is cryptographically signed by the device

**Requirements**:
6.1. Create Express/Hono/Elysia middleware for signature verification
6.2. Extract signature from `X-Signature` header
6.3. Extract challenge from `X-Challenge` header
6.4. Reconstruct signed payload: `{method}{path}{body}{challenge}`
6.5. Verify signature using device's public key
6.6. Verify challenge freshness (< 60 seconds)
6.7. Support multiple signature algorithms (secp256k1, Ed25519, P-256)
6.8. Reject unsigned requests to protected endpoints

**Request Headers**:
```http
Authorization: Bearer {jwt_token}
X-Signature: {base64_signature}
X-Challenge: {nonce|timestamp}
```

**Acceptance Criteria**:
- ✅ Middleware extracts headers correctly
- ✅ Signature verification works for all supported curves
- ✅ Expired challenges rejected
- ✅ Invalid signatures rejected
- ✅ Missing headers rejected
- ✅ Unsigned requests to protected endpoints rejected

---

### FR7: Multi-Device Support

**Description**: Allow users to register and manage multiple devices

**Requirements**:
7.1. User can register unlimited devices
7.2. Each device has unique device_id
7.3. Each device has unique public key
7.4. Device metadata: platform, registered_at, last_used_at, status
7.5. Devices independent (revoking one doesn't affect others)
7.6. Clear audit trail of which device performed which action

**Acceptance Criteria**:
- ✅ Users can register multiple devices
- ✅ Each device gets unique ID
- ✅ Device list shows all registered devices
- ✅ Last-used timestamp updated on each request
- ✅ Revoking one device doesn't affect others

---

### FR8: Device Management API

**Description**: Allow users to view and manage their registered devices

**Requirements**:
8.1. `GET /auth/devices` - List all user's devices
8.2. `DELETE /auth/devices/{device_id}` - Revoke specific device
8.3. `DELETE /auth/devices` (with deviceId in body) - Alternative revoke endpoint
8.4. Revocation immediately invalidates all tokens for that device
8.5. Revoked devices marked as `status: "revoked"` (soft delete)
8.6. Last-used timestamp updated on every authenticated request

**GET /auth/devices Response**:
```json
{
  "devices": [
    {
      "deviceId": "dev_web3_abc123",
      "platform": "web3",
      "walletAddress": "0x742d35Cc...",
      "registeredAt": 1705326960000,
      "lastUsedAt": 1705330560000,
      "status": "active"
    },
    {
      "deviceId": "dev_ios_xyz789",
      "platform": "ios",
      "registeredAt": 1705240560000,
      "lastUsedAt": 1705327000000,
      "status": "active"
    }
  ]
}
```

**Acceptance Criteria**:
- ✅ List endpoint returns all user devices
- ✅ Revoke endpoint works
- ✅ Revoked device tokens immediately invalid
- ✅ Revoked devices shown with status "revoked"
- ✅ Last-used timestamp accurate

---

### FR9: Database Schema

**Description**: Create database tables for device storage

**Requirements**:
9.1. Create `devices` table
9.2. Columns: device_id, user_id, platform, public_key, wallet_address, key_algorithm, status, registered_at, last_used_at, created_at
9.3. Create `challenges` table (or use Redis)
9.4. Columns: nonce, challenge, created_at, expires_at
9.5. Indexes: idx_devices_user_id, idx_devices_status, idx_challenges_expires_at
9.6. Migration script for PostgreSQL
9.7. Migration script for SQLite (Turso, D1)
9.8. Migration script for MySQL (PlanetScale)

**Schema**:
```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,  -- 'web3' | 'ios' | 'android'
  public_key TEXT NOT NULL,
  wallet_address TEXT,  -- For web3 only
  key_algorithm TEXT NOT NULL,  -- 'secp256k1' | 'Ed25519' | 'P-256'
  status TEXT DEFAULT 'active',  -- 'active' | 'revoked'
  registered_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE challenges (
  nonce TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_challenges_expires_at ON challenges(expires_at);
```

**Acceptance Criteria**:
- ✅ PostgreSQL migration works
- ✅ SQLite migration works
- ✅ MySQL migration works
- ✅ All indexes created
- ✅ Foreign keys to users table (if applicable)

---

### FR10: Cryptographic Algorithm Support

**Description**: Support multiple elliptic curve algorithms for different platforms

**Requirements**:
10.1. Support secp256k1 (Ethereum/Web3 standard)
10.2. Support P-256 (NIST P-256, Apple Secure Enclave, Android KeyStore)
10.3. Support Ed25519 (modern, fast, SeedID compatible)
10.4. Signature verification for each algorithm
10.5. Public key parsing for each algorithm
10.6. Use Web Crypto API where available (edge compatibility)
10.7. Fallback to Node.js crypto for Node environments

**Acceptance Criteria**:
- ✅ secp256k1 signatures verify correctly
- ✅ P-256 signatures verify correctly
- ✅ Ed25519 signatures verify correctly
- ✅ Works in Cloudflare Workers (Web Crypto API)
- ✅ Works in Node.js
- ✅ Works in browsers

---

### FR11: Client SDK Examples

**Description**: Provide reference implementations for each platform

**Requirements**:
11.1. Web3 TypeScript SDK (ethers.js based)
11.2. iOS Swift SDK (App Attest + Secure Enclave)
11.3. Android Kotlin SDK (KeyStore + Play Integrity)
11.4. Documentation for each SDK
11.5. Code examples in README

**Acceptance Criteria**:
- ✅ Web3 SDK works with MetaMask
- ✅ iOS SDK works with Face ID
- ✅ Android SDK works with fingerprint
- ✅ All SDKs documented
- ✅ Code examples in README

---

### FR12: Integration with Existing JWT Infrastructure

**Description**: Build on top of v0.5.0 JWT implementation

**Requirements**:
12.1. Reuse JWT signer from v0.5.0
12.2. Reuse refresh token operations
12.3. Device-bound tokens use same JWT structure
12.4. Existing JWT endpoints still work
12.5. No breaking changes to JWT API

**Acceptance Criteria**:
- ✅ JWT infrastructure reused
- ✅ No breaking changes
- ✅ Existing JWT tests still pass
- ✅ Device-bound and regular JWTs coexist

---

## Non-Goals (Out of Scope for v0.6.0)

### Explicitly NOT Included

❌ **SeedID Derived Keys** - Optional feature for future version
❌ **WebAuthn/Passkeys** - Different standard, separate feature
❌ **Passwordless-only mode** - Keep passwords as fallback
❌ **Device trust scores** - Simple active/revoked for MVP
❌ **Device attestation caching** - Verify on every registration
❌ **Custom signature algorithms** - Only secp256k1, P-256, Ed25519
❌ **Hardware wallet support** - Focus on MetaMask for Web3 MVP
❌ **Biometric prompt customization** - Use OS defaults

### Future Considerations (v0.7.0+)

- Advanced device analytics (location, IP tracking)
- Device risk scoring
- Automatic device revocation on suspicious activity
- SeedID hierarchical key derivation integration
- WebAuthn/Passkeys as alternative flow
- Custom branding for biometric prompts

---

## Technical Considerations

### Architecture Decisions

**1. Challenge Storage: Redis vs Database**
- **Recommendation**: Use Redis if available, fallback to database
- **Rationale**: Challenges are short-lived (10 min TTL), Redis provides automatic expiration
- **Fallback**: Database table with cleanup job if Redis not available

**2. Signature Algorithms**
- **secp256k1**: Required for Web3 (Ethereum, Bitcoin standard)
- **P-256**: Required for iOS/Android (hardware-backed)
- **Ed25519**: Optional but recommended (modern, fast, SeedID compatible)

**3. Device-Bound Tokens**
- **Approach**: Extend existing JWT with `device_id` and `device_key_binding` claims
- **Rationale**: Reuses v0.5.0 infrastructure, no breaking changes

**4. Middleware Architecture**
- **Approach**: Optional middleware for signature verification
- **Rationale**: Gradual adoption, not all endpoints require device signatures initially

### Security Considerations

**1. Private Key Management**
- ✅ Private keys NEVER transmitted to server
- ✅ Private keys NEVER stored on server
- ✅ Only public keys stored in database

**2. Challenge Freshness**
- ✅ Challenges expire after 10 minutes
- ✅ Used challenges cannot be reused (one-time use)
- ✅ Timestamp validation prevents old challenges

**3. Signature Verification**
- ✅ Every protected API request must be signed
- ✅ Signature verified using stored public key
- ✅ Invalid signatures immediately rejected

**4. Device Attestation**
- ✅ iOS: Verify certificate chain to Apple root CA
- ✅ Android: Verify with Google Play Integrity API
- ✅ Web3: Verify EIP-191 signature format

**5. Token Revocation**
- ✅ Device revocation immediately invalidates all tokens
- ✅ Soft delete preserves audit trail
- ✅ Token validation checks device status

### Edge Compatibility

- ✅ Web Crypto API for Cloudflare Workers
- ✅ Node.js crypto as fallback
- ✅ No native dependencies
- ✅ Works in all runtimes (Cloudflare, Vercel Edge, Node.js)

### Database Compatibility

- ✅ PostgreSQL (Mech Storage, Neon, Supabase)
- ✅ SQLite (Turso, D1)
- ✅ MySQL (PlanetScale)

---

## Design Considerations

### User Experience Flow

**Web3 Registration**:
1. User clicks "Sign in with Wallet"
2. MetaMask popup appears
3. User reviews challenge message
4. User clicks "Sign"
5. Server verifies signature
6. User authenticated, token issued

**iOS Registration**:
1. User clicks "Register This Device"
2. App generates key in Secure Enclave
3. Face ID prompt appears
4. User authenticates with Face ID
5. App sends attestation to server
6. Server verifies, device registered

**Android Registration**:
1. User clicks "Register This Device"
2. App generates key in KeyStore
3. Fingerprint prompt appears
4. User authenticates with fingerprint
5. App sends integrity token to server
6. Server verifies, device registered

### Error Handling

**Registration Errors**:
- Invalid signature → "Signature verification failed. Please try again."
- Expired challenge → "Challenge expired. Please request a new one."
- Device already registered → "This device is already registered."
- Attestation failed → "Device verification failed. Your device may not be supported."

**Authentication Errors**:
- Device revoked → "This device has been revoked. Please register a new device."
- Invalid device signature → "Request signature invalid. Please re-authenticate."
- Challenge expired → "Challenge expired. Please get a fresh challenge."

---

## Success Metrics

### Launch Criteria (v0.6.0 Release)

✅ **Web3 Wallet Registration Works**
- Users can register MetaMask wallets
- Users can authenticate with wallet signatures
- 100% of valid signatures accepted
- 0% of invalid signatures accepted

✅ **iOS Device Registration Works**
- Users can register iOS devices
- App Attest attestation verifies correctly
- Face ID/Touch ID integration works
- Certificate chain validation succeeds

✅ **Android Device Registration Works**
- Users can register Android devices
- Play Integrity tokens verify correctly
- Fingerprint integration works
- KeyStore keys generated successfully

✅ **Multi-Device Support**
- Users can register multiple devices
- Device list shows all devices
- Device revocation works
- Last-used timestamps accurate

✅ **Security Requirements Met**
- All requests signed and verified
- No private keys in logs
- Challenge replay prevented
- Device attestation verified

✅ **Test Coverage**
- 100% coverage on signature verification
- 100% coverage on device registration
- 100% coverage on challenge generation
- Integration tests for each platform

### Performance Metrics

- Challenge generation: < 50ms
- Signature verification: < 100ms
- Device registration: < 500ms (including attestation)
- Device list query: < 100ms

### Adoption Metrics (Post-Launch)

- % of users using device keys vs passwords
- Device registration completion rate
- Device revocation rate
- Authentication failure rate
- Platform distribution (Web3 vs iOS vs Android)

---

## Implementation Phases

### Phase 1: Foundation + Web3 (Week 1 - MVP)
**Goal**: Get Web3 wallet authentication working end-to-end

- Database schema (devices, challenges tables)
- Challenge endpoint (`POST /auth/challenge`)
- Web3 device registration (`POST /auth/device/register`)
- secp256k1 signature verification
- Device-bound JWT tokens
- Request signature verification middleware
- Web3 TypeScript SDK
- 50+ tests

**Deliverable**: Web3 users can authenticate with MetaMask

### Phase 2: iOS Support (Week 2)
**Goal**: Add iOS App Attest authentication

- iOS device registration endpoint
- App Attest attestation verification
- Certificate chain validation
- P-256 signature verification
- iOS Swift SDK
- 30+ tests

**Deliverable**: iOS users can authenticate with Face ID

### Phase 3: Android Support (Week 3)
**Goal**: Add Android KeyStore authentication

- Android device registration endpoint
- Play Integrity token verification
- Android KeyStore integration
- Android Kotlin SDK
- 30+ tests

**Deliverable**: Android users can authenticate with fingerprint

### Phase 4: Polish & Documentation (Week 4)
**Goal**: Production-ready release

- Device management endpoints
- Comprehensive documentation
- README examples for all platforms
- Security audit
- Performance optimization
- 20+ integration tests

**Deliverable**: v0.6.0 ready for npm publish

---

## Open Questions

### Technical Questions

1. **Q**: Should we use Redis or database for challenge storage?
   **A**: TBD - Use Redis if available, fallback to database with cleanup job

2. **Q**: What is the maximum number of devices per user?
   **A**: TBD - Start with unlimited, add configurable limit if needed

3. **Q**: Should we support hardware wallets (Ledger, Trezor)?
   **A**: No for v0.6.0, consider for v0.7.0

4. **Q**: Should device signatures be required for ALL endpoints or opt-in?
   **A**: Opt-in via middleware. Not all endpoints require device signatures initially.

5. **Q**: Should we verify device attestation on every request or just registration?
   **A**: Only on registration for MVP. Attestation verification is expensive.

### Product Questions

1. **Q**: Should we migrate existing users to device keys automatically?
   **A**: No. Offer as optional upgrade, keep passwords as fallback.

2. **Q**: What happens if user loses all devices?
   **A**: Fallback to password recovery flow (email reset)

3. **Q**: Should we support SeedID derived keys in v0.6.0?
   **A**: No. Focus on platform-native keys first. SeedID for v0.7.0+

4. **Q**: Should we show device fingerprint/hash to users?
   **A**: Not in MVP. Simple device list is sufficient.

---

## Dependencies

### External Dependencies

- **ethers.js**: For Web3 signature verification (already a dependency)
- **Apple App Attest**: iOS device attestation
- **Google Play Integrity API**: Android device verification
- **Web Crypto API**: Cryptographic operations (edge-compatible)

### Internal Dependencies

- **JWT Infrastructure (v0.5.0)**: Device-bound tokens extend existing JWT
- **Database Providers**: Must support new devices and challenges tables
- **Authentication Handler**: Integrate device registration into auth flow

### Platform Requirements

- **iOS**: iOS 14+ (App Attest availability)
- **Android**: Android 13+ (Play Integrity API)
- **Web3**: MetaMask or any EIP-191 compatible wallet
- **Server**: Node.js 18+ or Cloudflare Workers

---

## Risk Assessment

### High Risk

❌ **App Attest Certificate Validation Complexity**
- **Mitigation**: Use well-tested library for certificate chain validation
- **Fallback**: Skip certificate validation in development, enforce in production

❌ **Play Integrity Token Verification**
- **Mitigation**: Follow Google's official documentation, use provided SDKs
- **Fallback**: Log warnings instead of hard failures during beta

### Medium Risk

⚠️ **Edge Runtime Compatibility**
- **Mitigation**: Use Web Crypto API exclusively, test on Cloudflare Workers
- **Fallback**: Node.js crypto for non-edge environments

⚠️ **Signature Verification Performance**
- **Mitigation**: Benchmark each algorithm, optimize hot paths
- **Fallback**: Cache public keys in memory

### Low Risk

✅ **Web3 Signature Verification**
- **Mitigation**: ethers.js is well-tested, EIP-191 is standard
- **Confidence**: High - many existing implementations

✅ **Database Schema Changes**
- **Mitigation**: Use migration scripts, test on all database providers
- **Confidence**: High - similar to JWT migrations

---

## References

### Documentation

- **Apple App Attest**: https://developer.apple.com/documentation/devicecheck/
- **Google Play Integrity**: https://developer.android.com/google/play/integrity
- **MetaMask Signing**: https://docs.metamask.io/wallet/how-to/sign-data/
- **EIP-191**: https://eips.ethereum.org/EIPS/eip-191
- **SeedID**: https://github.com/dundas/seedid

### Prior Art

- **WebAuthn**: Similar challenge-response flow, different key management
- **DPoP (Demonstrating Proof-of-Possession)**: OAuth 2.0 extension for key-bound tokens
- **Device Bound Session Credentials**: Google's proposal for device-bound cookies

### Related PRDs

- **PRD-0003**: JWT Bearer Token Support (v0.5.0) - Foundation for device-bound tokens
- **PRD-0002**: Edge Runtime Compatibility - Ensures device keys work in Cloudflare Workers

---

**Document Status**: Draft - Ready for Review
**Next Steps**: Generate task list with `/generate-tasks`
**Target Release**: v0.6.0 (Q1 2026)
