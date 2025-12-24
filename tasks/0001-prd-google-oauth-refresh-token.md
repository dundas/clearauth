# PRD: Google OAuth Refresh Token Handling

**PRD ID**: 0001
**Feature**: Google OAuth Refresh Token Fix
**GitHub Issue**: [#1](https://github.com/dundas/clearauth/issues/1)
**Status**: Draft
**Priority**: High

---

## 1. Introduction/Overview

The `handleGoogleCallback` function in ClearAuth unconditionally calls `tokens.refreshToken()`, which throws an error when Google doesn't provide a refresh token. This is expected behavior for returning users or web apps not using `access_type=offline`, but currently breaks OAuth login.

This is a bug fix that makes Google OAuth work correctly for the common session-based web app use case.

## 2. Goals

1. **Fix Google OAuth for returning users** - OAuth login should succeed even when Google doesn't provide a refresh token
2. **Maintain backward compatibility** - Apps that do receive refresh tokens should continue to work
3. **Align with OAuth best practices** - Refresh tokens are optional for session-based auth; don't require them

## 3. User Stories

1. **As a returning user**, I want to log in with Google without errors, so that I can access the application seamlessly.

2. **As a developer**, I want Google OAuth to work out-of-the-box for session-based apps, so that I don't need workarounds or patches.

3. **As a developer using offline access**, I want to still receive refresh tokens when Google provides them, so that I can refresh access tokens for background operations.

## 4. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | `handleGoogleCallback` MUST NOT throw when `refreshToken` is not present in the OAuth response |
| FR-2 | `refreshToken` MUST be captured and stored when Google provides it |
| FR-3 | The `OAuthCallbackResult` interface MUST treat `refreshToken` as optional (already does) |
| FR-4 | Existing tests MUST pass; new tests MUST cover the no-refresh-token scenario |

## 5. Non-Goals (Out of Scope)

- Adding `access_type=offline` to the OAuth authorization URL (user can configure this separately)
- Token refresh functionality (storing refresh tokens is sufficient)
- Changes to GitHub OAuth (not affected by this issue)

## 6. Technical Considerations

### Current Code (`src/oauth/google.ts`)
```typescript
const tokens = await google.validateAuthorizationCode(code, codeVerifier);
const accessToken = tokens.accessToken();
const refreshToken = tokens.refreshToken(); // Throws if not present
```

### Proposed Fix
```typescript
const tokens = await google.validateAuthorizationCode(code, codeVerifier);
const accessToken = tokens.accessToken();

// Refresh token is optional - Google only provides it on first auth or with access_type=offline
let refreshToken: string | undefined;
try {
  refreshToken = tokens.refreshToken();
} catch {
  // Expected for session-based web apps without offline access
  refreshToken = undefined;
}
```

### Files to Modify
- `src/oauth/google.ts` - Fix refresh token handling
- `src/oauth/__tests__/google.test.ts` - Add test for missing refresh token

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Google OAuth works for returning users | 100% success rate |
| No regression for first-time users | All existing tests pass |
| No breaking API changes | Backward compatible |

## 8. Open Questions

1. ~~Should we log a debug message when refresh token is not present?~~ **Decision**: Yes, log at debug level for troubleshooting.

2. ~~Should we document that `access_type=offline` is needed for refresh tokens?~~ **Decision**: Yes, add note to README OAuth section.

---

## Implementation Checklist

- [ ] Update `src/oauth/google.ts` to handle missing refresh token
- [ ] Add test case for OAuth response without refresh token
- [ ] Add debug log when refresh token is not present
- [ ] Update README with note about `access_type=offline`
- [ ] Test with real Google OAuth flow (manual verification)
- [ ] Close GitHub issue #1
