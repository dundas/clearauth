/**
 * React hooks and utilities for ClearAuth
 *
 * This module provides React hooks for authentication with ClearAuth.
 * Works with any React framework (Next.js, Vite, Create React App, etc.).
 *
 * @module react
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import type { User } from './database/schema.js'

/**
 * Authentication state returned by useAuth hook
 */
export interface AuthState {
  /** Current authenticated user, null if not authenticated */
  user: User | null
  /** True while checking session status */
  loading: boolean
  /** Error message if authentication failed */
  error: string | null
}

/**
 * Authentication actions provided by useAuth hook
 */
export interface AuthActions {
  /** Sign in with email and password */
  signIn: (email: string, password: string) => Promise<void>
  /** Sign up with email and password */
  signUp: (email: string, password: string, name?: string) => Promise<void>
  /** Sign out the current user */
  signOut: () => Promise<void>
  /** Initiate GitHub OAuth flow */
  loginWithGitHub: () => void
  /** Initiate Google OAuth flow */
  loginWithGoogle: () => void
  /** Request password reset for email */
  requestPasswordReset: (email: string) => Promise<void>
  /** Reset password with token */
  resetPassword: (token: string, newPassword: string) => Promise<void>
  /** Verify email with token */
  verifyEmail: (token: string) => Promise<void>
  /** Resend email verification */
  resendVerification: (email: string) => Promise<void>
  /** Refresh session to get latest user data */
  refresh: () => Promise<void>
}

/**
 * Combined auth state and actions
 */
export type AuthContextValue = AuthState & AuthActions

/**
 * Configuration for the auth provider
 */
export interface AuthProviderConfig {
  /** Base URL for auth API (e.g., "https://api.example.com" or "/api/auth") */
  baseUrl?: string
  /** Custom fetch function (useful for testing or adding auth headers) */
  fetchFn?: typeof fetch
}

/**
 * React context for authentication
 */
const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Authentication provider component
 *
 * Wrap your app with this provider to enable authentication hooks.
 *
 * @param props - Provider props
 * @param props.children - Child components
 * @param props.baseUrl - Base URL for auth API (defaults to "/api/auth")
 * @param props.fetchFn - Custom fetch function (defaults to global fetch)
 *
 * @example
 * ```tsx
 * import { AuthProvider } from 'clearauth/react'
 *
 * function App() {
 *   return (
 *     <AuthProvider baseUrl="/api/auth">
 *       <YourApp />
 *     </AuthProvider>
 *   )
 * }
 * ```
 *
 * @example With custom base URL
 * ```tsx
 * <AuthProvider baseUrl="https://api.example.com/auth">
 *   <YourApp />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({
  children,
  baseUrl = '/api/auth',
  fetchFn = fetch,
}: {
  children: React.ReactNode
} & AuthProviderConfig) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Helper to make authenticated requests
  const authFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const url = `${baseUrl}${path}`
      const response = await fetchFn(url, {
        ...options,
        credentials: 'include', // Include cookies
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || errorData.message || 'Request failed')
      }

      return response.json()
    },
    [baseUrl, fetchFn]
  )

  // Check session on mount
  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // Session validation would be done server-side via cookie
      // We'll implement a /session endpoint to check current session
      const data = await authFetch('/session')
      setUser(data.user || null)
    } catch (err) {
      setUser(null)
      // Don't set error for unauthenticated state
      if ((err as Error).message !== 'Unauthorized') {
        setError((err as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Sign in with email and password
  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        setLoading(true)
        setError(null)
        const data = await authFetch('/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
        setUser(data.user)
      } catch (err) {
        setError((err as Error).message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [authFetch]
  )

  // Sign up with email and password
  const signUp = useCallback(
    async (email: string, password: string, name?: string) => {
      try {
        setLoading(true)
        setError(null)
        const data = await authFetch('/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, name }),
        })
        setUser(data.user)
      } catch (err) {
        setError((err as Error).message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [authFetch]
  )

  // Sign out
  const signOut = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      await authFetch('/logout', { method: 'POST' })
      setUser(null)
    } catch (err) {
      setError((err as Error).message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  // OAuth login helpers
  const loginWithGitHub = useCallback(() => {
    window.location.href = `${baseUrl}/github/login`
  }, [baseUrl])

  const loginWithGoogle = useCallback(() => {
    window.location.href = `${baseUrl}/google/login`
  }, [baseUrl])

  // Password reset
  const requestPasswordReset = useCallback(
    async (email: string) => {
      try {
        setError(null)
        await authFetch('/request-reset', {
          method: 'POST',
          body: JSON.stringify({ email }),
        })
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [authFetch]
  )

  const resetPassword = useCallback(
    async (token: string, newPassword: string) => {
      try {
        setError(null)
        await authFetch('/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token, newPassword }),
        })
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [authFetch]
  )

  // Email verification
  const verifyEmail = useCallback(
    async (token: string) => {
      try {
        setError(null)
        await authFetch('/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
        })
        await refresh() // Refresh to get updated email_verified status
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [authFetch, refresh]
  )

  const resendVerification = useCallback(
    async (email: string) => {
      try {
        setError(null)
        await authFetch('/resend-verification', {
          method: 'POST',
          body: JSON.stringify({ email }),
        })
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [authFetch]
  )

  const value: AuthContextValue = {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    loginWithGitHub,
    loginWithGoogle,
    requestPasswordReset,
    resetPassword,
    verifyEmail,
    resendVerification,
    refresh,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to access authentication state and actions
 *
 * Must be used within an AuthProvider.
 *
 * @returns Auth state and actions
 * @throws Error if used outside AuthProvider
 *
 * @example
 * ```tsx
 * function LoginForm() {
 *   const { signIn, loading, error } = useAuth()
 *
 *   const handleSubmit = async (e) => {
 *     e.preventDefault()
 *     await signIn(email, password)
 *   }
 *
 *   return <form onSubmit={handleSubmit}>...</form>
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/**
 * Hook to access current user
 *
 * Convenience hook that only returns the user object.
 *
 * @returns Current user or null
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const user = useUser()
 *
 *   if (!user) return <div>Not logged in</div>
 *
 *   return <div>Welcome, {user.name}!</div>
 * }
 * ```
 */
export function useUser(): User | null {
  const { user } = useAuth()
  return user
}

/**
 * Hook to check if user is authenticated
 *
 * @returns True if user is authenticated
 *
 * @example
 * ```tsx
 * function ProtectedContent() {
 *   const isAuthenticated = useIsAuthenticated()
 *
 *   if (!isAuthenticated) {
 *     return <LoginPrompt />
 *   }
 *
 *   return <SecretContent />
 * }
 * ```
 */
export function useIsAuthenticated(): boolean {
  const { user } = useAuth()
  return user !== null
}
