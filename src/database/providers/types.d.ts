/**
 * Type declarations for optional database provider packages
 * These are peer dependencies and may not be installed
 */

declare module '@neondatabase/serverless' {
  export function neon(connectionString: string): {
    query: (sql: string, params: any[]) => Promise<{ rows: any[] }>
  }
}

declare module '@libsql/client' {
  export function createClient(config: {
    url: string
    authToken: string
  }): {
    execute: (query: { sql: string; args: any[] }) => Promise<{ rows: any[] }>
  }
}

declare module '@planetscale/database' {
  export function connect(config: {
    host: string
    username: string
    password: string
    fetch?: typeof fetch
  }): {
    execute: (sql: string, params: any[]) => Promise<{ rows: any[] }>
  }
}

declare module 'postgres' {
  function postgres(connectionString: string, options?: {
    prepare?: boolean
    max?: number
  }): {
    unsafe: (sql: string, params: any[]) => Promise<any[]>
  }
  export default postgres
}
