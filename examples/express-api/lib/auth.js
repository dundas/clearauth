/**
 * Authentication module for Express API
 *
 * Uses ClearAuth for user authentication and provides
 * per-user API key generation for CLI/programmatic access.
 *
 * This pattern supports multiple auth methods:
 * 1. Session cookies (for web UI login)
 * 2. Bearer tokens / API keys (for CLI/programmatic access)
 */

import crypto from 'crypto';

const USER_ID_PREFIX_LENGTH = 8;

let _auth = null;
let _authHandler = null;
let _validateSession = null;
let _parseCookies = null;

/**
 * Initialize ClearAuth configuration
 * Call this once at startup
 */
export async function initAuth(config) {
  const { handleClearAuthRequest, validateSession, parseCookies } = await import('clearauth');
  const { createClearAuthNode, defaultSessionConfig } = await import('clearauth/node');

  const authConfig = createClearAuthNode({
    secret: config.secret,
    baseUrl: config.baseUrl,
    database: {
      appId: config.database.appId,
      apiKey: config.database.apiKey,
    },
    isProduction: config.isProduction ?? process.env.NODE_ENV === 'production',
    session: {
      ...defaultSessionConfig,
      expiresIn: config.sessionMaxAge ?? 30 * 24 * 60 * 60, // 30 days default
      cookie: {
        ...defaultSessionConfig.cookie,
        domain: config.cookieDomain,
        sameSite: 'lax',
        secure: config.isProduction ?? process.env.NODE_ENV === 'production',
      },
    },
    oauth: config.oauth,
    password: { minLength: config.passwordMinLength ?? 8 },
  });

  _auth = authConfig;
  _authHandler = handleClearAuthRequest;
  _validateSession = validateSession;
  _parseCookies = parseCookies;

  console.log('ClearAuth initialized');
  return authConfig;
}

/**
 * Get the current auth configuration
 */
export function getAuth() {
  return _auth;
}

/**
 * Express handler for ClearAuth routes
 * Mount at /api/auth/* in your Express app
 *
 * Example:
 *   app.use('/api/auth', authHandler)
 */
export async function authHandler(req, res) {
  if (!_auth || !_authHandler) {
    return res.status(503).json({
      error: 'Authentication service not configured',
    });
  }

  try {
    // Convert Express request to Web Request
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    const method = req.method || 'GET';
    const body = method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {});

    const request = new Request(url, { method, headers, body });
    const response = await _authHandler(request, _auth);

    // Convert Web Response to Express response
    res.status(response.status);

    // Handle Set-Cookie headers
    const setCookie =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];
    if (setCookie.length > 0) {
      res.setHeader('Set-Cookie', setCookie);
    }

    // Copy other headers
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() !== 'set-cookie') {
        res.setHeader(key, value);
      }
    }

    const text = await response.text();
    return res.send(text);
  } catch (e) {
    console.error('Auth handler error:', e?.message || e);
    return res.status(503).json({ error: 'Authentication service unavailable' });
  }
}

/**
 * Generate a secure API key for a user
 * Format: api_<user_id_prefix>_<random_bytes>
 */
export function generateApiKey(userId) {
  if (!userId || typeof userId !== 'string' || userId.length < USER_ID_PREFIX_LENGTH) {
    throw new Error('Invalid userId');
  }
  const userPrefix = userId.slice(0, USER_ID_PREFIX_LENGTH);
  const randomPart = crypto.randomBytes(24).toString('base64url');
  return `api_${userPrefix}_${randomPart}`;
}

/**
 * Hash an API key for storage (we store the hash, not the plaintext)
 */
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Middleware to authenticate requests using session or API key
 *
 * Supports multiple auth methods (checked in priority order):
 * 1. Bearer token (API key from CLI/programmatic access)
 * 2. Session cookie (from web UI login)
 *
 * Sets req.user and req.authMethod on success
 *
 * @param {Object} options
 * @param {Object} options.redis - Redis client for API key storage
 */
export function authMiddleware({ redis }) {
  return async (req, res, next) => {
    // 1. Try API key auth (for CLI/programmatic access)
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (token && redis) {
      const keyHash = hashApiKey(token);
      try {
        const keyData = await redis.get(`api_key:${keyHash}`);
        if (keyData) {
          const parsed = JSON.parse(keyData);
          req.user = { id: parsed.userId, email: parsed.email };
          req.apiKeyId = parsed.keyId;
          req.authMethod = 'api-key';
          return next();
        }
      } catch (e) {
        // API key lookup failed, continue to session auth
      }
    }

    // 2. Try session auth (for web UI)
    if (_auth && _validateSession && _parseCookies) {
      try {
        const cookieHeader = req.headers.cookie || '';
        const cookies = _parseCookies(cookieHeader);
        const cookieName = _auth.session?.cookie?.name || 'session';
        const sessionId = cookies.get ? cookies.get(cookieName) : cookies[cookieName];

        if (sessionId) {
          const result = await _validateSession(sessionId, _auth.database);
          if (result) {
            req.user = {
              id: result.user.id,
              email: result.user.email,
              name: result.user.name,
              emailVerified: result.user.emailVerified,
            };
            req.session = result.session;
            req.authMethod = 'session';
            return next();
          }
        }
      } catch (e) {
        // Session auth failed
      }
    }

    // No valid auth
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

/**
 * Optional auth middleware - doesn't fail if not authenticated
 * Useful for endpoints that work with or without auth
 */
export function optionalAuthMiddleware({ redis }) {
  const required = authMiddleware({ redis });
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    let authFailed = false;

    res.json = (body) => {
      if (res.statusCode === 401) {
        authFailed = true;
        res.statusCode = 200;
        res.json = originalJson;
        return next();
      }
      return originalJson(body);
    };

    await required(req, res, () => {
      res.json = originalJson;
      next();
    });

    if (authFailed) {
      res.json = originalJson;
    }
  };
}

/**
 * Store a new API key for a user
 * Returns the plaintext key (only shown once)
 */
export async function createApiKey(redis, userId, email, name = 'CLI') {
  if (!userId || typeof userId !== 'string' || userId.length < USER_ID_PREFIX_LENGTH) {
    throw new Error('Invalid userId');
  }
  const apiKey = generateApiKey(userId);
  const keyHash = hashApiKey(apiKey);
  const keyId = crypto.randomUUID();

  const keyData = {
    keyId,
    userId,
    email,
    name,
    createdAt: Date.now(),
    lastUsedAt: null,
  };

  // Store key hash -> user mapping (no expiry - keys persist until revoked)
  await redis.set(`api_key:${keyHash}`, JSON.stringify(keyData));

  // Store user -> keys mapping for listing/revoking
  await redis.sadd(`user_api_keys:${userId}`, keyHash);

  return { apiKey, keyId, name, createdAt: keyData.createdAt };
}

/**
 * List API keys for a user (returns metadata, not the actual keys)
 */
export async function listApiKeys(redis, userId) {
  const keyHashes = await redis.smembers(`user_api_keys:${userId}`);
  const keys = [];

  for (const hash of keyHashes) {
    const data = await redis.get(`api_key:${hash}`);
    if (data) {
      const parsed = JSON.parse(data);
      keys.push({
        keyId: parsed.keyId,
        name: parsed.name,
        createdAt: parsed.createdAt,
        lastUsedAt: parsed.lastUsedAt,
        preview: `api_${String(parsed.userId || '').slice(0, USER_ID_PREFIX_LENGTH)}_****`,
      });
    }
  }

  return keys;
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(redis, userId, keyId) {
  const keyHashes = await redis.smembers(`user_api_keys:${userId}`);

  for (const hash of keyHashes) {
    const data = await redis.get(`api_key:${hash}`);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed.keyId === keyId) {
        await redis.del(`api_key:${hash}`);
        await redis.srem(`user_api_keys:${userId}`, hash);
        return true;
      }
    }
  }

  return false;
}
