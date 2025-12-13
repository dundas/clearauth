/**
 * Email/Password Authentication Example
 *
 * This example demonstrates how to use the email/password authentication system
 * in a simple web application.
 */

import { Kysely } from 'kysely'
import type { Database } from 'clearauth'
import {
  registerUser,
  loginUser,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  resetPassword,
  validateSession,
  deleteSession,
  handleAuthRequest,
} from 'clearauth'

// Example 1: User Registration
async function exampleRegister(db: Kysely<Database>) {
  try {
    const result = await registerUser(db, 'user@example.com', 'SecurePass123!', {
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0...',
    })

    console.log('User registered:', result.user.id)
    console.log('Session ID:', result.sessionId)
    console.log('Verification token:', result.verificationToken)

    // Send verification email to user
    // sendEmail(result.user.email, `Click here to verify: ${baseUrl}/verify?token=${result.verificationToken}`)

    // Set session cookie
    // setCookie('sessionId', result.sessionId, { httpOnly: true, secure: true })
  } catch (error: any) {
    console.error('Registration failed:', error.message, error.code)
  }
}

// Example 2: Email Verification
async function exampleVerifyEmail(db: Kysely<Database>, token: string) {
  try {
    const result = await verifyEmail(db, token)

    if (result.success) {
      console.log('Email verified for user:', result.userId)
      // Redirect user to success page
    }
  } catch (error: any) {
    console.error('Verification failed:', error.message, error.code)
  }
}

// Example 3: User Login
async function exampleLogin(db: Kysely<Database>) {
  try {
    const result = await loginUser(db, 'user@example.com', 'SecurePass123!', {
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0...',
    })

    console.log('User logged in:', result.user.id)
    console.log('Session ID:', result.sessionId)

    // Set session cookie
    // setCookie('sessionId', result.sessionId, { httpOnly: true, secure: true })
  } catch (error: any) {
    console.error('Login failed:', error.message, error.code)
  }
}

// Example 4: Session Validation (Middleware)
async function exampleAuthMiddleware(db: Kysely<Database>, sessionId: string) {
  const user = await validateSession(db, sessionId)

  if (!user) {
    console.log('Unauthorized - session invalid or expired')
    return null
  }

  console.log('Authenticated user:', user.id, user.email)
  return user
}

// Example 5: Password Reset Request
async function exampleRequestReset(db: Kysely<Database>) {
  try {
    let resetToken: string | undefined

    const result = await requestPasswordReset(db, 'user@example.com', async (_email, token) => {
      resetToken = token
    })

    console.log('Password reset requested for:', result.email)

    if (resetToken) {
      console.log('Reset token:', resetToken)
    }

    // Send password reset email
    // sendEmail(email, `Click here to reset: ${baseUrl}/reset?token=${resetToken}`)
  } catch (error: any) {
    console.error('Password reset request failed:', error.message, error.code)
  }
}

// Example 6: Password Reset
async function exampleResetPassword(db: Kysely<Database>, token: string) {
  try {
    const result = await resetPassword(db, token, 'NewSecurePass123!')

    if (result.success) {
      console.log('Password reset successful')
      // Redirect user to login page
    }
  } catch (error: any) {
    console.error('Password reset failed:', error.message, error.code)
  }
}

// Example 7: Logout
async function exampleLogout(db: Kysely<Database>, sessionId: string) {
  await deleteSession(db, sessionId)
  console.log('User logged out')

  // Clear session cookie
  // clearCookie('sessionId')
}

// Example 8: Using the HTTP Handler
async function exampleHttpHandler(request: Request, db: Kysely<Database>) {
  const config = {
    database: db,
    secret: 'your-secret-key',
    baseUrl: 'https://example.com',
    isProduction: true,
  }

  const response = await handleAuthRequest(request, config)
  return response
}

// Example 9: Complete Registration Flow
async function exampleCompleteRegistrationFlow(db: Kysely<Database>) {
  console.log('\n=== Complete Registration Flow ===\n')

  // Step 1: Register user
  console.log('Step 1: Register user')
  const registration = await registerUser(db, 'newuser@example.com', 'Pass123456!', {
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
  })
  console.log('✓ User registered:', registration.user.email)
  console.log('✓ Email verified:', registration.user.email_verified) // false
  console.log('✓ Session created:', registration.sessionId)

  // Step 2: User receives verification email with token
  console.log('\nStep 2: User clicks verification link')
  const verification = await verifyEmail(db, registration.verificationToken)
  console.log('✓ Email verified for user:', verification.userId)

  // Step 3: User can now login (optional - they already have session)
  console.log('\nStep 3: User logs in')
  const login = await loginUser(db, 'newuser@example.com', 'Pass123456!', {
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
  })
  console.log('✓ User logged in:', login.user.email)
  console.log('✓ Email verified:', login.user.email_verified) // true
  console.log('✓ New session created:', login.sessionId)

  // Cleanup
  await deleteSession(db, registration.sessionId)
  await deleteSession(db, login.sessionId)
}

// Example 10: Complete Password Reset Flow
async function exampleCompletePasswordResetFlow(db: Kysely<Database>) {
  console.log('\n=== Complete Password Reset Flow ===\n')

  // Setup: Create a user first
  console.log('Setup: Register user')
  const registration = await registerUser(db, 'resetuser@example.com', 'OldPass123!', {
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
  })
  console.log('✓ User registered:', registration.user.email)

  // Step 1: User requests password reset
  console.log('\nStep 1: User requests password reset')
  let resetToken: string | undefined
  const resetRequest = await requestPasswordReset(db, 'resetuser@example.com', async (_email, token) => {
    resetToken = token
  })
  if (!resetToken) {
    throw new Error(`Reset token was not generated for: ${resetRequest.email}`)
  }
  console.log('✓ Reset token generated:', resetToken.substring(0, 10) + '...')

  // Step 2: User clicks reset link and submits new password
  console.log('\nStep 2: User resets password')
  const reset = await resetPassword(db, resetToken, 'NewPass123!')
  console.log('✓ Password reset successful:', reset.success)
  console.log('✓ All sessions invalidated')

  // Step 3: Old session is invalid
  console.log('\nStep 3: Old session is invalid')
  const oldSessionValid = await validateSession(db, registration.sessionId)
  console.log('✓ Old session valid:', oldSessionValid !== null) // false

  // Step 4: User logs in with new password
  console.log('\nStep 4: User logs in with new password')
  const newLogin = await loginUser(db, 'resetuser@example.com', 'NewPass123!', {
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
  })
  console.log('✓ User logged in with new password:', newLogin.user.email)
  console.log('✓ New session created:', newLogin.sessionId)

  // Cleanup
  await deleteSession(db, newLogin.sessionId)
}

// Example 11: Error Handling
async function exampleErrorHandling(db: Kysely<Database>) {
  console.log('\n=== Error Handling Examples ===\n')

  // Invalid email
  try {
    await registerUser(db, 'invalid-email', 'Pass123!')
  } catch (error: any) {
    console.log('✓ Caught invalid email error:', error.code) // INVALID_EMAIL
  }

  // Weak password
  try {
    await registerUser(db, 'user@example.com', '123')
  } catch (error: any) {
    console.log('✓ Caught weak password error:', error.code) // INVALID_PASSWORD
  }

  // Invalid credentials
  try {
    await loginUser(db, 'user@example.com', 'WrongPassword')
  } catch (error: any) {
    console.log('✓ Caught invalid credentials error:', error.code) // INVALID_CREDENTIALS
  }

  // Expired token
  try {
    await verifyEmail(db, 'expired-token')
  } catch (error: any) {
    console.log('✓ Caught invalid token error:', error.code) // INVALID_TOKEN
  }
}

// Export all examples
export {
  exampleRegister,
  exampleVerifyEmail,
  exampleLogin,
  exampleAuthMiddleware,
  exampleRequestReset,
  exampleResetPassword,
  exampleLogout,
  exampleHttpHandler,
  exampleCompleteRegistrationFlow,
  exampleCompletePasswordResetFlow,
  exampleErrorHandling,
}
