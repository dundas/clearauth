import { createClearAuthNode, defaultSessionConfig } from 'clearauth/node'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is required`)
  }
  return value
}

export const authConfig = createClearAuthNode({
  secret: requireEnv('AUTH_SECRET'),
  baseUrl: requireEnv('NEXT_PUBLIC_BASE_URL'),
  database: {
    appId: requireEnv('MECH_APP_ID'),
    apiKey: requireEnv('MECH_API_KEY'),
  },
  isProduction: process.env.NODE_ENV === 'production',
  session: defaultSessionConfig,
  oauth: {
    github: {
      clientId: requireEnv('GITHUB_CLIENT_ID'),
      clientSecret: requireEnv('GITHUB_CLIENT_SECRET'),
      redirectUri: `${requireEnv('NEXT_PUBLIC_BASE_URL')}/api/auth/callback/github`,
    },
    google: {
      clientId: requireEnv('GOOGLE_CLIENT_ID'),
      clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
      redirectUri: `${requireEnv('NEXT_PUBLIC_BASE_URL')}/api/auth/callback/google`,
    },
  },
})
