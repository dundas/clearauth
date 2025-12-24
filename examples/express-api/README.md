# Express API with ClearAuth

Simple Express API with ClearAuth authentication.

## Setup

```bash
npm install
```

Create `.env`:

```bash
AUTH_SECRET=your-secret-key-at-least-32-characters
MECH_APP_ID=your-mech-app-id
MECH_API_KEY=your-mech-api-key

# Optional: OAuth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Optional: Cross-subdomain cookies (e.g. share between app.example.com and api.example.com)
COOKIE_DOMAIN=.example.com
```

## Run

```bash
npm run dev
```

## Cookie Handling

### How it works

1. **Login/Register** (`POST /api/auth/login`)
   - ClearAuth creates a session in the database
   - Returns `Set-Cookie: session=<token>; HttpOnly; Secure; SameSite=Lax`
   - Browser stores the cookie automatically

2. **OAuth flow** (`GET /api/auth/oauth/github`)
   - Sets `oauth_state` and `oauth_code_verifier` cookies (PKCE)
   - Redirects to GitHub/Google
   - Callback validates state, creates session, clears OAuth cookies

3. **Protected routes** (`GET /api/me`)
   - Middleware reads `session` cookie from request
   - Validates session token against database
   - Attaches `req.user` if valid

### Cookie configuration

```js
session: {
  cookie: {
    domain: '.example.com',  // Cross-subdomain (optional)
    sameSite: 'lax',         // Required for OAuth redirects
    secure: true,            // HTTPS only in production
    httpOnly: true,          // No JavaScript access (XSS protection)
  }
}
```

### Cross-domain setup

If your API (`api.example.com`) and frontend (`app.example.com`) are on different subdomains:

1. Set `COOKIE_DOMAIN=.example.com` (note the leading dot)
2. Frontend must use `credentials: 'include'` in fetch requests

```js
// Frontend
fetch('https://api.example.com/api/me', { credentials: 'include' })
```

## Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/register` | POST | Register (sets session cookie) |
| `/api/auth/login` | POST | Login (sets session cookie) |
| `/api/auth/logout` | POST | Logout (clears session cookie) |
| `/api/auth/session` | GET | Get current session |
| `/api/auth/oauth/github` | GET | Start GitHub OAuth |
| `/api/auth/oauth/google` | GET | Start Google OAuth |
| `/api/me` | GET | Get current user (protected) |
| `/health` | GET | Health check |
