import { useSyncExternalStore } from 'react'

// "Sign in with Google" for the Calendar and Mail cards, using Google's own
// sign-in library in the browser. Google shows its sign-in and permission
// screens in its own pop-up (Homeroom never sees a password) and hands back
// a read-only access token that lasts about an hour. The token stays in this
// tab only (sessionStorage), so it's gone when the tab closes; after it runs
// out, "Reconnect" gets a fresh one in a click.
//
// While Homeroom's Google project is in "Testing" mode, only accounts on its
// test-user list can sign in.
export const GOOGLE_CLIENT_ID = '21939805646-amhigjvluh702lnn6lk0hfr0urak5gqb.apps.googleusercontent.com'

export const SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
  // Add, edit and delete events (not whole calendars or settings).
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
}

const TOKEN_KEY = 'homeroom:google-token'
const SCRIPT_URL = 'https://accounts.google.com/gsi/client'

function readToken() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null')
    return saved && saved.expiresAt > Date.now() + 60_000 ? saved : null
  } catch {
    return null
  }
}

// { accessToken, expiresAt, scopes: [...], email }
let state = readToken()
const listeners = new Set()

function setState(next) {
  state = next
  try {
    if (next) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(next))
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked: the token just won't survive a reload.
  }
  listeners.forEach((listener) => listener())
}

export function useGoogle() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

export const hasScope = (google, scope) => Boolean(google?.scopes?.includes(scope))

let scriptPromise = null
function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve(window.google)
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Couldn’t load Google sign-in. Check your connection.'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

// Asks Google for access to `scopes` (keeping any already granted). Must be
// called from a click, so the browser allows Google's pop-up.
export async function connectGoogle(scopes) {
  const google = await loadScript()
  const wanted = [...new Set([...(state?.scopes ?? []), ...scopes])]
  const response = await new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: wanted.join(' '),
      include_granted_scopes: true,
      ...(state?.email ? { login_hint: state.email } : {}),
      callback: resolve,
      error_callback: (error) =>
        reject(
          new Error(
            error?.type === 'popup_closed' ? 'Sign-in was closed before it finished.' : 'Google sign-in didn’t work. Try again.',
          ),
        ),
    })
    // '' = only ask for permission the first time (or for new scopes).
    client.requestAccessToken({ prompt: '' })
  })
  if (response.error) {
    throw new Error(
      response.error === 'access_denied'
        ? 'Google didn’t allow access. While Homeroom is in testing, only accounts on its test list can sign in.'
        : 'Google sign-in didn’t work. Try again.',
    )
  }
  const granted = (response.scope ?? '').split(' ').filter(Boolean)
  const next = {
    accessToken: response.access_token,
    expiresAt: Date.now() + (Number(response.expires_in) || 3600) * 1000,
    scopes: granted,
    email: state?.email ?? null,
  }
  setState(next)
  // Which account this is (for "Signed in as" and Gmail links).
  if (!next.email) {
    const email = await findEmail(next).catch(() => null)
    if (email && state === next) setState({ ...next, email })
  }
  return state
}

async function findEmail(token) {
  if (hasScope(token, SCOPES.gmail)) {
    return (await googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', token)).emailAddress
  }
  if (hasScope(token, SCOPES.calendar)) {
    return (await googleFetch('https://www.googleapis.com/calendar/v3/calendars/primary', token)).id
  }
  return null
}

export function disconnectGoogle() {
  const token = state?.accessToken
  setState(null)
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {})
}

// A GET to one of Google's APIs with the current token.
export async function googleFetch(url, token = state) {
  if (!token || token.expiresAt < Date.now()) {
    setState(null)
    throw Object.assign(new Error('Your Google connection ran out. Reconnect to keep going.'), { expired: true })
  }
  let response
  try {
    response = await fetch(url, { headers: { authorization: `Bearer ${token.accessToken}` } })
  } catch {
    throw new Error('You seem to be offline. Check your connection.')
  }
  if (response.status === 401) {
    setState(null)
    throw Object.assign(new Error('Your Google connection ran out. Reconnect to keep going.'), { expired: true })
  }
  if (!response.ok) throw new Error(`Google had a problem (error ${response.status}). Try again in a minute.`)
  return response.json()
}

// A change (POST / PATCH / DELETE) to one of Google's APIs.
export async function googleSend(url, method, body, token = state) {
  if (!token || token.expiresAt < Date.now()) {
    setState(null)
    throw Object.assign(new Error('Your Google connection ran out. Reconnect to keep going.'), { expired: true })
  }
  let response
  try {
    response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('You seem to be offline. Check your connection.')
  }
  if (response.status === 401) {
    setState(null)
    throw Object.assign(new Error('Your Google connection ran out. Reconnect to keep going.'), { expired: true })
  }
  if (response.status === 403) throw new Error('Google says this calendar can’t be changed from your account.')
  if (!response.ok) throw new Error(`Google had a problem (error ${response.status}). Try again.`)
  return response.status === 204 ? null : response.json()
}
