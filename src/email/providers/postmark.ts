import type { EmailProvider } from '../../types.js'

export interface PostmarkOptions {
  serverToken: string
  from: string
}

/**
 * Postmark Email Provider
 * 
 * Simple adapter for Postmark API using fetch for edge compatibility.
 */
export class PostmarkProvider implements EmailProvider {
  readonly name = 'postmark'
  private readonly serverToken: string
  private readonly from: string

  constructor(options: PostmarkOptions) {
    this.serverToken = options.serverToken
    this.from = options.from
  }

  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': this.serverToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        From: this.from,
        To: to,
        Subject: subject,
        HtmlBody: html,
        TextBody: text,
        MessageStream: 'outbound'
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
      throw new Error(`Postmark error (${response.status}): ${errorMessage}`)
    }
  }
}
