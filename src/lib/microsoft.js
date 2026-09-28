import { useSyncExternalStore } from 'react'

// "Sign in with Microsoft" for Outlook. Signing in happens in a pop-up that
// Homeroom's server runs (api/ms-auth.js); the server keeps you signed in
// and hands the page hour-long access tokens for Microsoft Graph (Outlook's
// official data service), renewed automatically.

let state = null // { accessToken, expiresAt, email }
let available = null // whether the site is set up for Outlook
let renewTimer = null
const listeners = new Set()

function setState(next) {
  state = next
  listeners.forEach((listener) => listener())
}

export function useMicrosoft() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

export const outlookAvailable = () => available !== false

function scheduleRenew() {
  clearTimeout(renewTimer)
  if (!state) return
  renewTimer = setTimeout(() => renew().catch(() => {}), Math.max(10_000, state.expiresAt - Date.now() - 3 * 60_000))
}

async function renew() {
  const response = await fetch('/api/ms-auth?action=token', { credentials: 'same-origin' }).catch(() => null)
  if (!response) return null
  if (response.status === 503) {
    available = false
    setState(null)
    return null
  }
  available = true
  if (!response.ok) {
    setState(null)
    return null
  }
  setState(await response.json())
  scheduleRenew()
  return state
}

// When the page opens: signs you back in if this browser has a session.
export const restoreMicrosoft = () => renew().catch(() => null)

// Opens Microsoft's sign-in in a pop-up (call from a click).
export function connectMicrosoft() {
  const width = 480
  const height = 640
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2)
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2)
  const popup = window.open('/api/ms-auth?action=start', 'homeroom-microsoft', `popup=yes,width=${width},height=${height},left=${left},top=${top}`)
  if (!popup) return Promise.reject(new Error('Your browser blocked the sign-in window. Allow pop-ups for Homeroom and try again.'))
  return new Promise((resolve, reject) => {
    const onMessage = async (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'homeroom-microsoft') return
      finish()
      if (!event.data.ok) return reject(new Error(event.data.error ?? 'Microsoft sign-in didn’t finish. Try again.'))
      const signedIn = await renew()
      if (signedIn) resolve(signedIn)
      else reject(new Error('Microsoft sign-in didn’t finish. Try again.'))
    }
    const closedCheck = setInterval(() => {
      if (popup.closed) {
        finish()
        reject(new Error('Sign-in was closed before it finished.'))
      }
    }, 700)
    function finish() {
      clearInterval(closedCheck)
      window.removeEventListener('message', onMessage)
    }
    window.addEventListener('message', onMessage)
  })
}

export function disconnectMicrosoft() {
  clearTimeout(renewTimer)
  setState(null)
  fetch('/api/ms-auth', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
}

// A GET to Microsoft Graph with the current token (renewed once if needed).
export async function graphFetch(path, retried = false) {
  let token = state
  if (!token || token.expiresAt < Date.now() + 30_000) token = await renew()
  if (!token) throw Object.assign(new Error('Your Outlook sign-in ran out. Sign in again.'), { expired: true })
  let response
  try {
    response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { authorization: `Bearer ${token.accessToken}` } })
  } catch {
    throw new Error('You seem to be offline. Check your connection.')
  }
  if (response.status === 401 && !retried && (await renew())) return graphFetch(path, true)
  if (!response.ok) throw new Error(`Outlook had a problem (error ${response.status}). Try again in a minute.`)
  return response.json()
}
