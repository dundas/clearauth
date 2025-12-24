/**
 * Simple Express API with ClearAuth
 *
 * Environment variables:
 * - AUTH_SECRET, MECH_APP_ID, MECH_API_KEY (required)
 * - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (optional)
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (optional)
 * - COOKIE_DOMAIN (optional, for cross-subdomain auth e.g. ".example.com")
 */

import express from 'express';
import { handleClearAuthRequest, validateSession, parseCookies } from 'clearauth';
import { createClearAuthNode, defaultSessionConfig } from 'clearauth/node';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

app.use(express.json());

// Build OAuth config from env
const oauth = {};
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  oauth.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUri: `${BASE_URL}/api/auth/callback/github`,
  };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauth.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${BASE_URL}/api/auth/callback/google`,
  };
}

// Initialize ClearAuth with cookie configuration
const auth = createClearAuthNode({
  secret: process.env.AUTH_SECRET,
  baseUrl: BASE_URL,
  database: {
    appId: process.env.MECH_APP_ID,
    apiKey: process.env.MECH_API_KEY,
  },
  isProduction: IS_PRODUCTION,
  oauth: Object.keys(oauth).length > 0 ? oauth : undefined,
  // Session cookie configuration
  session: {
    ...defaultSessionConfig,
    cookie: {
      ...defaultSessionConfig.cookie,
      // Cookie domain for cross-subdomain auth (e.g. ".example.com")
      // If set, cookie works across app.example.com and api.example.com
      domain: process.env.COOKIE_DOMAIN,
      // sameSite: 'lax' allows cookies on OAuth redirects
      sameSite: 'lax',
      // secure: true in production (HTTPS only)
      secure: IS_PRODUCTION,
      // httpOnly: true prevents JavaScript access (XSS protection)
      httpOnly: true,
    },
  },
});

/**
 * Auth routes - handled by ClearAuth
 *
 * Cookie flow:
 * 1. POST /api/auth/login or /api/auth/register
 *    - ClearAuth creates session in database
 *    - Returns Set-Cookie header with session token
 *    - Browser stores cookie automatically
 *
 * 2. GET /api/auth/oauth/github (or /google)
 *    - ClearAuth sets oauth_state and oauth_code_verifier cookies
 *    - Redirects to OAuth provider
 *
 * 3. GET /api/auth/callback/github
 *    - ClearAuth validates state cookie against callback params
 *    - Creates session, returns Set-Cookie with session token
 *    - Clears OAuth cookies, redirects to frontend
 */
app.all('/api/auth/*', async (req, res) => {
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const request = new Request(url, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
  });

  const response = await handleClearAuthRequest(request, auth);

  // Forward status
  res.status(response.status);

  // Forward Set-Cookie headers from ClearAuth response
  // This is how session cookies get sent to the browser
  const setCookie = response.headers.getSetCookie?.() || [];
  if (setCookie.length) {
    res.setHeader('Set-Cookie', setCookie);
  }

  // Forward other headers
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() !== 'set-cookie') {
      res.setHeader(key, value);
    }
  }

  res.send(await response.text());
});

/**
 * Auth middleware - validates session cookie
 *
 * Reads the 'session' cookie from the request, validates it against
 * the database, and attaches user info to req.user if valid.
 */
async function requireAuth(req, res, next) {
  // Parse cookies from Cookie header
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies.get('session');

  if (sessionId) {
    // Validate session against database
    const result = await validateSession(sessionId, auth.database);
    if (result) {
      req.user = result.user;
      req.session = result.session;
      return next();
    }
  }

  res.status(401).json({ error: 'Unauthorized' });
}

// Protected route - requires valid session cookie
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Public route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on ${BASE_URL}`);
  if (process.env.COOKIE_DOMAIN) {
    console.log(`Cookie domain: ${process.env.COOKIE_DOMAIN}`);
  }
});
