/**
 * ClearAuth Cloudflare Workers Example
 *
 * This example demonstrates using ClearAuth entirely on Cloudflare Workers
 * with no Node.js backend required.
 *
 * Features:
 * - Full OAuth flow (GitHub, Google)
 * - Email/password authentication
 * - Session validation middleware
 * - Cookie-based sessions
 */

import {
  createClearAuth,
  handleClearAuthEdgeRequest,
  getSessionFromCookie,
  createMechKysely,
  type ClearAuthConfig,
} from 'clearauth/edge'

export interface Env {
  AUTH_SECRET: string
  BASE_URL: string
  MECH_APP_ID: string
  MECH_API_KEY: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

/**
 * Create ClearAuth configuration from environment
 */
function createAuthConfig(env: Env): ClearAuthConfig {
  const baseUrl = env.BASE_URL || 'http://localhost:8787'

  return createClearAuth({
    secret: env.AUTH_SECRET,
    baseUrl,
    database: {
      appId: env.MECH_APP_ID,
      apiKey: env.MECH_API_KEY,
    },
    isProduction: baseUrl.startsWith('https://'),
    oauth: {
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          redirectUri: `${baseUrl}/auth/callback/github`,
        },
      }),
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri: `${baseUrl}/auth/callback/google`,
        },
      }),
    },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Handle authentication routes
    if (url.pathname.startsWith('/auth')) {
      const config = createAuthConfig(env)
      return handleClearAuthEdgeRequest(request, config)
    }

    // Protected route example
    if (url.pathname === '/api/me') {
      const db = createMechKysely({
        appId: env.MECH_APP_ID,
        apiKey: env.MECH_API_KEY,
      })

      const session = await getSessionFromCookie(request, db)

      if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        user: session.user,
        session: {
          id: session.session.id,
          expiresAt: session.session.expires_at,
        },
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Home page
    if (url.pathname === '/') {
      return new Response(getHomePage(), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    return new Response('Not Found', { status: 404 })
  },
}

function getHomePage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>ClearAuth Cloudflare Workers Example</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    .btn { display: inline-block; padding: 10px 20px; margin: 5px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px; }
    .btn:hover { background: #0052a3; }
    .btn.github { background: #333; }
    .btn.google { background: #ea4335; }
    pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
    #status { margin: 20px 0; padding: 15px; background: #f0f0f0; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>ClearAuth on Cloudflare Workers</h1>
  <p>This example runs entirely on Cloudflare Workers with no Node.js backend.</p>

  <div id="status">Loading...</div>

  <h2>Authentication</h2>
  <a href="/auth/oauth/github" class="btn github">Login with GitHub</a>
  <a href="/auth/oauth/google" class="btn google">Login with Google</a>

  <h2>API Endpoints</h2>
  <pre>
GET /auth/session     - Get current session
GET /api/me          - Get current user (protected)
POST /auth/register   - Register with email/password
POST /auth/login      - Login with email/password
POST /auth/logout     - Logout
  </pre>

  <script>
    async function checkSession() {
      try {
        const res = await fetch('/auth/session');
        const data = await res.json();
        if (data.user) {
          document.getElementById('status').innerHTML =
            '<strong>Logged in as:</strong> ' + data.user.email +
            '<br><a href="#" onclick="logout()">Logout</a>';
        } else {
          document.getElementById('status').innerHTML = '<strong>Not logged in</strong>';
        }
      } catch (e) {
        document.getElementById('status').innerHTML = 'Error: ' + e.message;
      }
    }

    async function logout() {
      await fetch('/auth/logout', { method: 'POST' });
      location.reload();
    }

    checkSession();
  </script>
</body>
</html>`
}
