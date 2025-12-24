import { describe, it, expect } from 'vitest'
import { parseCookies, createSessionCookie } from '../cookies.js'

describe('parseCookies', () => {
  it('returns empty Map for null header', () => {
    const cookies = parseCookies(null)
    expect(cookies.size).toBe(0)
  })

  it('returns empty Map for empty string', () => {
    const cookies = parseCookies('')
    expect(cookies.size).toBe(0)
  })

  it('parses single cookie', () => {
    const cookies = parseCookies('session=abc123')
    expect(cookies.get('session')).toBe('abc123')
    expect(cookies.size).toBe(1)
  })

  it('parses multiple cookies', () => {
    const cookies = parseCookies('session=abc123; user=john; theme=dark')
    expect(cookies.get('session')).toBe('abc123')
    expect(cookies.get('user')).toBe('john')
    expect(cookies.get('theme')).toBe('dark')
    expect(cookies.size).toBe(3)
  })

  it('handles cookies with = in value', () => {
    const cookies = parseCookies('data=key=value=extra')
    expect(cookies.get('data')).toBe('key=value=extra')
  })

  it('trims whitespace around names and values', () => {
    const cookies = parseCookies('  session  =  abc123  ;  user  =  john  ')
    expect(cookies.get('session')).toBe('abc123')
    expect(cookies.get('user')).toBe('john')
  })

  it('handles URL-encoded values', () => {
    const cookies = parseCookies('redirect=https%3A%2F%2Fexample.com')
    expect(cookies.get('redirect')).toBe('https%3A%2F%2Fexample.com')
  })

  it('ignores cookies without values', () => {
    const cookies = parseCookies('valid=value; invalid; another=test')
    expect(cookies.get('valid')).toBe('value')
    expect(cookies.get('another')).toBe('test')
    expect(cookies.has('invalid')).toBe(false)
    expect(cookies.size).toBe(2)
  })

  it('handles empty cookie values', () => {
    const cookies = parseCookies('empty=; hasvalue=test')
    expect(cookies.get('empty')).toBe('')
    expect(cookies.get('hasvalue')).toBe('test')
  })
})

describe('createSessionCookie', () => {
  it('creates cookie with default settings', () => {
    const cookie = createSessionCookie('session-123', {})
    expect(cookie).toContain('session=session-123')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Max-Age=')
  })

  it('adds Secure flag in production', () => {
    const cookie = createSessionCookie('session-123', { isProduction: true })
    expect(cookie).toContain('Secure')
  })

  it('omits Secure flag in development', () => {
    const cookie = createSessionCookie('session-123', { isProduction: false })
    expect(cookie).not.toContain('Secure')
  })

  it('uses custom cookie name', () => {
    const cookie = createSessionCookie('session-123', {
      session: { cookie: { name: 'auth_token' } }
    })
    expect(cookie).toContain('auth_token=session-123')
    expect(cookie).not.toContain('session=')
  })

  it('uses custom path', () => {
    const cookie = createSessionCookie('session-123', {
      session: { cookie: { path: '/api' } }
    })
    expect(cookie).toContain('Path=/api')
  })

  it('uses custom sameSite', () => {
    const cookie = createSessionCookie('session-123', {
      session: { cookie: { sameSite: 'strict' } }
    })
    expect(cookie).toContain('SameSite=Strict')
  })

  it('includes domain when specified', () => {
    const cookie = createSessionCookie('session-123', {
      session: { cookie: { domain: '.example.com' } }
    })
    expect(cookie).toContain('Domain=.example.com')
  })

  it('uses custom expiration', () => {
    const cookie = createSessionCookie('session-123', {
      session: { expiresIn: 3600 } // 1 hour
    })
    expect(cookie).toContain('Max-Age=3600')
  })

  it('uses default 7 day expiration', () => {
    const cookie = createSessionCookie('session-123', {})
    expect(cookie).toContain('Max-Age=604800') // 7 * 24 * 60 * 60
  })
})
