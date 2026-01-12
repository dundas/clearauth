import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ResendProvider } from '../providers/resend.js'
import { PostmarkProvider } from '../providers/postmark.js'
import { SendGridProvider } from '../providers/sendgrid.js'

describe('Email Providers', () => {
  let fetchMock: any

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('ResendProvider', () => {
    it('should send email successfully', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200
      })

      const provider = new ResendProvider({
        apiKey: 'test-api-key',
        from: 'sender@example.com'
      })

      await provider.send(
        'recipient@example.com',
        'Test Subject',
        '<p>HTML content</p>',
        'Text content'
      )

      expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'sender@example.com',
          to: 'recipient@example.com',
          subject: 'Test Subject',
          html: '<p>HTML content</p>',
          text: 'Text content'
        })
      })
    })

    it('should handle JSON error responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid API key' })
      })

      const provider = new ResendProvider({
        apiKey: 'invalid-key',
        from: 'sender@example.com'
      })

      await expect(
        provider.send('recipient@example.com', 'Subject', '<p>HTML</p>', 'Text')
      ).rejects.toThrow('Resend error (400): {"error":"Invalid API key"}')
    })

    it('should handle non-JSON error responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error('Not JSON')
        },
        text: async () => 'Service temporarily unavailable'
      })

      const provider = new ResendProvider({
        apiKey: 'test-key',
        from: 'sender@example.com'
      })

      await expect(
        provider.send('recipient@example.com', 'Subject', '<p>HTML</p>', 'Text')
      ).rejects.toThrow('Resend error (503): Service temporarily unavailable')
    })
  })

  describe('PostmarkProvider', () => {
    it('should send email successfully', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200
      })

      const provider = new PostmarkProvider({
        serverToken: 'test-server-token',
        from: 'sender@example.com'
      })

      await provider.send(
        'recipient@example.com',
        'Test Subject',
        '<p>HTML content</p>',
        'Text content'
      )

      expect(fetchMock).toHaveBeenCalledWith('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': 'test-server-token',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          From: 'sender@example.com',
          To: 'recipient@example.com',
          Subject: 'Test Subject',
          HtmlBody: '<p>HTML content</p>',
          TextBody: 'Text content',
          MessageStream: 'outbound'
        })
      })
    })

    it('should handle JSON error responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ ErrorCode: 10, Message: 'Invalid server token' })
      })

      const provider = new PostmarkProvider({
        serverToken: 'invalid-token',
        from: 'sender@example.com'
      })

      await expect(
        provider.send('recipient@example.com', 'Subject', '<p>HTML</p>', 'Text')
      ).rejects.toThrow('Postmark error (401):')
    })

    it('should handle non-JSON error responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Not JSON')
        },
        text: async () => 'Internal server error'
      })

      const provider = new PostmarkProvider({
        serverToken: 'test-token',
        from: 'sender@example.com'
      })

      await expect(
        provider.send('recipient@example.com', 'Subject', '<p>HTML</p>', 'Text')
      ).rejects.toThrow('Postmark error (500): Internal server error')
    })
  })

  describe('SendGridProvider', () => {
    it('should send email successfully', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 202
      })

      const provider = new SendGridProvider({
        apiKey: 'test-api-key',
        from: {
          email: 'sender@example.com',
          name: 'Sender Name'
        }
      })

      await provider.send(
        'recipient@example.com',
        'Test Subject',
        '<p>HTML content</p>',
        'Text content'
      )

      expect(fetchMock).toHaveBeenCalledWith('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: 'recipient@example.com' }]
            }
          ],
          from: {
            email: 'sender@example.com',
            name: 'Sender Name'
          },
          subject: 'Test Subject',
          content: [
            {
              type: 'text/plain',
              value: 'Text content'
            },
            {
              type: 'text/html',
              value: '<p>HTML content</p>'
            }
          ]
        })
      })
    })

    it('should handle JSON error responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ errors: [{ message: 'Forbidden' }] })
      })

      const provider = new SendGridProvider({
        apiKey: 'invalid-key',
        from: { email: 'sender@example.com' }
      })

      await expect(
        provider.send('recipient@example.com', 'Subject', '<p>HTML</p>', 'Text')
      ).rejects.toThrow('SendGrid error (403):')
    })

    it('should handle non-JSON error responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => {
          throw new Error('Not JSON')
        },
        text: async () => 'Rate limit exceeded'
      })

      const provider = new SendGridProvider({
        apiKey: 'test-key',
        from: { email: 'sender@example.com' }
      })

      await expect(
        provider.send('recipient@example.com', 'Subject', '<p>HTML</p>', 'Text')
      ).rejects.toThrow('SendGrid error (429): Rate limit exceeded')
    })

    it('should work without optional from.name', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 202
      })

      const provider = new SendGridProvider({
        apiKey: 'test-api-key',
        from: { email: 'sender@example.com' }
      })

      await provider.send(
        'recipient@example.com',
        'Test Subject',
        '<p>HTML</p>',
        'Text'
      )

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(callBody.from).toEqual({ email: 'sender@example.com' })
    })
  })
})
