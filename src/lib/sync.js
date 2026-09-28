import { useSyncExternalStore } from 'react'
import { OWN_PREFIX } from './copyDashboard.js'
import { readJSON, removeKey, writeJSON } from '../storage.js'

// Saves your own dashboard to your Google account whenever you're signed in
// with Google, and loads it on any device where you sign in. Nothing to turn
// on: signing in (from the ⋯ menu, or the Calendar or Mail card) is enough.
//
// Everything saved under OWN_PREFIX in this browser is synced as one bundle.
// When a device signs in, whichever copy was changed most recently wins: a
// blank dashboard always takes the saved one.

const LOCAL_CHANGED_KEY = 'dashboard:syncChangedAt'
const PUSH_DELAY_MS = 2500

let status = { state: 'off', email: null, at: null }
const listeners = new Set()
function setStatus(next) {
  status = { ...status, ...next }
  listeners.forEach((listener) => listener())
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => status,
  )
}

function localBundle() {
  const data = {}
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith(OWN_PREFIX)) data[key.slice(OWN_PREFIX.length)] = JSON.parse(localStorage.getItem(key))
    }
  } catch {
    // Storage blocked: nothing to sync.
  }
  return data
}

function replaceLocal(data) {
  const existing = []
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith(OWN_PREFIX)) existing.push(key)
    }
  } catch {
    return
  }
  existing.forEach(removeKey)
  for (const [key, value] of Object.entries(data)) writeJSON(OWN_PREFIX + key, value)
}

// A dashboard with no cards anywhere counts as blank.
function isBlank(data) {
  return !Object.entries(data).some(
    ([key, value]) => (key === 'layout' || key.startsWith('layout:')) && (value?.sidebar?.length || value?.workspace?.length),
  )
}

async function call(method, google, body) {
  const response = await fetch('/api/sync', {
    method,
    headers: { authorization: `Bearer ${google.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(result?.error ?? 'Sync didn’t work.'), { status: response.status })
  return result
}

// Starts syncing `store` (your own dashboard) for this Google sign-in.
// onReplaced() is called when the saved copy replaced this browser's, so the
// page can load it. Returns a function that stops syncing.
export function startSync({ store, google, onReplaced }) {
  let stopped = false
  let timer = null
  let ready = false

  async function push() {
    if (stopped) return
    setStatus({ state: 'syncing', email: google.email })
    try {
      await call('PUT', google, { data: localBundle(), updatedAt: readJSON(LOCAL_CHANGED_KEY, Date.now()) })
      if (!stopped) setStatus({ state: 'synced', at: Date.now() })
    } catch (error) {
      if (!stopped) setStatus({ state: error.status === 503 ? 'unavailable' : 'error' })
    }
  }

  // Every change to your dashboard is saved a moment later.
  const unsubscribe = store.subscribe(() => {
    if (!ready) return
    writeJSON(LOCAL_CHANGED_KEY, Date.now())
    clearTimeout(timer)
    timer = setTimeout(push, PUSH_DELAY_MS)
  })

  ;(async () => {
    setStatus({ state: 'syncing', email: google.email })
    let saved
    try {
      saved = await call('GET', google)
    } catch (error) {
      if (!stopped) setStatus({ state: error.status === 503 ? 'unavailable' : 'error' })
      return
    }
    if (stopped) return
    const local = localBundle()
    const localChanged = readJSON(LOCAL_CHANGED_KEY, 0)
    if (saved?.data && JSON.stringify(saved.data) !== JSON.stringify(local) && (isBlank(local) || saved.updatedAt > localChanged)) {
      replaceLocal(saved.data)
      writeJSON(LOCAL_CHANGED_KEY, saved.updatedAt)
      setStatus({ state: 'synced', at: Date.now() })
      onReplaced()
      return
    }
    ready = true
    if (!saved?.data || JSON.stringify(saved.data) !== JSON.stringify(local)) {
      if (!readJSON(LOCAL_CHANGED_KEY, 0)) writeJSON(LOCAL_CHANGED_KEY, Date.now())
      await push()
    } else {
      setStatus({ state: 'synced', at: Date.now() })
    }
  })()

  return () => {
    stopped = true
    clearTimeout(timer)
    unsubscribe()
    setStatus({ state: 'off' })
  }
}
