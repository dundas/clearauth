# ClearAuth on Cloudflare Workers

This guide covers deploying ClearAuth entirely on Cloudflare Workers with no Node.js backend required.

## Quick Start

```typescript
import {
  createClearAuth,
  handleClearAuthEdgeRequest,
  getSessionFromCookie,
  createMechKysely,
} from 'clearauth/edge';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle all /auth/* routes
    if (url.pathname.startsWith('/auth')) {
      const config = createClearAuth({
        secret: env.AUTH_SECRET,
        baseUrl: 'https://myapp.workers.dev',
        database: {
          appId: env.MECH_APP_ID,
          apiKey: env.MECH_API_KEY,
        },
        isProduction: true,
        oauth: {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            redirectUri: 'https://myapp.workers.dev/auth/callback/github',
          },
        },
      });

      return handleClearAuthEdgeRequest(request, config);
    }

    return new Response('Hello World');
  },
};
```

## What's Included in `clearauth/edge`

| Export | Description |
|--------|-------------|
| `createClearAuth` | Create auth configuration |
| `handleClearAuthEdgeRequest` | Handle all auth routes |
| `validateSession` | Validate session token |
| `getSessionFromCookie` | Get session from request cookies |
| `parseCookies` | Parse Cookie header |
| `createSessionCookie` | Create Set-Cookie header |
| `createMechKysely` | Create database connection |

## Session Validation Middleware

Protect routes by validating session cookies:

```typescript
import { getSessionFromCookie, createMechKysely } from 'clearauth/edge';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Protected API route
    if (url.pathname.startsWith('/api/')) {
      const db = createMechKysely({
        appId: env.MECH_APP_ID,
        apiKey: env.MECH_API_KEY,
      });

      const session = await getSessionFromCookie(request, db);

      if (!session) {
        return new Response('Unauthorized', { status: 401 });
      }

      // User is authenticated
      return new Response(`Hello, ${session.user.email}!`);
    }

    return new Response('Public route');
  },
};
```

## Cloudflare Pages Functions

For Cloudflare Pages, create a function in `functions/api/auth/[[path]].ts`:

```typescript
import { createClearAuth, handleClearAuthEdgeRequest } from 'clearauth/edge';

interface Env {
  AUTH_SECRET: string;
  MECH_APP_ID: string;
  MECH_API_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const config = createClearAuth({
    secret: context.env.AUTH_SECRET,
    baseUrl: 'https://myapp.pages.dev',
    database: {
      appId: context.env.MECH_APP_ID,
      apiKey: context.env.MECH_API_KEY,
    },
    isProduction: true,
  });

  return handleClearAuthEdgeRequest(context.request, config);
};
```

## Password Hashing on Edge

The edge entrypoint uses **PBKDF2** (WebCrypto) for password hashing, which is compatible with all edge runtimes. This differs from the Node.js entrypoint which uses Argon2id.

| Entrypoint | Password Hasher | Runtime |
|------------|-----------------|---------|
| `clearauth/edge` | PBKDF2 (WebCrypto) | Cloudflare Workers, Vercel Edge, Deno |
| `clearauth/node` | Argon2id | Node.js |
| `clearauth` | PBKDF2 (default) | Universal |

**Note:** Users registered on edge (PBKDF2) and Node.js (Argon2id) will have different hash formats. Plan your deployment accordingly.

### Cloudflare Workers PBKDF2 Iteration Count

**ClearAuth automatically detects Cloudflare Workers** and adjusts the PBKDF2 iteration count to comply with Cloudflare's WebCrypto limitations:

- **Cloudflare Workers**: 100,000 iterations (Cloudflare's maximum)
- **Other environments**: 600,000 iterations (OWASP recommended)

This happens automatically - **no configuration needed**. ClearAuth detects the Cloudflare Workers environment at runtime and uses the appropriate iteration count.

If you need to override this (not recommended), you can explicitly set the iteration count:

```typescript
import { createClearAuth, createPbkdf2PasswordHasher } from 'clearauth/edge';

const config = createClearAuth({
  secret: env.AUTH_SECRET,
  baseUrl: 'https://myapp.workers.dev',
  database: {
    appId: env.MECH_APP_ID,
    apiKey: env.MECH_API_KEY,
  },
  // Override automatic detection (not recommended)
  passwordHasher: createPbkdf2PasswordHasher({ iterations: 100_000 }),
});
```

**Why 100,000 iterations?**
Cloudflare Workers' WebCrypto implementation limits PBKDF2 to 100,000 iterations. While lower than OWASP's recommended 600,000, it's still secure and complies with NIST SP 800-132 minimum requirements (10,000 iterations).

## Environment Variables

Set these secrets using `wrangler secret put`:

```bash
wrangler secret put AUTH_SECRET
wrangler secret put MECH_APP_ID
wrangler secret put MECH_API_KEY
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

In `wrangler.toml`:

```toml
[vars]
BASE_URL = "https://myapp.workers.dev"
```

## Example Project

See the complete example in [`examples/cloudflare-workers/`](./examples/cloudflare-workers/).

```bash
cd examples/cloudflare-workers
npm install
npm run dev
```

## Troubleshooting

### "Cannot find module @node-rs/argon2"

Make sure you're importing from `clearauth/edge`, not `clearauth` or `clearauth/node`:

```typescript
// Correct
import { createClearAuth } from 'clearauth/edge';

// Wrong - will pull in argon2
import { createClearAuth } from 'clearauth/node';
```

### OAuth Callbacks Not Working

Ensure your `redirectUri` matches exactly what's configured in your OAuth provider (GitHub/Google console) and what you pass to `createClearAuth`.

### Session Cookie Not Being Set

Check that:
1. `isProduction: true` is set for HTTPS deployments (enables `Secure` flag)
2. `baseUrl` matches your actual deployment URL
3. Your client is on the same domain or a subdomain (for cookie sharing)
