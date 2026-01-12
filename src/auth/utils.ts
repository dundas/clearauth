/**
 * Authentication Utilities
 *
 * Shared utilities for email/password authentication including:
 * - Email validation
 * - Password validation
 * - Secure token generation
 */

import { base64url } from 'oslo/encoding'

/**
 * Email validation regex (RFC 5322 simplified)
 *
 * Must have:
 * - Local part before @
 * - @ symbol
 * - Domain name
 * - At least one dot (.)
 * - TLD with at least 1 character after the dot
 *
 * Does NOT allow:
 * - Consecutive dots (..)
 * - Leading/trailing dots
 * - @ at start
 * - Spaces
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

/**
 * Validate email format
 *
 * @param email - Email address to validate
 * @returns True if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) {
    return false
  }

  // Check for spaces (not allowed in email addresses)
  if (email.includes(' ')) {
    return false
  }

  const trimmedEmail = email.toLowerCase().trim()

  // Check for consecutive dots
  if (trimmedEmail.includes('..')) {
    return false
  }

  // Check for leading/trailing dots
  const localPart = trimmedEmail.split('@')[0]
  if (localPart?.startsWith('.') || localPart?.endsWith('.')) {
    return false
  }

  return EMAIL_REGEX.test(trimmedEmail)
}

/**
 * Validate password strength
 *
 * @param password - Password to validate
 * @param minLength - Minimum password length (default: 8)
 * @returns Error message if invalid, null if valid
 */
export function validatePassword(password: string, minLength: number = 8): string | null {
  if (!password || password.length === 0) {
    return `Password must be at least ${minLength} characters long`
  }

  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters long`
  }

  // Optional: Add more password strength requirements
  // - At least one uppercase letter
  // - At least one lowercase letter
  // - At least one number
  // - At least one special character

  return null
}

/**
 * Generate a secure random token
 *
 * Uses cryptographically secure random values from Web Crypto API.
 *
 * @param entropySize - Number of bytes of entropy (default: 32)
 * @returns Base64url-encoded token
 *
 * @example
 * ```ts
 * const token = generateSecureToken(32) // 256 bits of entropy
 * ```
 */
export function generateSecureToken(entropySize: number = 32): string {
  const bytes = new Uint8Array(entropySize)
  crypto.getRandomValues(bytes)
  // Use base64url encoder without padding
  return base64url.encode(bytes).replace(/=/g, '')
}

/**
 * Normalize email address
 *
 * Converts email to lowercase for consistent storage and comparison.
 *
 * @param email - Email address to normalize
 * @returns Normalized email address
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

/**
 * Authentication error types
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Create a standardized auth error
 */
export function createAuthError(
  message: string,
  code: string,
  statusCode: number = 400
): AuthError {
  return new AuthError(message, code, statusCode)
}

/**
 * Validate returnTo URL for magic links and redirects
 *
 * Ensures the returnTo URL is safe to redirect to (same-origin only).
 * Prevents open redirect vulnerabilities.
 *
 * @param returnTo - URL to validate
 * @param baseUrl - Base URL of the application
 * @returns True if valid and safe, false otherwise
 *
 * @example
 * ```ts
 * isValidReturnTo('/dashboard', 'https://example.com') // true
 * isValidReturnTo('https://example.com/profile', 'https://example.com') // true
 * isValidReturnTo('https://evil.com', 'https://example.com') // false
 * ```
 */
export function isValidReturnTo(returnTo: string | null | undefined, baseUrl: string): boolean {
  if (!returnTo) {
    return false
  }

  try {
    // Handle relative URLs
    if (returnTo.startsWith('/')) {
      // Relative URLs are safe (same-origin by definition)
      return true
    }

    // Parse absolute URLs
    const returnToUrl = new URL(returnTo)
    const base = new URL(baseUrl)

    // Only allow same-origin redirects
    return returnToUrl.origin === base.origin
  } catch {
    // Invalid URL
    return false
  }
}
