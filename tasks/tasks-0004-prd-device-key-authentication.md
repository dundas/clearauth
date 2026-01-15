# Task List: Device Key Authentication

**Source PRD:** `tasks/0004-prd-device-key-authentication.md`
**Generated:** 2026-01-15
**Target Version:** 0.6.0

---

## Relevant Files

### New Files to Create

**Device Authentication Module:**
- `src/device-auth/types.ts` - Device authentication type definitions
- `src/device-auth/challenge.ts` - Challenge generation and verification
- `src/device-auth/signature-verifier.ts` - Multi-curve signature verification
- `src/device-auth/device-registration.ts` - Device registration logic
- `src/device-auth/web3-verifier.ts` - Web3/EIP-191 signature verification
- `src/device-auth/ios-verifier.ts` - iOS App Attest verification
- `src/device-auth/android-verifier.ts` - Android Play Integrity verification
- `src/device-auth/middleware.ts` - Request signature verification middleware
- `src/device-auth/handlers.ts` - HTTP handlers for device endpoints
- `src/device-auth/__tests__/challenge.test.ts` - Challenge tests (20+ assertions)
- `src/device-auth/__tests__/signature-verifier.test.ts` - Signature verification tests (30+ assertions)
- `src/device-auth/__tests__/web3-verifier.test.ts` - Web3 verification tests (25+ assertions)
- `src/device-auth/__tests__/ios-verifier.test.ts` - iOS verification tests (20+ assertions)
- `src/device-auth/__tests__/android-verifier.test.ts` - Android verification tests (20+ assertions)
- `src/device-auth/__tests__/middleware.test.ts` - Middleware tests (25+ assertions)
- `src/device-auth/__tests__/handlers.test.ts` - Handler tests (30+ assertions)

**Entrypoint:**
- `src/device-auth.ts` - Device authentication entrypoint module

**Database Migrations:**
- `migrations/007_create_devices_table.sql` - Devices table migration
- `migrations/rollback_007.sql` - Devices table rollback
- `migrations/008_create_challenges_table.sql` - Challenges table migration
- `migrations/rollback_008.sql` - Challenges table rollback

### Existing Files to Modify

- `src/database/schema.ts` - Add DevicesTable and ChallengesTable interfaces
- `src/index.ts` - Export device authentication functions
- `src/jwt/handlers.ts` - Integrate device_id into JWT token creation
- `package.json` - Version bump to 0.6.0, add ./device-auth export
- `README.md` - Add device key authentication documentation
- `CHANGELOG.md` - Add v0.6.0 release notes

---

## Commit & PR Strategy

### Commit Frequency
- **Small commits:** After each logical unit of work (e.g., one function + test)
- **Commit message format:** `type(scope): description`
- **Types:** `feat`, `fix`, `test`, `refactor`, `docs`, `chore`

### PR Strategy
- **One PR per parent task** (9 PRs total)
- Each PR includes: implementation + tests + documentation
- PR naming: `Phase X: [Parent Task Name]`
- Merge strategy: Squash and merge to keep main branch clean

### PR Dependencies
```
PR #19 (Task 1.0 - Database Schema)
  ↓
PR #20 (Task 2.0 - Challenge Infrastructure)
  ↓
PR #21 (Task 3.0 - Signature Verification)
  ↓
PR #22 (Task 4.0 - Web3 Registration)
  ↓
PR #23 (Task 5.0 - Request Middleware)
  ↓
PR #24 (iOS) and PR #25 (Android) - Can run in parallel
  ↓
PR #26 (Task 8.0 - Device Management)
  ↓
PR #27 (Task 9.0 - Documentation)
```

**MVP Milestone**: PRs #19-23 deliver functional Web3 wallet authentication

---

## Tasks

### 1.0 Database Schema & Migrations ✅
**Agent:** `tdd-developer`
**PR:** `#19 - Phase 1: Database Schema for Device Keys` ✅ MERGED
**Effort:** Small
**Depends on:** None (can start immediately)
**Status:** ✅ COMPLETE (2026-01-15)

- [x] **1.1** Create devices table schema interface
  - **File:** `src/database/schema.ts` (modify)
  - **Action:** Add DevicesTable interface with device_id, user_id, platform, public_key, wallet_address, key_algorithm, status, registered_at, last_used_at, created_at
  - **Test:** `src/database/__tests__/schema.test.ts` (update existing, 5+ new assertions)
  - **Commit:** `feat(database): add DevicesTable schema interface`
  - **Agent:** `tdd-developer`

- [x] **1.2** Create challenges table schema interface
  - **File:** `src/database/schema.ts` (modify)
  - **Action:** Add ChallengesTable interface with nonce (primary key), challenge, created_at, expires_at
  - **Test:** `src/database/__tests__/schema.test.ts` (update existing, 3+ new assertions)
  - **Commit:** `feat(database): add ChallengesTable schema interface`
  - **Agent:** `tdd-developer`

- [x] **1.3** Create PostgreSQL migration for devices table
  - **File:** `migrations/007_create_devices_table.sql` (create)
  - **Action:** CREATE TABLE devices with UUID primary key, device_id unique, indexes on user_id, status, device_id
  - **Test:** Manual verification + migration test
  - **Commit:** `feat(migrations): add devices table migration for PostgreSQL`
  - **Agent:** `tdd-developer`

- [x] **1.4** Create PostgreSQL rollback migration for devices table
  - **File:** `migrations/rollback_007.sql` (create)
  - **Action:** DROP TABLE devices with CASCADE, drop indexes
  - **Test:** Manual verification + rollback test
  - **Commit:** `feat(migrations): add devices table rollback migration`
  - **Agent:** `tdd-developer`

- [x] **1.5** Create PostgreSQL migration for challenges table
  - **File:** `migrations/008_create_challenges_table.sql` (create)
  - **Action:** CREATE TABLE challenges with nonce primary key, index on expires_at for cleanup
  - **Test:** Manual verification + migration test
  - **Commit:** `feat(migrations): add challenges table migration for PostgreSQL`
  - **Agent:** `tdd-developer`

- [x] **1.6** Create PostgreSQL rollback migration for challenges table
  - **File:** `migrations/rollback_008.sql` (create)
  - **Action:** DROP TABLE challenges with CASCADE, drop indexes
  - **Test:** Manual verification + rollback test
  - **Commit:** `feat(migrations): add challenges table rollback migration`
  - **Agent:** `tdd-developer`

- [x] **1.7** Run tests and verify migrations
  - **File:** N/A
  - **Action:** Run all tests, verify schema tests pass, test migrations on PostgreSQL
  - **Test:** All 328+ tests passing (8 new schema tests)
  - **Commit:** N/A (verification step)
  - **Agent:** `tdd-developer`

- [x] **1.8** Create PR and merge Phase 1
  - **Action:** Create PR #19 with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

### 2.0 Challenge-Response Infrastructure
**Agent:** `tdd-developer`
**PR:** `#20 - Phase 2: Challenge-Response Infrastructure`
**Effort:** Small
**Depends on:** PR #19

- [ ] **2.1** Create device authentication types
  - **File:** `src/device-auth/types.ts` (create)
  - **Action:** Define Challenge, DeviceRegistration, DevicePlatform, KeyAlgorithm, DeviceStatus types
  - **Test:** `src/device-auth/__tests__/types.test.ts` (5+ assertions for type guards)
  - **Commit:** `feat(device-auth): add device authentication type definitions`
  - **Agent:** `tdd-developer`

- [ ] **2.2** Implement challenge generation
  - **File:** `src/device-auth/challenge.ts` (create)
  - **Action:** generateChallenge() function using crypto.getRandomValues (32 bytes), format as nonce|timestamp
  - **Test:** `src/device-auth/__tests__/challenge.test.ts` (10+ assertions: uniqueness, format, randomness)
  - **Commit:** `feat(device-auth): implement challenge generation`
  - **Agent:** `tdd-developer`

- [ ] **2.3** Implement challenge storage
  - **File:** `src/device-auth/challenge.ts` (modify)
  - **Action:** storeChallenge() function to save challenge in database with 10-minute TTL
  - **Test:** `src/device-auth/__tests__/challenge.test.ts` (5+ assertions: storage, TTL, retrieval)
  - **Commit:** `feat(device-auth): implement challenge storage with TTL`
  - **Agent:** `tdd-developer`

- [ ] **2.4** Implement challenge verification
  - **File:** `src/device-auth/challenge.ts` (modify)
  - **Action:** verifyChallenge() function to check challenge exists, not expired, consume on use (delete after verification)
  - **Test:** `src/device-auth/__tests__/challenge.test.ts` (10+ assertions: expiry, one-time use, invalid challenges)
  - **Commit:** `feat(device-auth): implement challenge verification and consumption`
  - **Agent:** `tdd-developer`

- [ ] **2.5** Create challenge HTTP handler
  - **File:** `src/device-auth/handlers.ts` (create)
  - **Action:** handleChallengeRequest() - POST /auth/challenge endpoint, returns { challenge, expiresIn: 600 }
  - **Test:** `src/device-auth/__tests__/handlers.test.ts` (8+ assertions: endpoint response, format)
  - **Commit:** `feat(device-auth): add challenge HTTP handler`
  - **Agent:** `tdd-developer`

- [ ] **2.6** Run tests and build
  - **File:** N/A
  - **Action:** Run all tests, verify build succeeds
  - **Test:** All 348+ tests passing (20 new challenge tests)
  - **Commit:** N/A (verification step)
  - **Agent:** `tdd-developer`

- [ ] **2.7** Create PR and merge Phase 2
  - **Action:** Create PR #20 with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

### 3.0 Cryptographic Signature Verification
**Agent:** `reliability-engineer`
**PR:** `#21 - Phase 3: Multi-Curve Signature Verification`
**Effort:** Medium
**Depends on:** PR #20

- [ ] **3.1** Implement secp256k1 signature verification (Web3/Ethereum)
  - **File:** `src/device-auth/signature-verifier.ts` (create)
  - **Action:** verifySecp256k1Signature() using Web Crypto API or ethers.js, verify ECDSA signatures on secp256k1 curve
  - **Test:** `src/device-auth/__tests__/signature-verifier.test.ts` (12+ assertions: valid sigs, invalid sigs, edge cases)
  - **Commit:** `feat(device-auth): implement secp256k1 signature verification`
  - **Agent:** `reliability-engineer`

- [ ] **3.2** Implement P-256 signature verification (iOS/Android)
  - **File:** `src/device-auth/signature-verifier.ts` (modify)
  - **Action:** verifyP256Signature() using Web Crypto API, verify ECDSA signatures on P-256 (prime256v1) curve
  - **Test:** `src/device-auth/__tests__/signature-verifier.test.ts` (10+ assertions: valid sigs, invalid sigs, DER encoding)
  - **Commit:** `feat(device-auth): implement P-256 signature verification`
  - **Agent:** `reliability-engineer`

- [ ] **3.3** Implement Ed25519 signature verification (SeedID)
  - **File:** `src/device-auth/signature-verifier.ts` (modify)
  - **Action:** verifyEd25519Signature() using Web Crypto API or noble-ed25519, verify EdDSA signatures
  - **Test:** `src/device-auth/__tests__/signature-verifier.test.ts` (10+ assertions: valid sigs, invalid sigs)
  - **Commit:** `feat(device-auth): implement Ed25519 signature verification`
  - **Agent:** `reliability-engineer`

- [ ] **3.4** Implement public key parsing for each algorithm
  - **File:** `src/device-auth/signature-verifier.ts` (modify)
  - **Action:** parsePublicKey() function supporting PEM, DER, JWK, raw hex formats for each curve
  - **Test:** `src/device-auth/__tests__/signature-verifier.test.ts` (8+ assertions: each format, error handling)
  - **Commit:** `feat(device-auth): implement multi-format public key parsing`
  - **Agent:** `reliability-engineer`

- [ ] **3.5** Add comprehensive error handling
  - **File:** `src/device-auth/signature-verifier.ts` (modify)
  - **Action:** Add error classes (InvalidSignatureError, UnsupportedAlgorithmError), sanitize error messages
  - **Test:** `src/device-auth/__tests__/signature-verifier.test.ts` (5+ assertions: error types, messages)
  - **Commit:** `feat(device-auth): add signature verification error handling`
  - **Agent:** `reliability-engineer`

- [ ] **3.6** Run tests and build
  - **File:** N/A
  - **Action:** Run all tests, verify all signature algorithms work, test edge compatibility (Cloudflare Workers)
  - **Test:** All 378+ tests passing (30 new signature verification tests)
  - **Commit:** N/A (verification step)
  - **Agent:** `reliability-engineer`

- [ ] **3.7** Create PR and merge Phase 3
  - **Action:** Create PR #21 with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

### 4.0 Web3 Wallet Device Registration
**Agent:** `tdd-developer`
**PR:** `#22 - Phase 4: Web3 Wallet Authentication`
**Effort:** Medium
**Depends on:** PR #21

- [ ] **4.1** Implement EIP-191 signature verification
  - **File:** `src/device-auth/web3-verifier.ts` (create)
  - **Action:** verifyEIP191Signature() - verify EIP-191 personal_sign format, recover Ethereum address
  - **Test:** `src/device-auth/__tests__/web3-verifier.test.ts` (12+ assertions: valid sigs, address recovery, format)
  - **Commit:** `feat(device-auth): implement EIP-191 signature verification`
  - **Agent:** `tdd-developer`

- [ ] **4.2** Implement Ethereum address recovery
  - **File:** `src/device-auth/web3-verifier.ts` (modify)
  - **Action:** recoverEthereumAddress() using ethers.js or Web Crypto API, extract address from signature
  - **Test:** `src/device-auth/__tests__/web3-verifier.test.ts` (8+ assertions: recovery accuracy, checksum validation)
  - **Commit:** `feat(device-auth): implement Ethereum address recovery`
  - **Agent:** `tdd-developer`

- [ ] **4.3** Implement device registration logic
  - **File:** `src/device-auth/device-registration.ts` (create)
  - **Action:** registerDevice() function - create device record, generate device_id, store in database
  - **Test:** `src/device-auth/__tests__/device-registration.test.ts` (15+ assertions: creation, uniqueness, validation)
  - **Commit:** `feat(device-auth): implement device registration logic`
  - **Agent:** `tdd-developer`

- [ ] **4.4** Extend JWT token creation for device binding
  - **File:** `src/jwt/handlers.ts` (modify)
  - **Action:** Update createAccessToken() to accept device_id and device_key_binding claims
  - **Test:** `src/jwt/__tests__/handlers.test.ts` (5+ assertions: device claims present, token validation)
  - **Commit:** `feat(jwt): add device binding support to JWT tokens`
  - **Agent:** `tdd-developer`

- [ ] **4.5** Implement Web3 device registration handler
  - **File:** `src/device-auth/handlers.ts` (modify)
  - **Action:** handleDeviceRegister() - POST /auth/device/register for Web3 platform, verify signature, issue device-bound JWT
  - **Test:** `src/device-auth/__tests__/handlers.test.ts` (15+ assertions: full flow, error cases)
  - **Commit:** `feat(device-auth): add Web3 device registration handler`
  - **Agent:** `tdd-developer`

- [ ] **4.6** Run tests and build
  - **File:** N/A
  - **Action:** Run all tests, verify Web3 registration works end-to-end
  - **Test:** All 418+ tests passing (40 new Web3 tests)
  - **Commit:** N/A (verification step)
  - **Agent:** `tdd-developer`

- [ ] **4.7** Create PR and merge Phase 4
  - **Action:** Create PR #22 with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

### 5.0 Request Signature Verification Middleware
**Agent:** `reliability-engineer`
**PR:** `#23 - Phase 5: Request Signature Middleware`
**Effort:** Medium
**Depends on:** PR #22

- [ ] **5.1** Implement request signature extraction
  - **File:** `src/device-auth/middleware.ts` (create)
  - **Action:** extractSignatureHeaders() - extract Authorization, X-Signature, X-Challenge headers
  - **Test:** `src/device-auth/__tests__/middleware.test.ts` (8+ assertions: header extraction, missing headers)
  - **Commit:** `feat(device-auth): implement signature header extraction`
  - **Agent:** `reliability-engineer`

- [ ] **5.2** Implement request payload reconstruction
  - **File:** `src/device-auth/middleware.ts` (modify)
  - **Action:** reconstructSignedPayload() - hash method + path + body + challenge for signature verification
  - **Test:** `src/device-auth/__tests__/middleware.test.ts` (6+ assertions: payload consistency, hashing)
  - **Commit:** `feat(device-auth): implement request payload reconstruction`
  - **Agent:** `reliability-engineer`

- [ ] **5.3** Implement signature verification middleware
  - **File:** `src/device-auth/middleware.ts` (modify)
  - **Action:** verifyDeviceSignature() middleware - verify JWT token, get device public key, verify request signature
  - **Test:** `src/device-auth/__tests__/middleware.test.ts` (15+ assertions: valid requests, invalid sigs, expired challenges)
  - **Commit:** `feat(device-auth): implement signature verification middleware`
  - **Agent:** `reliability-engineer`

- [ ] **5.4** Add challenge freshness validation
  - **File:** `src/device-auth/middleware.ts` (modify)
  - **Action:** validateChallengeFreshness() - check challenge timestamp within 60 seconds
  - **Test:** `src/device-auth/__tests__/middleware.test.ts` (5+ assertions: fresh, expired, tampered)
  - **Commit:** `feat(device-auth): add challenge freshness validation`
  - **Agent:** `reliability-engineer`

- [ ] **5.5** Add device status validation
  - **File:** `src/device-auth/middleware.ts` (modify)
  - **Action:** Check device.status === 'active', reject revoked devices
  - **Test:** `src/device-auth/__tests__/middleware.test.ts` (4+ assertions: active, revoked)
  - **Commit:** `feat(device-auth): add device status validation`
  - **Agent:** `reliability-engineer`

- [ ] **5.6** Run tests and build
  - **File:** N/A
  - **Action:** Run all tests, verify middleware works with Web3 flow
  - **Test:** All 443+ tests passing (25 new middleware tests)
  - **Commit:** N/A (verification step)
  - **Agent:** `reliability-engineer`

- [ ] **5.7** Create PR and merge Phase 5
  - **Action:** Create PR #23 with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

### 6.0 iOS Device Registration
**Agent:** `reliability-engineer`
**PR:** `#24 - Phase 6: iOS App Attest Authentication`
**Effort:** Large
**Depends on:** PR #23

- [ ] **6.1** Implement App Attest attestation parsing
  - **File:** `src/device-auth/ios-verifier.ts` (create)
  - **Action:** parseAttestation() - decode CBOR attestation object, extract authenticator data and attestation statement
  - **Test:** `src/device-auth/__tests__/ios-verifier.test.ts` (8+ assertions: parsing, structure validation)
  - **Commit:** `feat(device-auth): implement iOS App Attest attestation parsing`
  - **Agent:** `reliability-engineer`

- [ ] **6.2** Implement Apple certificate chain validation
  - **File:** `src/device-auth/ios-verifier.ts` (modify)
  - **Action:** verifyCertificateChain() - validate certificate chain to Apple root CA, check signatures
  - **Test:** `src/device-auth/__tests__/ios-verifier.test.ts` (10+ assertions: valid chain, invalid chain, expiry)
  - **Commit:** `feat(device-auth): implement Apple certificate chain validation`
  - **Agent:** `reliability-engineer`

- [ ] **6.3** Extract public key from attestation
  - **File:** `src/device-auth/ios-verifier.ts` (modify)
  - **Action:** extractPublicKey() - parse P-256 public key from attestation object
  - **Test:** `src/device-auth/__tests__/ios-verifier.test.ts` (5+ assertions: extraction, format)
  - **Commit:** `feat(device-auth): extract public key from iOS attestation`
  - **Agent:** `reliability-engineer`

- [ ] **6.4** Implement iOS device registration handler
  - **File:** `src/device-auth/handlers.ts` (modify)
  - **Action:** Add iOS path to handleDeviceRegister() - verify attestation, validate challenge, issue device-bound JWT
  - **Test:** `src/device-auth/__tests__/handlers.test.ts` (12+ assertions: iOS registration flow, error cases)
  - **Commit:** `feat(device-auth): add iOS device registration handler`
  - **Agent:** `reliability-engineer`

- [ ] **6.5** Run tests and build
  - **File:** N/A
  - **Action:** Run all tests, verify iOS registration flow
  - **Test:** All 463+ tests passing (20 new iOS tests)
  - **Commit:** N/A (verification step)
  - **Agent:** `reliability-engineer`

- [ ] **6.6** Create PR and merge Phase 6
  - **Action:** Create PR #24 with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

### 7.0 Android Device Registration
**Agent:** `reliability-engineer`
**PR:** `#25 - Phase 7: Android KeyStore Authentication`
**Effort:** Large
**Depends on:** PR #24 (or can run parallel to PR #24 after PR #23)

- [ ] **7.1** Implement Play Integrity token parsing
  - **File:** `src/device-auth/android-verifier.ts` (create)
  - **Action:** parseIntegrityToken() - decode JWT token from Play Integrity API
  - **Test:** `src/device-auth/__tests__/android-verifier.test.ts` (8+ assertions: parsing, claims extraction)
  - **Commit:** `feat(device-auth): implement Play Integrity token parsing`
  - **Agent:** `reliability-engineer`

- [ ] **7.2** Implement Google Play Integrity verification
  - **File:** `src/device-auth/android-verifier.ts` (modify)
  - **Action:** verifyIntegrityToken() - verify token signature with Google public keys, check device verdict
  - **Test:** `src/device-auth/__tests__/android-verifier.test.ts` (10+ assertions: valid tokens, invalid sigs, verdict checks)
  - **Commit:** `feat(device-auth): implement Play Integrity token verification`
  - **Agent:** `reliability-engineer`

- [ ] **7.3** Validate device integrity verdict
  - **File:** `src/device-auth/android-verifier.ts` (modify)
  - **Action:** validateDeviceVerdict() - check deviceRecognitionVerdict meets integrity requirements
  - **Test:** `src/device-auth/__tests__/android-verifier.test.ts` (6+ assertions: verdict validation, rejection cases)
  - **Commit:** `feat(device-auth): validate Android device integrity verdict`
  - **Agent:** `reliability-engineer`

- [ ] **7.4** Implement Android device registration handler
  - **File:** `src/device-auth/handlers.ts` (modify)
  - **Action:** Add Android path to handleDeviceRegister() - verify integrity token, accept public key, issue device-bound JWT
  - **Test:** `src/device-auth/__tests__/handlers.test.ts` (12+ assertions: Android registration flow, error cases)
  - **Commit:** `feat(device-auth): add Android device registration handler`
  - **Agent:** `reliability-engineer`

- [ ] **7.5** Run tests and build
  - **File:** N/A
  - **Action:** Run all tests, verify Android registration flow
  - **Test:** All 483+ tests passing (20 new Android tests)
  - **Commit:** N/A (verification step)
  - **Agent:** `reliability-engineer`

- [ ] **7.6** Create PR and merge Phase 7
  - **Action:** Create PR #25 with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

### 8.0 Device Management API
**Agent:** `tdd-developer`
**PR:** `#26 - Phase 8: Device Management`
**Effort:** Medium
**Depends on:** PR #25

- [ ] **8.1** Implement list devices query
  - **File:** `src/device-auth/device-registration.ts` (modify)
  - **Action:** listUserDevices() - query all devices for user_id, return with metadata
  - **Test:** `src/device-auth/__tests__/device-registration.test.ts` (8+ assertions: listing, filtering)
  - **Commit:** `feat(device-auth): implement list devices query`
  - **Agent:** `tdd-developer`

- [ ] **8.2** Implement device revocation
  - **File:** `src/device-auth/device-registration.ts` (modify)
  - **Action:** revokeDevice() - update device status to 'revoked', soft delete (keep audit trail)
  - **Test:** `src/device-auth/__tests__/device-registration.test.ts` (10+ assertions: revocation, token invalidation)
  - **Commit:** `feat(device-auth): implement device revocation`
  - **Agent:** `tdd-developer`

- [ ] **8.3** Implement last_used_at tracking
  - **File:** `src/device-auth/middleware.ts` (modify)
  - **Action:** Update last_used_at timestamp on every authenticated request
  - **Test:** `src/device-auth/__tests__/middleware.test.ts` (5+ assertions: timestamp updates)
  - **Commit:** `feat(device-auth): track device last_used_at timestamp`
  - **Agent:** `tdd-developer`

- [ ] **8.4** Create device list HTTP handler
  - **File:** `src/device-auth/handlers.ts` (modify)
  - **Action:** handleListDevices() - GET /auth/devices endpoint, return user's devices
  - **Test:** `src/device-auth/__tests__/handlers.test.ts` (8+ assertions: response format, filtering)
  - **Commit:** `feat(device-auth): add device list HTTP handler`
  - **Agent:** `tdd-developer`

- [ ] **8.5** Create device revocation HTTP handler
  - **File:** `src/device-auth/handlers.ts` (modify)
  - **Action:** handleRevokeDevice() - DELETE /auth/devices/{deviceId} endpoint
  - **Test:** `src/device-auth/__tests__/handlers.test.ts` (10+ assertions: revocation flow, errors)
  - **Commit:** `feat(device-auth): add device revocation HTTP handler`
  - **Agent:** `tdd-developer`

- [ ] **8.6** Run tests and build
  - **File:** N/A
  - **Action:** Run all tests, verify device management works
  - **Test:** All 514+ tests passing (31 new device management tests)
  - **Commit:** N/A (verification step)
  - **Agent:** `tdd-developer`

- [ ] **8.7** Create PR and merge Phase 8
  - **Action:** Create PR #26 with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

### 9.0 Documentation & Examples
**Agent:** `tdd-developer`
**PR:** `#27 - Phase 9: Documentation & SDK Examples`
**Effort:** Medium
**Depends on:** PR #26

- [ ] **9.1** Create device-auth entrypoint module
  - **File:** `src/device-auth.ts` (create)
  - **Action:** Export all device authentication types, functions, and handlers
  - **Test:** No test needed (exports only)
  - **Commit:** `feat(device-auth): add device authentication entrypoint`
  - **Agent:** `tdd-developer`

- [ ] **9.2** Update main index.ts exports
  - **File:** `src/index.ts` (modify)
  - **Action:** Export device authentication functions from main package
  - **Test:** No test needed (exports only)
  - **Commit:** `feat(index): export device authentication functions`
  - **Agent:** `tdd-developer`

- [ ] **9.3** Update package.json
  - **File:** `package.json` (modify)
  - **Action:** Bump version to 0.6.0, add ./device-auth export path, update keywords
  - **Test:** No test needed (config change)
  - **Commit:** `chore(package): bump version to 0.6.0 and add device-auth export`
  - **Agent:** `tdd-developer`

- [ ] **9.4** Add README device authentication section
  - **File:** `README.md` (modify)
  - **Action:** Add comprehensive device key authentication section with Web3, iOS, Android examples (400+ lines)
  - **Test:** No test needed (documentation)
  - **Commit:** `docs(readme): add device key authentication documentation`
  - **Agent:** `tdd-developer`

- [ ] **9.5** Add Web3 client SDK example
  - **File:** `README.md` (modify)
  - **Action:** Add TypeScript/ethers.js code example for Web3 wallet authentication
  - **Test:** No test needed (documentation)
  - **Commit:** `docs(readme): add Web3 client SDK example`
  - **Agent:** `tdd-developer`

- [ ] **9.6** Add iOS client SDK example
  - **File:** `README.md` (modify)
  - **Action:** Add Swift/App Attest code example for iOS device authentication
  - **Test:** No test needed (documentation)
  - **Commit:** `docs(readme): add iOS client SDK example`
  - **Agent:** `tdd-developer`

- [ ] **9.7** Add Android client SDK example
  - **File:** `README.md` (modify)
  - **Action:** Add Kotlin/KeyStore code example for Android device authentication
  - **Test:** No test needed (documentation)
  - **Commit:** `docs(readme): add Android client SDK example`
  - **Agent:** `tdd-developer`

- [ ] **9.8** Update CHANGELOG for v0.6.0
  - **File:** `CHANGELOG.md` (modify)
  - **Action:** Add v0.6.0 release notes documenting all device authentication features (100+ lines)
  - **Test:** No test needed (documentation)
  - **Commit:** `docs(changelog): add v0.6.0 release notes`
  - **Agent:** `tdd-developer`

- [ ] **9.9** Run tests and build
  - **File:** N/A
  - **Action:** Run all tests, verify build succeeds, verify all exports work
  - **Test:** All 514 tests passing, build successful
  - **Commit:** N/A (verification step)
  - **Agent:** `tdd-developer`

- [ ] **9.10** Create PR and merge Phase 9
  - **Action:** Create PR #27 with all commits, run CI tests, squash merge to main
  - **Agent:** Manual review + merge

---

## Summary

**Total Tasks:** 71 sub-tasks across 9 parent tasks
**Total PRs:** 9 PRs (one per parent task)
**Total Tests:** 514+ tests (194 new device authentication tests)

**Agent Assignments:**
- `tdd-developer`: 51% of tasks (36 sub-tasks - standard feature development)
- `reliability-engineer`: 49% of tasks (35 sub-tasks - security-critical verification)
- Manual testing: 0% (all automated)

**Test Breakdown:**
- Task 1.0: 8 tests (database schema)
- Task 2.0: 20 tests (challenge infrastructure)
- Task 3.0: 30 tests (signature verification)
- Task 4.0: 40 tests (Web3 registration)
- Task 5.0: 25 tests (request middleware)
- Task 6.0: 20 tests (iOS registration)
- Task 7.0: 20 tests (Android registration)
- Task 8.0: 31 tests (device management)
- Task 9.0: 0 tests (documentation only)

**Critical Path:**
```
PR #19 → PR #20 → PR #21 → PR #22 → PR #23 → {PR #24, PR #25} → PR #26 → PR #27
```

**Parallel Work Opportunities:**
- PR #24 (iOS) and PR #25 (Android) can run in parallel after PR #23
- Saves approximately 1-2 days if parallel execution

**MVP Milestone (Web3 Only):**
- PRs #19-23 deliver functional Web3 wallet authentication
- 123 new tests
- Approximately 40-50% of total effort
- Can be released as v0.6.0-beta if needed

**File Count:**
- **New files:** 23 (17 implementation + 6 migrations)
- **Modified files:** 6 (schema, index, jwt handlers, package, readme, changelog)
- **Total files touched:** 29

**Lines of Code Estimate:**
- Implementation: ~3,500 lines
- Tests: ~2,500 lines
- Documentation: ~600 lines
- **Total: ~6,600 lines**

---

*Task list generated 2026-01-15 by tasklist-generator skill*
