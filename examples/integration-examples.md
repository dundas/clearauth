# ClearAuth + Better Auth Integration Examples

> **Legacy document:** This file describes an older approach based on Better Auth wrappers and `auth.handler`.
> The current recommended entrypoint in this repo is the unified handler `handleClearAuthRequest(request, config)`.
> Treat the examples below as historical reference until they are rewritten.

## Deployment Platform Comparison

Choose your deployment platform based on your architecture:

| Platform | Best For | Handler Type | Routing | Database |
|----------|----------|--------------|---------|----------|
| **Next.js/Vercel** | Full-stack apps with SSR/SSG | `toNextJsHandler()` | Next.js routing (seamless) | Mech Storage (HTTP) |
| **Cloudflare Workers** | Standalone auth API, microservices | Direct `auth.handler` | Manual routing | Mech Storage (HTTP) |
| **Cloudflare Pages** | Frontend apps with auth functions | `onRequest()` + catch-all | [Known routing issues](https://community.cloudflare.com/t/functions-index-js-not-accessible-when-a-path-js-route-exists/400706) | Mech Storage (HTTP) |
| **Node.js/Express** | Traditional backends | Express middleware | Express routing | Mech Storage (HTTP) |

### Key Differences

**Next.js/Vercel:**
- ✅ First-class Better Auth support (`toNextJsHandler`, `nextCookies` plugin)
- ✅ Seamless routing (no catch-all issues)
- ✅ Server Components and Client Components support
- ✅ Automatic `NEXTAUTH_URL` on Vercel
- 🔧 Uses `process.env` (Node.js runtime)

**Cloudflare Workers:**
- ✅ Standalone API deployment
- ✅ Edge runtime (global distribution)
- ✅ Direct handler usage (no wrappers needed)
- ✅ Full routing control
- 🔧 Uses `env` bindings (no `process.env`)

**Cloudflare Pages:**
- ✅ Frontend + auth in one deployment
- ✅ Edge runtime
- ⚠️ **Routing limitation:** Catch-all routes (`[[...path]].ts`) can block specific routes
- 🔧 Workaround: Handle all auth in single catch-all handler
- 🔧 Uses `env` bindings (no `process.env`)

---

## Next.js (App Router)

> **Use this approach for:** Next.js apps deployed to Vercel, standalone Node.js servers, or Docker
>
> **Note:** Next.js has first-class Better Auth support with the `toNextJsHandler()` wrapper and `nextCookies` plugin for proper cookie handling.

1. Install dependencies in your Next.js app:

```bash
npm install clearauth better-auth kysely
```

2. Create `.env.local` and add your credentials:

```bash
AUTH_SECRET=your-secret-key-at-least-32-chars
MECH_APP_ID=550e8400-e29b-41d4-a716-446655440000
MECH_API_KEY=your-mech-api-key
```

3. Create `lib/auth.ts`:

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
  emailAndPassword: {
    enabled: true
  },
  plugins: [
    nextCookies(), // Required for proper cookie handling in Next.js
  ],
})
```

4. Create `app/api/auth/[...all]/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

// Use the official Next.js handler wrapper
export const { GET, POST } = toNextJsHandler(auth.handler)
```

5. Use ClearAuth React hooks in client components:

```tsx
"use client"

import { AuthProvider, useAuth } from "clearauth/react"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider baseUrl="/api/auth">{children}</AuthProvider>
}

export function UserButton() {
  const { user, loading, signIn, signOut } = useAuth()

  if (loading) return null
  if (!user) return <button onClick={() => signIn("user@example.com", "password")}>Sign In</button>
  return <button onClick={() => signOut()}>Sign Out</button>
}
```

6. Use in React Server Components:

```tsx
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export default async function Dashboard() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (!session) {
    return <p>Not authenticated</p>
  }

  return <p>Welcome, {session.user.email}!</p>
}
```

7. Use in Client Components:

```tsx
"use client"

import { useSession, signIn, signOut } from "@/lib/auth-client"

export function UserButton() {
  const session = useSession()

  if (session.data) {
    return (
      <div>
        <p>Welcome, {session.data.user.email}!</p>
        <button onClick={() => signOut()}>Sign Out</button>
      </div>
    )
  }

  return (
    <button onClick={() => signIn.email({
      email: "user@example.com",
      password: "password"
    })}>
      Sign In
    </button>
  )
}
```

8. Deploy to Vercel:

```bash
vercel deploy
```

> **Vercel Note:** You don't need to set `NEXTAUTH_URL` explicitly on Vercel - it's automatically configured.

## Vite + React with a Node backend

1. Install dependencies in your backend:

```bash
npm install clearauth better-auth kysely express
```

And in your Vite app:

```bash
npm install clearauth
```

2. Create `.env` in your backend directory:

```bash
AUTH_SECRET=your-secret-key-at-least-32-chars
MECH_APP_ID=550e8400-e29b-41d4-a716-446655440000
MECH_API_KEY=your-mech-api-key
NODE_ENV=development
```

3. Create `server/auth.ts` in your backend.

```ts
import { createClearAuth } from "clearauth"

export const auth = createClearAuth({
  secret: process.env.AUTH_SECRET!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  isProduction: process.env.NODE_ENV === "production",
  emailAndPassword: {
    enabled: true
  }
})
```

4. Mount the Better Auth handler on your backend, for example with Express.

```ts
import express from "express"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./auth"

const app = express()

app.all("/api/auth/*", toNodeHandler(auth))

app.listen(8000)
```

5. Use ClearAuth React hooks in your Vite app.

```tsx
import { AuthProvider } from "clearauth/react"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider baseUrl="http://localhost:8000/api/auth">{children}</AuthProvider>
}
```

6. Use `useSession` and `signIn` or `signUp` in your React components.

## Cloudflare Workers (Standalone API)

> **Use this approach for:** Standalone auth API, microservices, API-only backends

1. Install dependencies in your Worker project.

```bash
npm install clearauth better-auth kysely
```

2. Configure secrets using Wrangler:

```bash
wrangler secret put AUTH_SECRET
wrangler secret put MECH_API_KEY
```

3. Add public environment variables to `wrangler.toml`:

```toml
name = "my-auth-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
MECH_APP_ID = "550e8400-e29b-41d4-a716-446655440000"
```

4. Create `src/auth.ts`:

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
    emailAndPassword: {
      enabled: true,
    },
  })
}
```

5. Create `src/index.ts`:

```ts
import { createAuth, type Env } from "./auth"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Handle auth routes
    if (url.pathname.startsWith("/api/auth")) {
      const auth = createAuth(env)
      return auth.handler(request)
    }

    // Protected route example
    if (url.pathname === "/api/me") {
      const auth = createAuth(env)
      const session = await auth.api.getSession({ headers: request.headers })

      if (!session) {
        return new Response("Unauthorized", { status: 401 })
      }

      return Response.json({ user: session.user })
    }

    return new Response("Hello from Cloudflare Workers!")
  },
}
```

6. Deploy to Cloudflare:

```bash
wrangler deploy
```

7. For client-side usage, create a React/Vue/etc. app that points to your Worker's URL:

```ts
// In your frontend app
import { AuthProvider, useAuth } from "clearauth/react"

export const authClient = {
  baseUrl: "https://my-auth-worker.YOUR_SUBDOMAIN.workers.dev"
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider baseUrl={authClient.baseUrl}>{children}</AuthProvider>
}

export function UserButton() {
  const { user, loading, signIn, signOut } = useAuth()

  if (loading) return null
  if (!user) return <button onClick={() => signIn("user@example.com", "password")}>Sign In</button>
  return <button onClick={() => signOut()}>Sign Out</button>
}
```

## Cloudflare Pages (Frontend + Functions)

> **Use this approach for:** Frontend apps deployed to Cloudflare Pages that need auth functions

1. Install dependencies:

```bash
npm install clearauth better-auth kysely
```

2. Configure secrets using Wrangler:

```bash
wrangler secret put AUTH_SECRET
wrangler secret put MECH_API_KEY
```

3. Add environment variables to `wrangler.toml`:

```toml
name = "my-pages-app"
compatibility_date = "2024-01-01"

[vars]
MECH_APP_ID = "550e8400-e29b-41d4-a716-446655440000"
```

4. Create `functions/api/auth/[[...all]].ts` (catch-all handler):

```ts
import { createClearAuth } from "clearauth"

interface Env {
  AUTH_SECRET: string
  MECH_APP_ID: string
  MECH_API_KEY: string
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context

  // Create auth instance
  const auth = createClearAuth({
    secret: env.AUTH_SECRET,
    database: {
      appId: env.MECH_APP_ID,
      apiKey: env.MECH_API_KEY,
    },
    isProduction: true,
    emailAndPassword: {
      enabled: true,
    },
  })

  // IMPORTANT: Due to Cloudflare Pages routing limitations with catch-all routes,
  // we handle ALL auth routes here instead of separate files.
  // See: https://community.cloudflare.com/t/functions-index-js-not-accessible-when-a-path-js-route-exists/400706

  return auth.handler(request)
}
```

5. Use ClearAuth React hooks in your frontend:

```tsx
import { AuthProvider, useAuth } from "clearauth/react"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider baseUrl="/api/auth">{children}</AuthProvider>
}

export function App() {
  const { user, loading, signIn, signOut } = useAuth()

  if (loading) return null
  if (!user) return <button onClick={() => signIn("user@example.com", "password")}>Sign In</button>

  return (
    <div>
      <p>Welcome, {user.email}!</p>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  )
}
```

6. Deploy to Cloudflare Pages:

```bash
npm run build
wrangler pages deploy dist
```

### Cloudflare Pages: OAuth Provider Setup

If you need OAuth (GitHub, Google, etc.), you must handle all OAuth routes within the catch-all due to routing limitations:

```ts
// functions/api/auth/[[...all]].ts
import { createClearAuth } from "clearauth"

interface Env {
  AUTH_SECRET: string
  MECH_APP_ID: string
  MECH_API_KEY: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context
  const url = new URL(request.url)

  const auth = createClearAuth({
    secret: env.AUTH_SECRET,
    database: {
      appId: env.MECH_APP_ID,
      apiKey: env.MECH_API_KEY,
    },
    isProduction: true,
    oauth: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectUri: `${url.origin}/api/auth/callback/github`,
      },
    },
  })

  // All auth routes handled in one place (workaround for CF Pages routing)
  return auth.handler(request)
}
```

## Required Configuration

**IMPORTANT:** As of version 0.2.0, all configuration must be passed explicitly to `createClearAuth()`. The library does not read environment variables automatically.

### Required Parameters

- `secret`: Your ClearAuth secret key (minimum 32 characters recommended)
- `database.appId`: Your Mech app UUID
- `database.apiKey`: Your Mech API key
- `isProduction`: Set to `true` in production (enables secure cookies)

### Recommended: Store Secrets in Environment Variables

While the library doesn't read env vars automatically, you should still use environment variables to store secrets and pass them explicitly:

 **Node.js / Next.js (.env.local):**
 ```bash
AUTH_SECRET=your-secret-key-at-least-32-chars
MECH_APP_ID=550e8400-e29b-41d4-a716-446655440000
MECH_API_KEY=your-mech-api-key
 ```

**Cloudflare Workers:**
Use `wrangler secret put` for sensitive values and `wrangler.toml` for public values.
