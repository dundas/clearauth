/**
 * HTML escape utility to prevent XSS in email templates
 * Note: linkUrl is server-generated and trusted, but appName should be escaped
 * if it ever becomes user-configurable.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Standard Email Templates for ClearAuth
 */
export const emailTemplates = {
  verification: {
    subject: (appName: string) => `Verify your email for ${appName}`,
    html: (linkUrl: string, appName: string) => {
      const safeAppName = escapeHtml(appName)
      return `
      <h1>Verify your email</h1>
      <p>Thanks for signing up for ${safeAppName}! Please click the link below to verify your email address:</p>
      <p><a href="${linkUrl}">Verify Email</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `
    },
    text: (linkUrl: string, appName: string) => `
      Verify your email for ${appName}
      
      Thanks for signing up for ${appName}! Please click the link below to verify your email address:
      
      ${linkUrl}
      
      If you didn't request this, you can safely ignore this email.
    `
  },
  passwordReset: {
    subject: (appName: string) => `Reset your password for ${appName}`,
    html: (linkUrl: string, appName: string) => {
      const safeAppName = escapeHtml(appName)
      return `
      <h1>Reset your password</h1>
      <p>You requested a password reset for your ${safeAppName} account. Please click the link below to set a new password:</p>
      <p><a href="${linkUrl}">Reset Password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `
    },
    text: (linkUrl: string, appName: string) => `
      Reset your password for ${appName}
      
      You requested a password reset for your ${appName} account. Please click the link below to set a new password:
      
      ${linkUrl}
      
      If you didn't request this, you can safely ignore this email.
    `
  },
  magicLink: {
    subject: (appName: string) => `Sign in to ${appName}`,
    html: (linkUrl: string, appName: string) => {
      const safeAppName = escapeHtml(appName)
      return `
      <h1>Sign in to ${safeAppName}</h1>
      <p>Click the link below to sign in to your account. This link will expire in 15 minutes.</p>
      <p><a href="${linkUrl}">Sign In</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `
    },
    text: (linkUrl: string, appName: string) => `
      Sign in to ${appName}
      
      Click the link below to sign in to your account. This link will expire in 15 minutes:
      
      ${linkUrl}
      
      If you didn't request this, you can safely ignore this email.
    `
  }
}
