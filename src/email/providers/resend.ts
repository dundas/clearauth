import type { EmailProvider } from '../../types.js'

export interface ResendOptions {
  apiKey: string
  from: string
}

/**
 * Resend Email Provider
 * 
 * Simple adapter for Resend API using fetch for edge compatibility.
 */
export class ResendProvider implements EmailProvider {
  readonly name = 'resend'
  private readonly apiKey: string
  private readonly from: string

  constructor(options: ResendOptions) {
    this.apiKey = options.apiKey
    this.from = options.from
  }

  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: this.from,
        to,
        subject,
        html,
        text
      })
    })

    if (!response.ok) {
      let errorMessage: string
      try {
        const error = await response.json()
        errorMessage = JSON.stringify(error)
      } catch {
        errorMessage = await response.text()
      }
      throw new Error(`Resend error (${response.status}): ${errorMessage}`)
    }
  }
}
