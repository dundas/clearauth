# Deployment Guide: ClearAuth

> **Legacy document:** This guide contains older Better Auth deployment notes. For the current ClearAuth integration pattern, follow the README and the example apps under `examples/apps/*`.

This guide helps you choose the right deployment platform and understand the specific configuration needed for each.

## Installation

> **Note:** ClearAuth is published to npm as `clearauth`.

### Install from npm

```bash
npm install clearauth
```

### Install Specific Version

```bash
npm install clearauth@0.3.0
```

### Add to package.json

```json
{
  "dependencies": {
    "clearauth": "^0.3.0"
  }
}
```

Then run:
```bash
npm install
```

---

## Quick Decision Matrix

| Your Stack | Recommended Platform | Why |
|------------|---------------------|-----|
| Next.js App Router | **Vercel** or **Node.js** | First-class Better Auth support with `toNextJsHandler()` and `nextCookies` |
| React SPA (Vite, CRA) | **Cloudflare Pages** | Serve static files + auth functions in one deployment |
| Standalone Auth API | **Cloudflare Workers** | Edge deployment, minimal cold starts, global distribution |
| Express/Fastify Backend | **Node.js** (Fly.io, Railway, etc.) | Traditional server deployment with full routing control |
| Microservices | **Cloudflare Workers** | Lightweight, edge-deployed, scales to zero |

---

## Platform-Specific Guides

### 1. Next.js on Vercel

**Best For:** Full-stack Next.js applications with SSR/SSG

#### Advantages
- ✅ First-class Better Auth support
- ✅ Automatic `NEXTAUTH_URL` configuration
- ✅ Seamless routing (no catch-all issues)
- ✅ Server Components + Client Components
- ✅ `toNextJsHandler()` wrapper for proper request handling
- ✅ `nextCookies` plugin for server actions

#### Setup

**1. Install dependencies:**
```bash
npm install clearauth better-auth kysely
```

**2. Create `lib/auth.ts`:**
```ts
import { createClearAuth } from "clearauth"
import { nextCookies } from "better-auth/next-js"

export const auth = createClearAuth({
  secret: process.env.AUTH_SECRET!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  isProduction: process.env.NODE_ENV === "production",
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()], // Required for server actions
})
```

**3. Create `app/api/auth/[...all]/route.ts`:**
```ts
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { GET, POST } = toNextJsHandler(auth.handler)
```

**4. Set environment variables on Vercel:**
```bash
vercel env add AUTH_SECRET
vercel env add MECH_APP_ID
vercel env add MECH_API_KEY
```

**5. Deploy:**
```bash
vercel deploy --prod
```

#### Common Issues
- **Cookie not set in server actions:** Make sure you're using the `nextCookies()` plugin
- **Session not persisting:** Ensure `AUTH_SECRET` is set in production
- **TypeScript errors:** Import from `"better-auth/next-js"` not `"better-auth"`

---

### 2. Cloudflare Workers (Standalone API)

**Best For:** Standalone auth APIs, microservices, backend services

#### Advantages
- ✅ Edge deployment (global distribution)
- ✅ Minimal cold starts
- ✅ Direct handler usage (no wrappers)
- ✅ Full routing control
- ✅ Scales to zero (pay per request)

#### Setup

**1. Install dependencies:**
```bash
npm install clearauth better-auth kysely
```

**2. Create `src/auth.ts`:**
```ts
import { createClearAuth } from "clearauth"

export interface Env {
  AUTH_SECRET: string
  MECH_APP_ID: string
  MECH_API_KEY: string
}

export function createAuth(env: Env) {
  return createClearAuth({
    secret: env.AUTH_SECRET,
    database: {
      appId: env.MECH_APP_ID,
      apiKey: env.MECH_API_KEY,
    },
    isProduction: true,
    emailAndPassword: { enabled: true },
  })
}
```

**3. Create `src/index.ts`:**
```ts
import { createAuth, type Env } from "./auth"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/api/auth")) {
      const auth = createAuth(env)
      return auth.handler(request)
    }

    return new Response("Auth API", { status: 200 })
  },
}
```

**4. Configure `wrangler.toml`:**
```toml
name = "my-auth-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
MECH_APP_ID = "550e8400-e29b-41d4-a716-446655440000"
```

**5. Set secrets:**
```bash
wrangler secret put AUTH_SECRET
wrangler secret put MECH_API_KEY
```

**6. Deploy:**
```bash
wrangler deploy
```

#### Common Issues
- **`process.env` not working:** Use `env` bindings instead (passed to `fetch()`)
- **CORS errors:** Add CORS headers for OPTIONS requests
- **Session not accessible:** Ensure cookies are being set with proper domain

---

### 3. Cloudflare Pages (Frontend + Functions)

**Best For:** React/Vue/Svelte SPAs with auth functionality

#### Advantages
- ✅ Frontend + backend in one deployment
- ✅ Edge deployment
- ✅ Free tier with generous limits
- ✅ Automatic HTTPS and CDN

#### Caveats
⚠️ **Known Routing Issue:** Cloudflare Pages has a [documented routing bug](https://community.cloudflare.com/t/functions-index-js-not-accessible-when-a-path-js-route-exists/400706) where catch-all routes (`[[...path]].ts`) can prevent more specific routes from matching.

**Workaround:** Handle ALL auth routes in a single catch-all handler.

#### Setup

**1. Install dependencies:**
```bash
npm install clearauth better-auth kysely
```

**2. Create `functions/api/auth/[[...all]].ts`:**
```ts
import { createClearAuth } from "clearauth"

interface Env {
  AUTH_SECRET: string
  MECH_APP_ID: string
  MECH_API_KEY: string
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context

  const auth = createClearAuth({
    secret: env.AUTH_SECRET,
    database: {
      appId: env.MECH_APP_ID,
      apiKey: env.MECH_API_KEY,
    },
    isProduction: true,
    emailAndPassword: { enabled: true },
  })

  // IMPORTANT: All auth routes handled here due to CF Pages routing limitation
  // DO NOT create separate files like /functions/api/auth/sign-in.ts
  // They will be blocked by this catch-all route
  return auth.handler(request)
}
```

**3. Configure `wrangler.toml`:**
```toml
name = "my-pages-app"
compatibility_date = "2024-01-01"

[vars]
MECH_APP_ID = "550e8400-e29b-41d4-a716-446655440000"
```

**4. Set secrets:**
```bash
wrangler pages secret put AUTH_SECRET
wrangler pages secret put MECH_API_KEY
```

**5. Build and deploy:**
```bash
npm run build
wrangler pages deploy dist
```

#### Common Issues

**OAuth routes return 404:**
- Don't create separate OAuth handler files; put everything in `[[...all]].ts`

**Catch-all not matching:**
- Ensure the file is named `[[...all]].ts` (with three dots)

**Functions not deploying:**
- Check `wrangler.toml` has correct `compatibility_date`

**OAuth "not configured" error even though secrets are set:**
- **Symptom:** OAuth returns "not configured" despite secrets existing
- **Cause:** Secrets were set with empty values when using `wrangler pages secret put`
- **Debug:** Add `console.log({ envKeys: Object.keys(env), hasGitHub: !!env.GITHUB_CLIENT_ID })` to check
- **Fix:** Re-set secrets with actual values:
  ```bash
  echo "your_github_client_id" | wrangler pages secret put GITHUB_CLIENT_ID --project-name=your-project
  echo "your_github_secret" | wrangler pages secret put GITHUB_CLIENT_SECRET --project-name=your-project
  ```
  Then redeploy to load new secrets

---

### 4. Node.js (Express/Fastify)

**Best For:** Traditional backend servers, Docker deployments, self-hosted

#### Advantages
- ✅ Full routing control
- ✅ Works with any Node.js framework
- ✅ Easy local development
- ✅ No platform-specific quirks

#### Setup (Express)

**1. Install dependencies:**
```bash
npm install clearauth better-auth kysely express
```

**2. Create `server/auth.ts`:**
```ts
import { createClearAuth } from "clearauth"

export const auth = createClearAuth({
  secret: process.env.AUTH_SECRET!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  isProduction: process.env.NODE_ENV === "production",
  emailAndPassword: { enabled: true },
})
```

**3. Create `server/index.ts`:**
```ts
import express from "express"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./auth"

const app = express()

// Mount auth handler
app.all("/api/auth/*", toNodeHandler(auth))

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
})
```

**4. Set environment variables (`.env`):**
```bash
AUTH_SECRET=your-secret-key
MECH_APP_ID=550e8400-e29b-41d4-a716-446655440000
MECH_API_KEY=your-mech-api-key
NODE_ENV=production
```

**5. Deploy to Fly.io / Railway / etc:**
```bash
fly deploy
# or
railway up
```

---

## Environment Variable Management

### Development vs Production

| Platform | Development | Production |
|----------|-------------|------------|
| **Next.js/Vercel** | `.env.local` | Vercel dashboard or `vercel env add` |
| **Cloudflare Workers** | `.dev.vars` | `wrangler secret put` |
| **Cloudflare Pages** | `.dev.vars` | `wrangler pages secret put` |
| **Node.js** | `.env` | Platform-specific (Fly.io secrets, Railway vars, etc.) |

### Required Secrets

All platforms require these secrets:

```bash
AUTH_SECRET=<generate-with-openssl-rand-base64-32>
MECH_APP_ID=<your-mech-app-uuid>
MECH_API_KEY=<your-mech-api-key>
```

### Optional Configuration

```bash
# Only needed if using non-default Mech Storage URL
MECH_STORAGE_BASE_URL=https://storage.mechdna.net

# Only needed if using separate schema ID
MECH_APP_SCHEMA_ID=<your-schema-uuid>
```

---

## Troubleshooting by Platform

### Next.js/Vercel

**Issue:** Session not persisting after deployment
- ✅ **Solution:** Ensure `AUTH_SECRET` is set in Vercel environment variables
- ✅ **Solution:** Use `nextCookies()` plugin for server actions

**Issue:** `toNextJsHandler is not a function`
- ✅ **Solution:** Import from `"better-auth/next-js"` not `"better-auth"`

### Cloudflare Workers

**Issue:** `process.env is undefined`
- ✅ **Solution:** Use `env` bindings passed to `fetch()` function

**Issue:** Session cookies not set
- ✅ **Solution:** Ensure response includes `Set-Cookie` header (Better Auth handles this automatically)

### Cloudflare Pages

**Issue:** OAuth routes return 404
- ✅ **Solution:** Move all auth handling into `[[...all]].ts` catch-all due to routing limitation

**Issue:** Functions not deploying
- ✅ **Solution:** Ensure `functions/` directory is at project root, not inside `src/`

### Node.js

**Issue:** CORS errors in browser
- ✅ **Solution:** Add CORS middleware before auth routes
- ✅ **Solution:** Ensure `credentials: 'include'` in fetch requests

---

## Performance Considerations

### Cloudflare (Workers & Pages)
- **Cold start:** ~5-10ms (minimal)
- **Global latency:** <50ms (edge network)
- **Scaling:** Automatic, unlimited

### Vercel (Next.js)
- **Cold start:** ~100-500ms (serverless functions)
- **Regional latency:** Varies by region
- **Scaling:** Automatic up to plan limits

### Node.js (Self-hosted)
- **Cold start:** None (always warm)
- **Latency:** Depends on server location
- **Scaling:** Manual (horizontal scaling, load balancers)

---

## Migration Guide

### From Environment Variables to Explicit Config (0.1.0 → 0.2.0)

**Before:**
```ts
// Library automatically read process.env
const auth = createClearAuth({
  emailAndPassword: { enabled: true }
})
```

**After:**
```ts
// Must pass config explicitly
const auth = createClearAuth({
  secret: process.env.AUTH_SECRET!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  isProduction: process.env.NODE_ENV === "production",
  emailAndPassword: { enabled: true }
})
```

---

## Support & Resources

- [Better Auth Documentation](https://better-auth.vercel.app/docs)
- [Cloudflare Pages Functions Routing](https://developers.cloudflare.com/pages/functions/routing/)
- [Cloudflare Pages Routing Issue](https://community.cloudflare.com/t/functions-index-js-not-accessible-when-a-path-js-route-exists/400706)
- [Next.js Better Auth Integration](https://better-auth.vercel.app/docs/integrations/next)
- [Mech Storage Documentation](https://storage.mechdna.net/docs)

---

## Summary

| Platform | Setup Complexity | Routing Issues | Best Use Case |
|----------|-----------------|----------------|---------------|
| **Next.js/Vercel** | ⭐⭐ Medium | None | Full-stack apps with SSR |
| **Cloudflare Workers** | ⭐ Easy | None | Standalone auth APIs |
| **Cloudflare Pages** | ⭐⭐⭐ Complex | Yes (catch-all workaround needed) | SPAs with auth |
| **Node.js** | ⭐ Easy | None | Traditional backends |

Choose the platform that best matches your architecture and team expertise!
