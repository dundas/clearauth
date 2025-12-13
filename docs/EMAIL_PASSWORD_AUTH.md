# Email/Password Authentication

This document describes the email/password authentication implementation in ClearAuth.

## Overview

The email/password authentication system provides:
- User registration with password hashing (pluggable)
- Email verification with secure tokens
- User login with password verification
- Password reset flow with time-limited tokens
- Secure session management

## Architecture

### Password Hashing

Password hashing is **pluggable**:

- **Default**: PBKDF2 via Web Crypto (portable; works in edge runtimes)
- **Node.js**: Argon2id via `@node-rs/argon2` when using the Node entrypoint

If you need Cloudflare Workers support, use the edge entrypoint and PBKDF2 (no native dependencies).

### Token Generation

All tokens use cryptographically secure random values via Web Crypto API:
- **Entropy**: 32 bytes (256 bits)
- **Encoding**: Base64url (URL-safe)
- **Generation**: `crypto.getRandomValues()`

### Token Expiration

- **Email verification tokens**: 24 hours
- **Password reset tokens**: 1 hour (for security)
- **Sessions**: 30 days (default)

## API Reference

### Registration

#### `registerUser(db, email, password, context?)`

Registers a new user with email and password.

**Parameters:**
- `db: Kysely<Database>` - Database instance
- `email: string` - User's email address
- `password: string` - User's password (plain text)
- `context?: RequestContext` - Optional IP address and user agent

**Returns:**
```typescript
{
  user: User,
  sessionId: string,
  verificationToken: string
}
```

**Errors:**
- `INVALID_EMAIL` - Email format is invalid
- `INVALID_PASSWORD` - Password does not meet requirements
- `EMAIL_EXISTS` - User with this email already exists

**Example:**
```typescript
import { registerUser } from 'clearauth'

const result = await registerUser(db, 'user@example.com', 'SecurePass123!', {
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
})

console.log('User ID:', result.user.id)
console.log('Session ID:', result.sessionId)
console.log('Verification token:', result.verificationToken)
// Send verification email to user with token
```

### Email Verification

#### `verifyEmail(db, token)`

Verifies a user's email address using a verification token.

**Parameters:**
- `db: Kysely<Database>` - Database instance
- `token: string` - Email verification token

**Returns:**
```typescript
{
  success: boolean,
  userId?: string
}
```

**Errors:**
- `INVALID_TOKEN` - Token is invalid
- `TOKEN_EXPIRED` - Token has expired

**Example:**
```typescript
import { verifyEmail } from 'clearauth'

const result = await verifyEmail(db, 'abc123...')
if (result.success) {
  console.log('Email verified for user:', result.userId)
}
```

#### `resendVerificationEmail(db, email)`

Resends a verification email by generating a new token.

**Parameters:**
- `db: Kysely<Database>` - Database instance
- `email: string` - User's email address

**Returns:**
```typescript
{
  token: string
}
```

**Errors:**
- `ALREADY_VERIFIED` - Email is already verified
- `EMAIL_SENT` - Generic success (doesn't reveal if email exists)

**Example:**
```typescript
import { resendVerificationEmail } from 'clearauth'

const { token } = await resendVerificationEmail(db, 'user@example.com')
// Send new verification email to user with token
```

### Login

#### `loginUser(db, email, password, context?)`

Logs in a user with email and password.

**Parameters:**
- `db: Kysely<Database>` - Database instance
- `email: string` - User's email address
- `password: string` - User's password (plain text)
- `context?: RequestContext` - Optional IP address and user agent

**Returns:**
```typescript
{
  user: User,
  sessionId: string
}
```

**Errors:**
- `INVALID_CREDENTIALS` - Email or password is incorrect
- `NO_PASSWORD_SET` - Account uses social login only

**Example:**
```typescript
import { loginUser } from 'clearauth'

const result = await loginUser(db, 'user@example.com', 'SecurePass123!', {
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
})

console.log('Logged in user:', result.user.id)
console.log('Session ID:', result.sessionId)
```

### Password Reset

#### `requestPasswordReset(db, email)`

Requests a password reset by generating a reset token.

**Parameters:**
- `db: Kysely<Database>` - Database instance
- `email: string` - User's email address

**Returns:**
```typescript
{
  success: true,
  email: string
}
```

**Errors:**
- `NO_PASSWORD_SET` - Account uses social login only

**Note:** This function does not return the token to prevent email enumeration. Use the optional callback to send the token via email.

**Example:**
```typescript
import { requestPasswordReset } from 'clearauth'

await requestPasswordReset(db, 'user@example.com', async (email, token) => {
  // Send password reset email to user with token
  // sendEmail(email, `Click here to reset: ${baseUrl}/reset?token=${token}`)
})
```

#### `verifyResetToken(db, token)`

Verifies a password reset token without consuming it.

**Parameters:**
- `db: Kysely<Database>` - Database instance
- `token: string` - Password reset token

**Returns:**
```typescript
{
  valid: boolean,
  userId?: string
}
```

**Example:**
```typescript
import { verifyResetToken } from 'clearauth'

const result = await verifyResetToken(db, 'abc123...')
if (result.valid) {
  console.log('Token is valid for user:', result.userId)
  // Show password reset form
}
```

#### `resetPassword(db, token, newPassword)`

Resets a user's password using a reset token.

**Parameters:**
- `db: Kysely<Database>` - Database instance
- `token: string` - Password reset token
- `newPassword: string` - New password (plain text)

**Returns:**
```typescript
{
  success: boolean
}
```

**Errors:**
- `INVALID_TOKEN` - Token is invalid or expired
- `TOKEN_EXPIRED` - Token has expired
- `INVALID_PASSWORD` - New password does not meet requirements

**Side effects:**
- All user sessions are invalidated for security

**Example:**
```typescript
import { resetPassword } from 'clearauth'

const result = await resetPassword(db, 'abc123...', 'NewSecurePass123!')
if (result.success) {
  console.log('Password reset successful')
  // Redirect user to login page
}
```

### Session Management

Session management utilities are shared with OAuth:

#### `validateSession(db, sessionId)`

Validates a session and returns the user.

**Example:**
```typescript
import { validateSession } from 'clearauth'

const user = await validateSession(db, sessionId)
if (!user) {
  return new Response('Unauthorized', { status: 401 })
}
```

#### `deleteSession(db, sessionId)`

Deletes a session (logout).

**Example:**
```typescript
import { deleteSession } from 'clearauth'

await deleteSession(db, sessionId)
```

#### `deleteAllUserSessions(db, userId)`

Deletes all sessions for a user (used after password change).

**Example:**
```typescript
import { deleteAllUserSessions } from 'clearauth'

await deleteAllUserSessions(db, userId)
```

## HTTP Handler

### `handleAuthRequest(request, config)`

Main HTTP request handler for email/password authentication.

**Supported routes:**
- `POST /auth/register` - User registration
- `POST /auth/verify-email` - Email verification
- `POST /auth/resend-verification` - Resend verification email
- `POST /auth/login` - User login
- `POST /auth/logout` - Session deletion
- `POST /auth/request-reset` - Request password reset
- `POST /auth/reset-password` - Reset password with token

**Example:**
```typescript
import { handleAuthRequest } from 'clearauth'

const response = await handleAuthRequest(request, {
  database: db,
  secret: 'your-secret-key',
  baseUrl: 'https://example.com',
  isProduction: true
})

return response
```

### Request/Response Examples

#### POST /auth/register

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (201):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "email_verified": false,
    "name": null,
    "avatar_url": null,
    "created_at": "2025-01-01T00:00:00.000Z"
  },
  "sessionId": "session_id",
  "verificationToken": "token"
}
```

#### POST /auth/verify-email

**Request:**
```json
{
  "token": "verification_token"
}
```

**Response (200):**
```json
{
  "success": true,
  "userId": "uuid"
}
```

#### POST /auth/login

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "email_verified": true,
    "name": null,
    "avatar_url": null,
    "created_at": "2025-01-01T00:00:00.000Z"
  },
  "sessionId": "session_id"
}
```

#### POST /auth/logout

**Request:**
```json
{
  "sessionId": "session_id"
}
```

**Response (200):**
```json
{
  "success": true
}
```

#### POST /auth/request-reset

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "token": "reset_token"
}
```

#### POST /auth/reset-password

**Request:**
```json
{
  "token": "reset_token",
  "password": "NewSecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true
}
```

## Security Features

### Password Security

1. **Strong hashing**: Argon2id with recommended parameters
2. **No plaintext storage**: Passwords are hashed immediately
3. **Timing-safe comparison**: Argon2 verify function prevents timing attacks

### Token Security

1. **Cryptographically secure**: Uses Web Crypto API
2. **High entropy**: 256 bits of randomness
3. **URL-safe encoding**: Base64url encoding
4. **Time-limited**: Tokens expire after use period
5. **Single-use**: Tokens are deleted after successful use

### Session Security

1. **Secure random IDs**: 200 bits of entropy
2. **Expiration tracking**: Sessions expire after 30 days
3. **IP and user agent tracking**: Optional context for audit logs
4. **Invalidation on password change**: All sessions deleted

### Email Enumeration Prevention

1. **Generic error messages**: "Invalid email or password" instead of "User not found"
2. **Consistent timing**: Password reset returns token even for non-existent emails
3. **No user existence revelation**: Resend verification returns generic success

### Error Handling

All authentication errors use the `AuthError` class with:
- `message`: Human-readable error message
- `code`: Machine-readable error code
- `statusCode`: HTTP status code

## Validation

### Email Validation

- **Format**: RFC 5322 simplified regex
- **Max length**: 254 characters
- **Normalization**: Lowercase and trimmed

### Password Validation

- **Min length**: 8 characters (configurable)
- **No max length**: (argon2 handles this)
- **Optional requirements**: Can add uppercase, lowercase, number, special char requirements

## Maintenance

### Token Cleanup

Expired tokens should be cleaned up periodically:

```typescript
import {
  cleanupExpiredVerificationTokens,
  cleanupExpiredResetTokens
} from 'clearauth'
import { cleanupExpiredSessions } from 'clearauth'

// Run daily via cron job
async function cleanupTokens(db: Kysely<Database>) {
  const verificationTokensDeleted = await cleanupExpiredVerificationTokens(db)
  const resetTokensDeleted = await cleanupExpiredResetTokens(db)
  const sessionsDeleted = await cleanupExpiredSessions(db)

  console.log('Cleanup complete:', {
    verificationTokensDeleted,
    resetTokensDeleted,
    sessionsDeleted
  })
}
```

## Integration with OAuth

The email/password authentication system integrates seamlessly with OAuth:

1. **Shared session management**: Both use the same session tables and functions
2. **Account linking**: OAuth can link to existing email/password accounts
3. **Hybrid users**: Users can have both password and OAuth provider IDs
4. **Unified user model**: Same user table for both auth methods

## Database Schema

The implementation uses these tables:

### users
- `id` - UUID primary key
- `email` - Email address (unique)
- `email_verified` - Boolean flag
- `password_hash` - Argon2id hash (nullable for OAuth-only users)
- `github_id` - GitHub OAuth ID (nullable)
- `google_id` - Google OAuth ID (nullable)
- `name` - User's full name (nullable)
- `avatar_url` - Profile picture URL (nullable)
- `created_at` - Timestamp
- `updated_at` - Timestamp (auto-updated)

### sessions
- `id` - Random session ID (primary key)
- `user_id` - User UUID (foreign key)
- `expires_at` - Expiration timestamp
- `ip_address` - Client IP (nullable)
- `user_agent` - User agent string (nullable)
- `created_at` - Timestamp

### email_verification_tokens
- `token` - Random token (primary key)
- `user_id` - User UUID (foreign key)
- `email` - Email being verified
- `expires_at` - Expiration timestamp (24 hours)
- `created_at` - Timestamp

### password_reset_tokens
- `token` - Random token (primary key)
- `user_id` - User UUID (foreign key)
- `expires_at` - Expiration timestamp (1 hour)
- `created_at` - Timestamp

## TypeScript Types

All functions and data structures are fully typed. Import types from `clearauth`:

```typescript
import type {
  User,
  Session,
  EmailVerificationToken,
  PasswordResetToken,
  RequestContext,
  ClearAuthConfig
} from 'clearauth'
```

## Error Codes

- `INVALID_EMAIL` - Email format is invalid
- `INVALID_PASSWORD` - Password does not meet requirements
- `EMAIL_EXISTS` - User with email already exists
- `INVALID_CREDENTIALS` - Email or password is incorrect
- `NO_PASSWORD_SET` - Account uses social login only
- `INVALID_TOKEN` - Token is invalid
- `TOKEN_EXPIRED` - Token has expired
- `ALREADY_VERIFIED` - Email is already verified
- `EMAIL_SENT` - Generic success message
- `MISSING_FIELDS` - Required fields missing from request
- `INVALID_JSON` - Request body is not valid JSON
- `INTERNAL_ERROR` - Unexpected server error

## Best Practices

1. **Email sending**: Implement actual email sending in your application
2. **Rate limiting**: Add rate limiting to prevent abuse
3. **Token cleanup**: Run cleanup jobs daily
4. **Password requirements**: Consider adding more password strength requirements
5. **Email verification**: Consider requiring email verification before login
6. **Session renewal**: Implement session renewal to extend active sessions
7. **Audit logging**: Log authentication events for security monitoring
8. **HTTPS only**: Always use HTTPS in production
9. **CSRF protection**: Add CSRF tokens for state-changing operations
10. **Account lockout**: Consider adding account lockout after failed login attempts
