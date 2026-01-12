import type { ClearAuthConfig, EmailProvider } from '../types.js'
import { emailTemplates } from './templates.js'

/**
 * Email Manager
 * 
 * Coordinates between email providers, templates, and manual callbacks.
 * This class ensures that emails are sent using the best available method
 * based on the configuration.
 */
export class EmailManager {
  private config: ClearAuthConfig
  private provider?: EmailProvider
  private appName: string

  constructor(config: ClearAuthConfig) {
    this.config = config
    this.provider = config.email?.provider
    this.appName = 'ClearAuth' // Could be made configurable in the future
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(email: string, token: string, linkUrl: string): Promise<void> {
    // 1. Prefer manual callback if provided
    if (this.config.email?.sendVerificationEmail) {
      await this.config.email.sendVerificationEmail(email, token, linkUrl)
      return
    }

    // 2. Fallback to provider + default template
    if (this.provider) {
      const fullLinkUrl = new URL(linkUrl, this.config.baseUrl).toString()
      const template = emailTemplates.verification
      const subject = template.subject(this.appName)
      const html = template.html(fullLinkUrl, this.appName)
      const text = template.text(fullLinkUrl, this.appName)
      await this.provider.send(email, subject, html, text)
      return
    }

    // 3. Log warning if no email sending method is configured
    console.warn(`[ClearAuth] No email sending method configured for verification email to ${email}`)
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, token: string, linkUrl: string): Promise<void> {
    if (this.config.email?.sendPasswordResetEmail) {
      await this.config.email.sendPasswordResetEmail(email, token, linkUrl)
      return
    }

    if (this.provider) {
      const fullLinkUrl = new URL(linkUrl, this.config.baseUrl).toString()
      const template = emailTemplates.passwordReset
      const subject = template.subject(this.appName)
      const html = template.html(fullLinkUrl, this.appName)
      const text = template.text(fullLinkUrl, this.appName)
      await this.provider.send(email, subject, html, text)
      return
    }

    console.warn(`[ClearAuth] No email sending method configured for password reset email to ${email}`)
  }

  /**
   * Send magic link email
   */
  async sendMagicLink(email: string, token: string, linkUrl: string): Promise<void> {
    if (this.config.email?.sendMagicLink) {
      await this.config.email.sendMagicLink(email, token, linkUrl)
      return
    }

    if (this.provider) {
      const fullLinkUrl = new URL(linkUrl, this.config.baseUrl).toString()
      const template = emailTemplates.magicLink
      const subject = template.subject(this.appName)
      const html = template.html(fullLinkUrl, this.appName)
      const text = template.text(fullLinkUrl, this.appName)
      await this.provider.send(email, subject, html, text)
      return
    }

    console.warn(`[ClearAuth] No email sending method configured for magic link email to ${email}`)
  }
}
