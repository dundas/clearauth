/**
 * Logger interface and utilities for ClearAuth
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface Logger {
  debug(message: string, data?: Record<string, any>): void
  info(message: string, data?: Record<string, any>): void
  warn(message: string, data?: Record<string, any>): void
  error(message: string, error?: Error | Record<string, any>): void
}

/**
 * No-op logger (default)
 */
export const noOpLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
}

/**
 * Console logger (for development)
 */
export const consoleLogger: Logger = {
  debug: (message, data) => {
    console.debug(`[clearauth:debug] ${message}`, data)
  },
  info: (message, data) => {
    console.info(`[clearauth:info] ${message}`, data)
  },
  warn: (message, data) => {
    console.warn(`[clearauth:warn] ${message}`, data)
  },
  error: (message, error) => {
    console.error(`[clearauth:error] ${message}`, error)
  }
}

/**
 * Get logger based on environment
 */
export function getDefaultLogger(): Logger {
  const env = typeof process !== "undefined" ? process.env : undefined
  if (env?.NODE_ENV === "development" || env?.DEBUG === "clearauth") {
    return consoleLogger
  }
  return noOpLogger
}
