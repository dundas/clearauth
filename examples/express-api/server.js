/**
 * Simple Express API with ClearAuth
 *
 * Environment variables:
 * - AUTH_SECRET, MECH_APP_ID, MECH_API_KEY (required)
 * - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (optional)
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (optional)
 */

import express from 'express';
import { handleClearAuthRequest, validateSession, parseCookies } from 'clearauth';
import { createClearAuthNode } from 'clearauth/node';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

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

// Initialize ClearAuth
const auth = createClearAuthNode({
  secret: process.env.AUTH_SECRET,
  baseUrl: BASE_URL,
  database: {
    appId: process.env.MECH_APP_ID,
    apiKey: process.env.MECH_API_KEY,
  },
  oauth: Object.keys(oauth).length > 0 ? oauth : undefined,
});

// Auth routes - handled by ClearAuth
app.all('/api/auth/*', async (req, res) => {
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const request = new Request(url, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
  });

  const response = await handleClearAuthRequest(request, auth);

  res.status(response.status);
  const setCookie = response.headers.getSetCookie?.() || [];
  if (setCookie.length) res.setHeader('Set-Cookie', setCookie);
  res.send(await response.text());
});

// Auth middleware
async function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies.get('session');

  if (sessionId) {
    const result = await validateSession(sessionId, auth.database);
    if (result) {
      req.user = result.user;
      return next();
    }
  }

  res.status(401).json({ error: 'Unauthorized' });
}

// Protected route
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Public route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on ${BASE_URL}`);
});
