# OAuth Quick Reference

## Configuration

```typescript
import { createMechKysely } from 'clearauth'
import type { ClearAuthConfig } from 'clearauth'

const config: ClearAuthConfig = {
  database: createMechKysely({ appId, apiKey }),
  secret: 'your-secret-key',
  baseUrl: 'https://yourdomain.com',
  isProduction: true,
  oauth: {
    github: {
      clientId: 'github_client_id',
      clientSecret: 'github_client_secret',
      redirectUri: 'https://yourdomain.com/auth/callback/github',
    },
    google: {
      clientId: 'google_client_id',
      clientSecret: 'google_client_secret',
      redirectUri: 'https://yourdomain.com/auth/callback/google',
    },
  },
  session: {
    expiresIn: 2592000, // 30 days
    cookie: {
      name: 'session',
      sameSite: 'lax',
      httpOnly: true,
      secure: true,
      path: '/',
    },
  },
}
```

## Cloudflare Worker

```typescript
import { handleOAuthRequest } from 'clearauth'

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/auth/')) {
      return handleOAuthRequest(request, config)
    }

    // ... other routes
  }
}
```

## Routes

| Route | Description |
|-------|-------------|
| `GET /auth/github/login` | Start GitHub OAuth |
| `GET /auth/callback/github` | GitHub callback |
| `GET /auth/google/login` | Start Google OAuth |
| `GET /auth/callback/google` | Google callback |

## Frontend

```html
<a href="/auth/github/login">
  <button>Sign in with GitHub</button>
</a>

<a href="/auth/google/login">
  <button>Sign in with Google</button>
</a>
```

## Session Validation

```typescript
import { validateSession, parseCookies } from 'clearauth'

const cookies = parseCookies(request.headers.get('Cookie') || '')
const sessionId = cookies['session']
const user = await validateSession(db, sessionId)

if (!user) {
  return new Response('Unauthorized', { status: 401 })
}
```

## Logout

```typescript
import { deleteSession, createDeleteCookieHeader } from 'clearauth'

await deleteSession(db, sessionId)

return new Response(null, {
  status: 302,
  headers: {
    Location: '/',
    'Set-Cookie': createDeleteCookieHeader('session', { path: '/' }),
  },
})
```

## API Functions

```typescript
// Arctic Providers
createGitHubProvider(config: ClearAuthConfig): GitHub
createGoogleProvider(config: ClearAuthConfig): Google

// GitHub OAuth
generateGitHubAuthUrl(config): Promise<{ url, state }>
handleGitHubCallback(config, code, storedState, returnedState): Promise<OAuthCallbackResult>

// Cookie Helpers
parseCookies(cookieHeader: string): Record<string, string>
createCookieHeader(name, value, options): string
createDeleteCookieHeader(name, options): string

// HTTP Handler
handleOAuthRequest(request: Request, config: ClearAuthConfig): Promise<Response>
```

## Types

```typescript
interface OAuthUserProfile {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  email_verified?: boolean
}

interface OAuthCallbackResult {
  profile: OAuthUserProfile
  accessToken?: string
  refreshToken?: string
}

interface RequestContext {
  ipAddress?: string
  userAgent?: string
}
```

## Security Features

- ✅ CSRF protection via state parameter
- ✅ PKCE for Google OAuth
- ✅ httpOnly, secure, sameSite cookies
- ✅ 200-bit entropy session IDs
- ✅ IP address and user agent tracking
- ✅ Automatic session expiration

## Environment Variables

```bash
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
AUTH_SECRET=your_random_secret_key
MECH_APP_ID=your_mech_app_id
MECH_API_KEY=your_mech_api_key
```

## OAuth App Setup

**GitHub:** https://github.com/settings/developers
- Application name: Your app name
- Homepage URL: https://yourdomain.com
- Callback URL: https://yourdomain.com/auth/callback/github

**Google:** https://console.cloud.google.com/apis/credentials
- Application type: Web application
- Authorized redirect URIs: https://yourdomain.com/auth/callback/google

## Troubleshooting

| Error | Solution |
|-------|----------|
| "GitHub OAuth is not configured" | Add `config.oauth.github` with all fields |
| "Invalid OAuth state parameter" | Enable cookies, check expiration (10 min) |
| "No email found in GitHub account" | User needs verified email on GitHub |
| Session cookie not set | Set `secure: false` for localhost dev |
| Redirect loop | Check redirect URIs match exactly |

## Testing Locally

1. Create OAuth apps (GitHub + Google)
2. Set environment variables
3. Run `npm run dev` or `wrangler dev`
4. Visit `http://localhost:8787/auth/github/login`
5. Check session cookie in browser DevTools
6. Verify user created in database

## Account Linking

The system automatically links accounts:
1. New OAuth user → Creates new account
2. Email exists → Links OAuth to existing account
3. Existing OAuth → Updates profile with latest data

Example:
- User signs up with email: `user@example.com`
- User signs in with GitHub: `user@example.com`
- System links GitHub ID to existing account
- User can now use either method

## File Structure

```
src/
├── types.ts                    # Type definitions
├── oauth/
│   ├── arctic-providers.ts     # OAuth client factory
│   ├── github.ts               # GitHub flow
│   ├── google.ts               # Google flow
│   ├── callbacks.ts            # Shared utilities
│   └── handler.ts              # HTTP handler
└── database/
    └── schema.ts               # Database types
```
