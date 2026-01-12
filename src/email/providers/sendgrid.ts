import type { EmailProvider } from '../../types.js'

export interface SendGridOptions {
  apiKey: string
  from: {
    email: string
    name?: string
  }
}

/**
 * SendGrid Email Provider
 * 
 * Simple adapter for SendGrid v3 API using fetch for edge compatibility.
 */
export class SendGridProvider implements EmailProvider {
  readonly name = 'sendgrid'
  private readonly apiKey: string
  private readonly from: { email: string; name?: string }

  constructor(options: SendGridOptions) {
    this.apiKey = options.apiKey
    this.from = options.from
  }

  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: to }]
          }
        ],
        from: this.from,
        subject,
        content: [
          {
            type: 'text/plain',
            value: text
          },
          {
            type: 'text/html',
            value: html
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`SendGrid error: ${JSON.stringify(error)}`)
    }
  }
}
