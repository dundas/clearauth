/**
 * Express API Server with ClearAuth Authentication
 *
 * This example demonstrates:
 * 1. ClearAuth integration for user authentication (OAuth + email/password)
 * 2. Session-based auth for web UI
 * 3. API key auth for CLI/programmatic access
 * 4. Protected API routes
 *
 * Environment variables required:
 * - AUTH_SECRET: Secret for signing tokens (min 32 chars)
 * - MECH_APP_ID: Mech Storage app ID
 * - MECH_API_KEY: Mech Storage API key
 * - REDIS_URL: Redis connection URL (for API key storage)
 * - BASE_URL: Your API base URL (e.g., https://api.example.com)
 *
 * Optional:
 * - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET: GitHub OAuth
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: Google OAuth
 * - COOKIE_DOMAIN: For cross-subdomain auth (e.g., .example.com)
 * - CORS_ORIGINS: Comma-separated allowed origins
 * - PORT: Server port (default 3000)
 */

import express from 'express';
import cors from 'cors';
import Redis from 'ioredis';
import {
  initAuth,
  authHandler,
  authMiddleware,
  optionalAuthMiddleware,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from './lib/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Redis for API key storage
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
  console.log('Redis connected');
}

// Middleware
app.use(express.json());

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS;
const corsOptions = {
  origin: corsOrigins === '*' ? '*' : corsOrigins?.split(',').map((o) => o.trim()),
  credentials: true,
};
app.use(cors(corsOptions));

// Auth middleware instances
const requireAuth = authMiddleware({ redis });
const optionalAuth = optionalAuthMiddleware({ redis });

// ============================================================================
// Auth Routes (handled by ClearAuth)
// ============================================================================

// Mount ClearAuth handler for all /api/auth/* routes
app.all('/api/auth/*', authHandler);

// ============================================================================
// API Key Management Routes
// ============================================================================

// Create a new API key (requires auth)
app.post('/api/keys', requireAuth, async (req, res) => {
  if (!redis) {
    return res.status(503).json({ error: 'API key service not available' });
  }

  const { name } = req.body;

  try {
    const result = await createApiKey(redis, req.user.id, req.user.email, name || 'CLI');
    return res.json({
      apiKey: result.apiKey, // Only shown once!
      keyId: result.keyId,
      name: result.name,
      createdAt: result.createdAt,
      message: 'Save this API key - it will not be shown again',
    });
  } catch (e) {
    console.error('Failed to create API key:', e);
    return res.status(500).json({ error: 'Failed to create API key' });
  }
});

// List API keys (requires auth)
app.get('/api/keys', requireAuth, async (req, res) => {
  if (!redis) {
    return res.status(503).json({ error: 'API key service not available' });
  }

  try {
    const keys = await listApiKeys(redis, req.user.id);
    return res.json({ keys });
  } catch (e) {
    console.error('Failed to list API keys:', e);
    return res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// Revoke an API key (requires auth)
app.delete('/api/keys/:keyId', requireAuth, async (req, res) => {
  if (!redis) {
    return res.status(503).json({ error: 'API key service not available' });
  }

  try {
    const revoked = await revokeApiKey(redis, req.user.id, req.params.keyId);
    if (revoked) {
      return res.json({ success: true });
    } else {
      return res.status(404).json({ error: 'API key not found' });
    }
  } catch (e) {
    console.error('Failed to revoke API key:', e);
    return res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ============================================================================
// Protected API Routes
// ============================================================================

// Get current user (requires auth via session or API key)
app.get('/api/me', requireAuth, (req, res) => {
  return res.json({
    user: req.user,
    authMethod: req.authMethod,
  });
});

// Example protected resource
app.get('/api/protected-resource', requireAuth, (req, res) => {
  return res.json({
    message: `Hello ${req.user.email}!`,
    authMethod: req.authMethod,
    data: {
      // Your protected data here
      timestamp: new Date().toISOString(),
    },
  });
});

// ============================================================================
// Public Routes
// ============================================================================

// Health check (public)
app.get('/health', (req, res) => {
  return res.json({ status: 'ok' });
});

// Optional auth example - works with or without authentication
app.get('/api/public', optionalAuth, (req, res) => {
  if (req.user) {
    return res.json({
      message: `Welcome back, ${req.user.email}!`,
      authenticated: true,
    });
  } else {
    return res.json({
      message: 'Welcome, guest!',
      authenticated: false,
    });
  }
});

// ============================================================================
// Start Server
// ============================================================================

async function start() {
  // Check required environment variables
  const required = ['AUTH_SECRET', 'MECH_APP_ID', 'MECH_API_KEY'];
  const missing = required.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Auth will be disabled. Set these variables to enable authentication.');
  } else {
    // Initialize ClearAuth
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

    // Build OAuth config from environment
    const oauth = {};
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      oauth.github = {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        redirectUri: `${baseUrl}/api/auth/callback/github`,
      };
      console.log('GitHub OAuth enabled');
    }
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      oauth.google = {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: `${baseUrl}/api/auth/callback/google`,
      };
      console.log('Google OAuth enabled');
    }

    await initAuth({
      secret: process.env.AUTH_SECRET,
      baseUrl,
      database: {
        appId: process.env.MECH_APP_ID,
        apiKey: process.env.MECH_API_KEY,
      },
      isProduction: process.env.NODE_ENV === 'production',
      cookieDomain: process.env.COOKIE_DOMAIN,
      oauth: Object.keys(oauth).length > 0 ? oauth : undefined,
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Auth routes: /api/auth/*`);
    console.log(`API routes: /api/*`);
  });
}

start().catch(console.error);
