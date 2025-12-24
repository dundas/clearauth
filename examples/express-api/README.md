# Express API with ClearAuth

This example demonstrates a complete Express API with ClearAuth authentication, supporting both session-based auth (for web UI) and API key auth (for CLI/programmatic access).

## Features

- OAuth login (GitHub, Google)
- Email/password registration and login
- Session-based authentication for web clients
- API key authentication for CLI/programmatic access
- Protected API routes
- API key management (create, list, revoke)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Web Client    │     │   CLI / API     │
│  (Session Auth) │     │  (API Key Auth) │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│           Express API Server            │
│  ┌─────────────────────────────────┐    │
│  │      authMiddleware()           │    │
│  │  1. Check API key (Bearer)      │    │
│  │  2. Check session cookie        │    │
│  └─────────────────────────────────┘    │
└────────┬────────────────────┬───────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│  Mech Storage   │  │     Redis       │
│ (Users/Sessions)│  │  (API Keys)     │
└─────────────────┘  └─────────────────┘
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

Create a `.env` file:

```bash
# Required
AUTH_SECRET=your-secret-key-at-least-32-characters
MECH_APP_ID=your-mech-app-id
MECH_API_KEY=your-mech-api-key
BASE_URL=http://localhost:3000

# Optional: Redis for API key storage
REDIS_URL=redis://localhost:6379

# Optional: OAuth providers
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional: Cross-domain cookies
COOKIE_DOMAIN=.example.com

# Optional: CORS
CORS_ORIGINS=http://localhost:3000,https://app.example.com
```

### 3. Run the server

```bash
npm run dev
```

## API Endpoints

### Authentication (ClearAuth)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/register` | POST | Register with email/password |
| `/api/auth/login` | POST | Login with email/password |
| `/api/auth/logout` | POST | Sign out |
| `/api/auth/session` | GET | Get current session |
| `/api/auth/oauth/github` | GET | Start GitHub OAuth |
| `/api/auth/oauth/google` | GET | Start Google OAuth |
| `/api/auth/callback/github` | GET | GitHub OAuth callback |
| `/api/auth/callback/google` | GET | Google OAuth callback |

### API Key Management

| Route | Method | Description |
|-------|--------|-------------|
| `/api/keys` | POST | Create new API key |
| `/api/keys` | GET | List your API keys |
| `/api/keys/:keyId` | DELETE | Revoke an API key |

### Protected Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/me` | GET | Get current user |
| `/api/protected-resource` | GET | Example protected endpoint |

### Public Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Health check |
| `/api/public` | GET | Works with or without auth |

## Usage Examples

### Web Client (Session Auth)

```javascript
// Login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Important for cookies
  body: JSON.stringify({ email: 'user@example.com', password: 'password' }),
});

// Access protected route (cookie sent automatically)
const me = await fetch('/api/me', { credentials: 'include' });
```

### CLI / Programmatic (API Key Auth)

```bash
# Create an API key (requires session auth first)
curl -X POST http://localhost:3000/api/keys \
  -H "Cookie: session=<your-session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My CLI Key"}'

# Response: { "apiKey": "api_abc12345_...", "keyId": "...", "message": "Save this API key - it will not be shown again" }

# Use the API key for subsequent requests
curl http://localhost:3000/api/me \
  -H "Authorization: Bearer api_abc12345_..."
```

### TypeScript/Node.js Client

```typescript
// With API key
const response = await fetch('https://api.example.com/api/me', {
  headers: {
    'Authorization': `Bearer ${process.env.API_KEY}`,
  },
});

const { user, authMethod } = await response.json();
// authMethod === 'api-key'
```

## Auth Middleware

The `authMiddleware` checks authentication in order:

1. **API Key** (Bearer token in Authorization header)
   - Looks up key hash in Redis
   - Used for CLI/programmatic access

2. **Session Cookie**
   - Validates session token with ClearAuth
   - Used for web UI access

```javascript
import { authMiddleware, optionalAuthMiddleware } from './lib/auth.js';

// Require authentication
app.get('/api/protected', authMiddleware({ redis }), (req, res) => {
  // req.user is guaranteed to exist
  // req.authMethod is 'api-key' or 'session'
});

// Optional authentication
app.get('/api/public', optionalAuthMiddleware({ redis }), (req, res) => {
  if (req.user) {
    // Authenticated user
  } else {
    // Anonymous access
  }
});
```

## API Key Format

API keys follow the format: `api_<user_prefix>_<random>`

- `api_` - Fixed prefix for identification
- `<user_prefix>` - First 8 chars of user ID (for debugging)
- `<random>` - 24 bytes of cryptographically secure random data (base64url)

Example: `api_abc12345_dGhpcyBpcyBhIHRlc3Qga2V5`

Keys are stored as SHA-256 hashes in Redis, never in plaintext.

## Security Notes

- API keys are only shown once when created
- Keys are stored as hashes (SHA-256)
- Session cookies use httpOnly, secure, sameSite flags
- Timing-safe comparison prevents timing attacks
- CORS is configurable for cross-origin requests
