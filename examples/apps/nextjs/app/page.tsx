'use client'

import { useMemo, useState } from 'react'

import { useAuth } from 'lightauth/react'

export default function HomePage() {
  const { user, loading, error, signIn, signUp, signOut, loginWithGitHub, loginWithGoogle, refresh } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const canSubmit = useMemo(() => email.length > 0 && password.length > 0, [email, password])

  return (
    <main className="container">
      <h1>LightAuth (Next.js)</h1>
      <p>
        This app demonstrates <code>email/password</code> + <code>GitHub</code> + <code>Google</code> auth.
      </p>

      <div className="card">
        <h2>Session</h2>
        <div className="row">
          <button className="secondary" onClick={() => refresh()} disabled={loading}>
            Refresh
          </button>
          <button className="secondary" onClick={() => signOut()} disabled={loading}>
            Sign out
          </button>
        </div>
        <pre>{JSON.stringify({ loading, user, error }, null, 2)}</pre>
      </div>

      <div className="card">
        <h2>Email / Password</h2>
        <div className="row">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            type="password"
          />
        </div>
        <div className="row">
          <button
            onClick={async () => {
              await signUp(email, password)
            }}
            disabled={!canSubmit || loading}
          >
            Sign up
          </button>
          <button
            className="secondary"
            onClick={async () => {
              await signIn(email, password)
            }}
            disabled={!canSubmit || loading}
          >
            Sign in
          </button>
        </div>
      </div>

      <div className="card">
        <h2>OAuth</h2>
        <div className="row">
          <button onClick={() => loginWithGitHub()} disabled={loading}>
            Continue with GitHub
          </button>
          <button className="secondary" onClick={() => loginWithGoogle()} disabled={loading}>
            Continue with Google
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Notes</h2>
        <p>
          The auth handler lives at <code>/api/auth/*</code>. OAuth redirect URIs should point to:
        </p>
        <ul>
          <li>
            <code>/api/auth/callback/github</code>
          </li>
          <li>
            <code>/api/auth/callback/google</code>
          </li>
        </ul>
      </div>
    </main>
  )
}
