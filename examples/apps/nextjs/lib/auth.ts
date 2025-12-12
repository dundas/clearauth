import { createMechAuthNode, defaultSessionConfig } from 'lightauth/node'

export const authConfig = createMechAuthNode({
  secret: process.env.AUTH_SECRET!,
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  isProduction: process.env.NODE_ENV === 'production',
  session: defaultSessionConfig,
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/github`,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback/google`,
    },
  },
})
