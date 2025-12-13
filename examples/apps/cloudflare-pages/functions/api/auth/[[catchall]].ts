import { createClearAuth, defaultSessionConfig, handleClearAuthEdgeRequest } from 'clearauth/edge'

export type Env = {
  AUTH_SECRET: string
  BASE_URL?: string
  MECH_APP_ID: string
  MECH_API_KEY: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

function requireEnv(env: Env, name: keyof Env): string {
  const value = env[name]
  if (!value) {
    throw new Error(`${String(name)} environment variable is required`)
  }
  return value
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context

  try {
    const url = new URL(request.url)
    const requestOrigin = `${url.protocol}//${url.host}`
    const baseUrl = (env.BASE_URL ?? requestOrigin).replace(/\/$/, '')
    const isProduction = url.protocol === 'https:'

    const oauth: {
      github?: { clientId: string; clientSecret: string; redirectUri: string }
      google?: { clientId: string; clientSecret: string; redirectUri: string }
    } = {}

    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
      oauth.github = {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectUri: `${baseUrl}/api/auth/callback/github`,
      }
    }

    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      oauth.google = {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: `${baseUrl}/api/auth/callback/google`,
      }
    }

    const config = createClearAuth({
      secret: requireEnv(env, 'AUTH_SECRET'),
      baseUrl,
      database: {
        appId: requireEnv(env, 'MECH_APP_ID'),
        apiKey: requireEnv(env, 'MECH_API_KEY'),
      },
      isProduction,
      session: defaultSessionConfig,
      oauth: Object.keys(oauth).length > 0 ? oauth : undefined,
    })

    return await handleClearAuthEdgeRequest(request, config)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid configuration'
    return new Response(
      [
        'Cloudflare Pages example is missing required environment variables.',
        '',
        `Error: ${message}`,
        '',
        'Create a .dev.vars file next to wrangler.toml (do not commit it).',
        'You can copy .dev.vars.example -> .dev.vars and fill in values.',
        '',
        'Required:',
        '- AUTH_SECRET',
        '- MECH_APP_ID',
        '- MECH_API_KEY',
        '',
        'Optional (enables OAuth buttons):',
        '- GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET',
        '- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET',
      ].join('\n'),
      {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
      }
    )
  }
}
