/**
 * Validation utilities for ClearAuth
 */

import { ClearAuthConfigError } from "./errors.js"

// UUID regex that also accepts common prefixes like "app_", "user_", etc.
// Enforces consistent delimiters (all hyphens or all underscores)
const UUID_REGEX = /^[0-9a-f]{8}([-_])[0-9a-f]{4}\1[0-9a-f]{4}\1[0-9a-f]{4}\1[0-9a-f]{12}$/i
const PREFIXED_UUID_REGEX = /^(?:[a-z]+_)[0-9a-f]{8}([-_])[0-9a-f]{4}\1[0-9a-f]{4}\1[0-9a-f]{4}\1[0-9a-f]{12}$/i

/**
 * Validate that a string is a valid URL
 */
export function validateUrl(url: string, fieldName: string = "URL"): void {
  try {
    new URL(url)
  } catch (err) {
    throw new ClearAuthConfigError(`Invalid ${fieldName}: "${url}" is not a valid URL`, {
      fieldName,
      url,
      error: (err as Error).message
    })
  }
}

/**
 * Validate that a string is a valid UUID (with optional prefix like "app_", "user_")
 */
export function validateUuid(value: string, fieldName: string = "UUID"): void {
  if (!UUID_REGEX.test(value) && !PREFIXED_UUID_REGEX.test(value)) {
    throw new ClearAuthConfigError(`Invalid ${fieldName}: "${value}" is not a valid UUID`, {
      fieldName,
      value
    })
  }
}

/**
 * Validate that a string is not empty
 */
export function validateNonEmpty(value: string | undefined, fieldName: string): string {
  if (!value || value.trim() === "") {
    throw new ClearAuthConfigError(`${fieldName} is required and cannot be empty`, {
      fieldName,
      value
    })
  }
  return value
}

/**
 * Validate that a number is positive
 */
export function validatePositive(value: number, fieldName: string = "value"): void {
  if (value <= 0) {
    throw new ClearAuthConfigError(`${fieldName} must be positive, got ${value}`, {
      fieldName,
      value
    })
  }
}

/**
 * Validate that a number is within a range
 */
export function validateRange(value: number, min: number, max: number, fieldName: string = "value"): void {
  if (value < min || value > max) {
    throw new ClearAuthConfigError(`${fieldName} must be between ${min} and ${max}, got ${value}`, {
      fieldName,
      value,
      min,
      max
    })
  }
}
