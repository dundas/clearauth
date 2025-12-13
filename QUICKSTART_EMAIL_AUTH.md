# Quick Start: Email/Password Authentication

Get started with email/password authentication in ClearAuth in 5 minutes.

## Installation

```bash
npm install clearauth
```

Dependencies installed automatically:
- `@node-rs/argon2` - Password hashing
- `oslo` - Crypto utilities
- `kysely` - Type-safe SQL

## Setup

### 1. Database Connection

```typescript
import { Kysely } from 'kysely'
import type { Database } from 'clearauth'

// Your database instance (PostgreSQL, MySQL, etc.)
const db: Kysely<Database> = ... // Your Kysely setup
```

### 2. Configuration

```typescript
import type { ClearAuthConfig } from 'clearauth'

const config: ClearAuthConfig = {
  database: db,
  secret: process.env.AUTH_SECRET!,
  baseUrl: 'https://your-app.com',
  isProduction: true,
  emailPassword: {
    enabled: true,
    requireEmailVerification: true
  }
}
```

## Basic Usage

### User Registration

```typescript
import { registerUser } from 'clearauth'

const { user, sessionId, verificationToken } = await registerUser(
  db,
  'user@example.com',
  'SecurePass123!',
  {
    ipAddress: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent')
  }
)

// Send verification email with token
await sendEmail(user.email, {
  subject: 'Verify your email',
  body: `Click here: https://your-app.com/verify?token=${verificationToken}`
})

// Set session cookie
response.headers.set('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Secure; SameSite=Strict`)
```

### Email Verification

```typescript
import { verifyEmail } from 'clearauth'

const { success, userId } = await verifyEmail(db, token)

if (success) {
  console.log('Email verified!')
}
```

### User Login

```typescript
import { loginUser } from 'clearauth'

const { user, sessionId } = await loginUser(
  db,
  'user@example.com',
  'SecurePass123!',
  {
    ipAddress: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent')
  }
)

// Set session cookie
response.headers.set('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Secure; SameSite=Strict`)
```

### Session Validation (Middleware)

```typescript
import { validateSession } from 'clearauth'

async function requireAuth(sessionId: string) {
  const user = await validateSession(db, sessionId)

  if (!user) {
    throw new Error('Unauthorized')
  }

  return user
}

// Usage
const sessionId = getCookie('sessionId')
const user = await requireAuth(sessionId)
console.log('Authenticated user:', user.email)
```

### Password Reset

```typescript
import { requestPasswordReset, resetPassword } from 'clearauth'

// Step 1: User requests reset
const { token } = await requestPasswordReset(db, 'user@example.com')

// Send reset email
await sendEmail('user@example.com', {
  subject: 'Reset your password',
  body: `Click here: https://your-app.com/reset?token=${token}`
})

// Step 2: User submits new password
const { success } = await resetPassword(db, token, 'NewSecurePass123!')

if (success) {
  console.log('Password reset successful!')
}
```

### Logout

```typescript
import { deleteSession } from 'clearauth'

await deleteSession(db, sessionId)

// Clear session cookie
response.headers.set('Set-Cookie', 'sessionId=; Max-Age=0')
```

## HTTP Handler (All-in-One)

Use the built-in HTTP handler for a complete REST API:

```typescript
import { handleAuthRequest } from 'clearauth'

// In your request handler
async function handleRequest(request: Request) {
  const config = {
    database: db,
    secret: process.env.AUTH_SECRET!,
    baseUrl: 'https://your-app.com',
    isProduction: true
  }

  return await handleAuthRequest(request, config)
}

// Routes automatically handled:
// POST /auth/register
// POST /auth/verify-email
// POST /auth/resend-verification
// POST /auth/login
// POST /auth/logout
// POST /auth/request-reset
// POST /auth/reset-password
```

## API Examples

### POST /auth/register

```bash
curl -X POST https://your-app.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}'
```

Response:
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

### POST /auth/login

```bash
curl -X POST https://your-app.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}'
```

Response:
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

## Error Handling

All errors return a consistent format:

```typescript
try {
  await loginUser(db, email, password)
} catch (error) {
  if (error instanceof AuthError) {
    console.log(error.code)      // 'INVALID_CREDENTIALS'
    console.log(error.message)   // 'Invalid email or password'
    console.log(error.statusCode) // 401
  }
}
```

Common error codes:
- `INVALID_EMAIL` - Email format is invalid
- `INVALID_PASSWORD` - Password doesn't meet requirements
- `EMAIL_EXISTS` - User already exists
- `INVALID_CREDENTIALS` - Login failed
- `INVALID_TOKEN` - Token is invalid or expired
- `NO_PASSWORD_SET` - Account uses OAuth only

## Security Best Practices

1. **Always use HTTPS** in production
2. **Set secure cookies**: `HttpOnly; Secure; SameSite=Strict`
3. **Implement rate limiting** to prevent brute force
4. **Send verification emails** for account security
5. **Run cleanup jobs** daily to remove expired tokens
6. **Monitor failed logins** for security events
7. **Add CSRF protection** for state-changing operations

## Database Maintenance

Run these cleanup jobs daily via cron:

```typescript
import {
  cleanupExpiredSessions,
  cleanupExpiredVerificationTokens,
  cleanupExpiredResetTokens
} from 'clearauth'

async function dailyCleanup() {
  const sessions = await cleanupExpiredSessions(db)
  const verificationTokens = await cleanupExpiredVerificationTokens(db)
  const resetTokens = await cleanupExpiredResetTokens(db)

  console.log('Cleanup complete:', {
    sessions,
    verificationTokens,
    resetTokens
  })
}
```

## TypeScript Types

Full TypeScript support with strict mode:

```typescript
import type {
  User,
  Session,
  EmailVerificationToken,
  PasswordResetToken,
  RequestContext,
  ClearAuthConfig,
  Database
} from 'clearauth'
```

## Next Steps

1. **Read the full documentation**: [EMAIL_PASSWORD_AUTH.md](./docs/EMAIL_PASSWORD_AUTH.md)
2. **See complete examples**: [email-password-example.ts](./examples/email-password-example.ts)
3. **Set up email sending**: Integrate with SendGrid, Postmark, etc.
4. **Add rate limiting**: Protect against abuse
5. **Write tests**: Add integration tests for your flows
6. **Deploy**: Works with Node.js, Cloudflare Workers, etc.

## Support

- **GitHub**: https://github.com/dundas/clearauth
- **Issues**: https://github.com/dundas/clearauth/issues
- **Documentation**: See [EMAIL_PASSWORD_AUTH.md](./docs/EMAIL_PASSWORD_AUTH.md)

## License

MIT
