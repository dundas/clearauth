import { describe, it, expect } from "vitest"
import { validateUrl, validateUuid, validateNonEmpty, validatePositive, validateRange } from "../validation.js"
import { ClearAuthConfigError } from "../errors.js"

describe("validation", () => {
  describe("validateUrl", () => {
    it("should accept valid URLs", () => {
      expect(() => validateUrl("https://example.com")).not.toThrow()
      expect(() => validateUrl("http://localhost:3000")).not.toThrow()
      expect(() => validateUrl("https://storage.mechdna.net/api")).not.toThrow()
    })

    it("should reject invalid URLs", () => {
      expect(() => validateUrl("not a url")).toThrow(ClearAuthConfigError)
      expect(() => validateUrl("")).toThrow(ClearAuthConfigError)
    })
  })

  describe("validateUuid", () => {
    it("should accept valid UUIDs", () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000"
      expect(() => validateUuid(validUuid)).not.toThrow()
    })

    it("should reject invalid UUIDs", () => {
      expect(() => validateUuid("not-a-uuid")).toThrow(ClearAuthConfigError)
      expect(() => validateUuid("550e8400-e29b-41d4-a716")).toThrow(ClearAuthConfigError)
      expect(() => validateUuid("")).toThrow(ClearAuthConfigError)
    })
  })

  describe("validateNonEmpty", () => {
    it("should accept non-empty strings", () => {
      expect(validateNonEmpty("hello", "test")).toBe("hello")
    })

    it("should reject empty strings", () => {
      expect(() => validateNonEmpty("", "test")).toThrow(ClearAuthConfigError)
      expect(() => validateNonEmpty("   ", "test")).toThrow(ClearAuthConfigError)
    })

    it("should reject undefined", () => {
      expect(() => validateNonEmpty(undefined, "test")).toThrow(ClearAuthConfigError)
    })
  })

  describe("validatePositive", () => {
    it("should accept positive numbers", () => {
      expect(() => validatePositive(1, "test")).not.toThrow()
      expect(() => validatePositive(100, "test")).not.toThrow()
    })

    it("should reject zero and negative numbers", () => {
      expect(() => validatePositive(0, "test")).toThrow(ClearAuthConfigError)
      expect(() => validatePositive(-1, "test")).toThrow(ClearAuthConfigError)
    })
  })

  describe("validateRange", () => {
    it("should accept values within range", () => {
      expect(() => validateRange(5, 0, 10, "test")).not.toThrow()
      expect(() => validateRange(0, 0, 10, "test")).not.toThrow()
      expect(() => validateRange(10, 0, 10, "test")).not.toThrow()
    })

    it("should reject values outside range", () => {
      expect(() => validateRange(-1, 0, 10, "test")).toThrow(ClearAuthConfigError)
      expect(() => validateRange(11, 0, 10, "test")).toThrow(ClearAuthConfigError)
    })
  })
})
