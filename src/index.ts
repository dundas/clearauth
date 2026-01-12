export * from "./errors.js"
export * from "./logger.js"
export * from "./validation.js"
export * from "./mech-sql-client.js"
export * from "./mech-kysely.js"
export * from "./createMechAuth.js"

// Type definitions
export * from "./types.js"
export * from "./database/schema.js"

// Database providers
export * from "./database/providers/index.js"

// OAuth functionality
export * from "./oauth/callbacks.js"
export * from "./oauth/handler.js"
export * from "./oauth/github.js"
export * from "./oauth/google.js"
export * from "./oauth/discord.js"
export * from "./oauth/apple.js"
export * from "./oauth/microsoft.js"
export * from "./oauth/linkedin.js"
export * from "./oauth/meta.js"

// Email/Password authentication
export * from "./auth/utils.js"
export * from "./auth/register.js"
export * from "./auth/verify-email.js"
export * from "./auth/login.js"
export * from "./auth/reset-password.js"
export * from "./auth/handler.js"

// Email helpers and providers
export * from "./email/manager.js"
export * from "./email/templates.js"
export * from "./email/providers/resend.js"
export * from "./email/providers/postmark.js"
export * from "./email/providers/sendgrid.js"

export * from "./password-hasher.js"

// Unified handler (recommended entry point)
export * from "./handler.js"

// Utilities
export * from "./utils/cors.js"
