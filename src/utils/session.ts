/**
 * Session utilities
 *
 * Re-exports session management helpers from their canonical location so that
 * non-OAuth modules (e.g. the main request handler) can import them without
 * creating a direct dependency on the OAuth callbacks module.
 */
export { validateSession, parseCookies } from '../oauth/callbacks.js'
