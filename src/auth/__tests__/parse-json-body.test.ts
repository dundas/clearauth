/**
 * Tests for parseJsonBody function
 * 
 * These tests verify that the body parsing works correctly across different
 * runtime environments, including Cloudflare Pages Functions where request.json()
 * may fail due to consumed or locked body streams.
 */

import { describe, it, expect, vi } from 'vitest'
import { handleAuthRequest } from '../handler.js'
import type { ClearAuthConfig } from '../../types.js'
import type { Kysely } from 'kysely'
import type { Database } from '../../database/schema.js'
import { createPbkdf2PasswordHasher } from '../../password-hasher.js'

// Mock database
const createMockDb = () => {
  const mockExecuteTakeFirst = vi.fn()
  const mockExecute = vi.fn()
  
  const mockWhere = vi.fn(() => ({
    executeTakeFirst: mockExecuteTakeFirst,
    execute: mockExecute,
  }))
  
  const mockSet = vi.fn(() => ({
    where: mockWhere,
    execute: mockExecute,
  }))
  
  const mockValues = vi.fn(() => ({
    execute: mockExecute,
  }))
  
  const mockSelectAll = vi.fn(() => ({
    where: mockWhere,
  }))
  
  const mockSelect = vi.fn(() => ({
    where: mockWhere,
  }))
  
  const mockDb = {
    selectFrom: vi.fn(() => ({
      selectAll: mockSelectAll,
      select: mockSelect,
    })),
    deleteFrom: vi.fn(() => ({
      where: mockWhere,
    })),
    insertInto: vi.fn(() => ({
      values: mockValues,
    })),
    updateTable: vi.fn(() => ({
      set: mockSet,
    })),
    _mockExecuteTakeFirst: mockExecuteTakeFirst,
    _mockExecute: mockExecute,
  } as any

  return mockDb
}

describe('parseJsonBody - Cloudflare Pages Functions Compatibility', () => {
  const config: ClearAuthConfig = {
    database: createMockDb(),
    secret: 'test-secret',
    baseUrl: 'http://localhost:3000',
    passwordHasher: createPbkdf2PasswordHasher(),
  }

  describe('Valid JSON bodies', () => {
    it('should parse valid JSON body successfully', async () => {
      const request = new Request('http://localhost:3000/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      })

      const response = await handleAuthRequest(request, config)
      
      // Should succeed (returns 200 even if user doesn't exist for security)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should parse JSON with special characters', async () => {
      const request = new Request('http://localhost:3000/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: 'test+special@example.com'
        }),
      })

      const response = await handleAuthRequest(request, config)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should parse JSON with unicode characters', async () => {
      const request = new Request('http://localhost:3000/auth/request-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: '测试@example.com'
        }),
      })

      const response = await handleAuthRequest(request, config)
      
      // Should succeed (returns 200 even if user doesn't exist for security)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Empty body handling', () => {
    it('should reject empty body', async () => {
      const request = new Request('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toContain('empty')
      expect(data.code).toBe('EMPTY_BODY')
    })

    it('should reject whitespace-only body', async () => {
      const request = new Request('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '   \n\t  ',
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toContain('empty')
      expect(data.code).toBe('EMPTY_BODY')
    })

    it('should reject null body', async () => {
      const request = new Request('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: null,
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.code).toBe('EMPTY_BODY')
    })
  })

  describe('Invalid JSON handling', () => {
    it('should reject malformed JSON', async () => {
      const request = new Request('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ "email": "test@example.com", invalid }',
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid JSON')
      expect(data.code).toBe('INVALID_JSON')
    })

    it('should reject incomplete JSON', async () => {
      const request = new Request('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ "email": "test@example.com"',
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.code).toBe('INVALID_JSON')
    })

    it('should reject non-JSON text', async () => {
      const request = new Request('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'This is not JSON',
      })

      const response = await handleAuthRequest(request, config)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.code).toBe('INVALID_JSON')
    })
  })

  describe('Body consumption handling', () => {
    it('should handle body that can only be read once', async () => {
      // Simulate Cloudflare Pages Functions behavior
      const bodyText = JSON.stringify({ email: 'test@example.com' })
      
      const request = new Request('http://localhost:3000/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyText,
      })

      // First call should succeed
      const response = await handleAuthRequest(request, config)
      expect(response.status).toBe(200)

      // Body should now be consumed
      expect(request.bodyUsed).toBe(true)
    })

    it('should provide clear error when body already consumed', async () => {
      const request = new Request('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'Password123!' }),
      })

      // Consume the body first
      await request.text()

      // Now try to use it
      const response = await handleAuthRequest(request, config)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toContain('already been consumed')
      expect(data.code).toBe('BODY_CONSUMED')
    })
  })

  describe('Edge runtime compatibility', () => {
    it('should work with ReadableStream body', async () => {
      const bodyText = JSON.stringify({ email: 'test@example.com' })
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(bodyText))
          controller.close()
        }
      })

      const request = new Request('http://localhost:3000/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stream,
        duplex: 'half', // Required for ReadableStream bodies
      } as any)

      const response = await handleAuthRequest(request, config)
      
      expect(response.status).toBe(200)
    })

    it('should work with Uint8Array body', async () => {
      const bodyText = JSON.stringify({ email: 'test@example.com' })
      const encoder = new TextEncoder()
      const bodyArray = encoder.encode(bodyText)

      const request = new Request('http://localhost:3000/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyArray,
      })

      const response = await handleAuthRequest(request, config)
      
      expect(response.status).toBe(200)
    })
  })

  describe('Large body handling', () => {
    it('should handle large JSON bodies', async () => {
      const largeObject = {
        email: 'test@example.com',
        returnTo: '/dashboard?data=' + 'x'.repeat(1000), // Large returnTo parameter
      }

      const request = new Request('http://localhost:3000/auth/request-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(largeObject),
      })

      const response = await handleAuthRequest(request, config)
      
      expect(response.status).toBe(200)
    })
  })
})
