import { useState } from 'react'
import { connectGoogle } from '../lib/google.js'

// A "Sign in with Google" button in Google's style. It asks for `scopes` and
// calls onConnected once Google grants the `required` ones (all of them
// unless said otherwise; people can untick optional ones on Google's screen).
export default function GoogleSignIn({ scopes, required = scopes, label = 'Sign in with Google', onConnected }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signIn() {
    setBusy(true)
    setError('')
    try {
      const google = await connectGoogle(scopes)
      if (required.every((scope) => google.scopes.includes(scope))) onConnected?.()
      else setError('Homeroom needs the box for this checked on Google’s screen. Try again and leave it checked.')
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="google-signin">
      <button type="button" className="google-signin-button" onClick={signIn} disabled={busy}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"
          />
          <path
            fill="#FBBC05"
            d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
          />
        </svg>
        {busy ? 'Waiting for Google…' : label}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
