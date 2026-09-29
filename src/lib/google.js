import { useSyncExternalStore } from 'react'

// "Sign in with Google" for the Calendar and Mail cards (and syncing), using
// Google's own sign-in library. Google shows its sign-in and permission
// screens in its own pop-up (Homeroom never sees a password).
//
// Staying signed in: when the site's server is set up for it (see
// api/google-auth.js), signing in hands Google's one-time code to the server,
// which keeps a long-lasting refresh token and gives the page hour-long
// access tokens: on page load, and again shortly before each one runs out,
// with no pop-up. You sign in again only after signing out, or after about a
// week while Homeroom's Google project is in "Testing" mode. Without the
// server, sign-ins last about an hour (in this tab).
//
// While in "Testing" mode, only accounts on its test-user list can sign in.
import { GOOGLE_CLIENT_ID } from './googleConfig.js'

export { GOOGLE_CLIENT_ID }

export const SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
  // Add, edit and delete events (not whole calendars or settings).
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  // Google Tasks (the to-dos that also show in Google Calendar).
  tasks: 'https://www.googleapis.com/auth/tasks',
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
}

const TOKEN_KEY = 'homeroom:google-token'
const IDENTITY = ['openid', 'email']
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
// Load Google's sign-in library ahead of time, so a later click can open its
// pop-up right away (browsers only allow pop-ups straight after a click).
export const preloadGoogle = () => loadScript().catch(() => {})

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

// Whether the server keeps you signed in (null until the page asks it).
let serverKeepsSignIn = null
let renewTimer = null

// Renew a few minutes before the access token runs out.
function scheduleRenew() {
  clearTimeout(renewTimer)
  if (!serverKeepsSignIn || !state) return
  renewTimer = setTimeout(() => renew().catch(() => {}), Math.max(10_000, state.expiresAt - Date.now() - 3 * 60_000))
}

// A fresh access token from the server's stored sign-in (no pop-up).
// Returns the new state, or null. `lastRenewFailure` says why: 'signed-out'
// (the server has no sign-in), or 'offline' (it couldn't be reached, e.g. a
// laptop just waking up; that keeps you signed in and tries again).
let lastRenewFailure = null
async function renew() {
  const response = await fetch('/api/google-auth', { credentials: 'same-origin' }).catch(() => null)
  if (!response || (response.status >= 500 && response.status !== 503)) {
    lastRenewFailure = 'offline'
    clearTimeout(renewTimer)
    renewTimer = setTimeout(() => renew().catch(() => {}), 30_000)
    return null
  }
  lastRenewFailure = 'signed-out'
  if (response.status === 503) {
    serverKeepsSignIn = false
    return null
  }
  serverKeepsSignIn = true
  if (!response.ok) {
    if (response.status === 401) setState(null)
    return null
  }
  setState(await response.json())
  scheduleRenew()
  return state
}

// Called once when the page opens: signs you back in if the server has a
// sign-in for this browser (keeping a still-fresh one from this tab if not).
export async function restoreGoogle() {
  const hadFresh = Boolean(state && state.expiresAt > Date.now() + 60_000)
  const response = await fetch('/api/google-auth', { credentials: 'same-origin' }).catch(() => null)
  if (!response) return
  if (response.status === 503) {
    serverKeepsSignIn = false
    return
  }
  serverKeepsSignIn = true
  if (response.ok) {
    setState(await response.json())
    scheduleRenew()
  } else if (!hadFresh) setState(null)
}

function signInError(error) {
  return new Error(
    error === 'access_denied'
      ? 'Google didn’t allow access. While Homeroom is in testing, only accounts on its test list can sign in.'
      : error === 'popup_closed'
        ? 'Sign-in was closed before it finished.'
        : 'Google sign-in didn’t work. Try again.',
  )
}

// Asks Google for access to `scopes` (keeping any already granted). Must be
// called from a click, so the browser allows Google's pop-up.
export async function connectGoogle(scopes) {
  const google = await loadScript()
  // Ask for everything Homeroom uses every time (plus who you are, for
  // "signed in as" and syncing). With the stay-signed-in server, each sign-in
  // replaces the saved one, so asking for less would quietly drop access
  // granted earlier (e.g. approving Tasks and losing Gmail the next day).
  // People can still untick anything on Google's screen.
  const wanted = [...new Set([...IDENTITY, ...Object.values(SCOPES), ...(state?.scopes ?? []), ...scopes])]
  const common = {
    client_id: GOOGLE_CLIENT_ID,
    scope: wanted.join(' '),
    include_granted_scopes: true,
    ...(state?.email ? { login_hint: state.email } : {}),
  }

  if (serverKeepsSignIn) {
    // Stay signed in: Google gives a one-time code, the server does the rest.
    const response = await new Promise((resolve, reject) => {
      google.accounts.oauth2
        .initCodeClient({
          ...common,
          ux_mode: 'popup',
          callback: resolve,
          error_callback: (error) => reject(signInError(error?.type)),
        })
        .requestCode()
    })
    if (response.error) throw signInError(response.error)
    const finished = await fetch('/api/google-auth', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: response.code }),
    }).catch(() => null)
    const result = await finished?.json().catch(() => null)
    if (!finished?.ok || !result?.accessToken) throw new Error(result?.error ?? 'Google sign-in didn’t finish. Try again.')
    setState(result)
    scheduleRenew()
    if (!result.email) {
      const email = await findEmail(result).catch(() => null)
      if (email && state === result) setState({ ...result, email })
    }
    return state
  }

  const response = await new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      ...common,
      callback: resolve,
      error_callback: (error) => reject(signInError(error?.type)),
    })
    // '' = only ask for permission the first time (or for new scopes).
    client.requestAccessToken({ prompt: '' })
  })
  if (response.error) throw signInError(response.error)
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
  const profile = await googleFetch('https://www.googleapis.com/oauth2/v3/userinfo', token).catch(() => null)
  if (profile?.email) return profile.email
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
  clearTimeout(renewTimer)
  setState(null)
  // Forget the stored sign-in too (the server also revokes it at Google).
  fetch('/api/google-auth', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {})
}

const ranOut = () => Object.assign(new Error('Your Google connection ran out. Reconnect to keep going.'), { expired: true })

// The token to use: the given one if it's still good, else a renewed one.
async function usable(token) {
  if (token && token.expiresAt > Date.now() + 30_000) return token
  if (serverKeepsSignIn && (await renew())) return state
  // Couldn't reach the server (offline for a moment): stay signed in.
  if (serverKeepsSignIn && lastRenewFailure === 'offline') throw new Error('You seem to be offline. Check your connection.')
  setState(null)
  throw ranOut()
}

// Back from sleep or back online: renew right away if the token ran out.
if (typeof window !== 'undefined') {
  const wake = () => {
    if (serverKeepsSignIn && state && state.expiresAt < Date.now() + 5 * 60_000) renew().catch(() => {})
  }
  window.addEventListener('online', wake)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake())
}

// A GET to one of Google's APIs with the current token.
export async function googleFetch(url, token = state) {
  return googleSend(url, 'GET', undefined, token)
}

// A request (GET / POST / PATCH / DELETE) to one of Google's APIs. If Google
// says the token ran out, it's renewed once (when possible) and retried.
export async function googleSend(url, method, body, token = state, retried = false) {
  const current = await usable(token)
  let response
  try {
    response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${current.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('You seem to be offline. Check your connection.')
  }
  if (response.status === 401) {
    if (!retried && serverKeepsSignIn && (await renew())) return googleSend(url, method, body, state, true)
    setState(null)
    throw ranOut()
  }
  if (response.status === 403 && method !== 'GET')
    throw new Error('Google says this calendar can’t be changed from your account.')
  if (!response.ok) throw new Error(`Google had a problem (error ${response.status}). Try again in a minute.`)
  return response.status === 204 ? null : response.json()
}
