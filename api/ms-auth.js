import { cookie, decrypt, encrypt, randomState, readCookie, sign, verify } from './_lib/session.js'
import { redis, storage } from './_lib/redis.js'

// "Sign in with Microsoft" for Outlook, kept signed in by the server.
//
// GET  /api/ms-auth?action=start  (opened in a pop-up) sends you to
//      Microsoft's sign-in page.
// GET  /api/ms-auth?code=…        Microsoft sends you back here: the code is
//      traded for tokens, the long-lasting refresh token is stored encrypted
//      under your Microsoft account, a signed session cookie is set, and the
//      pop-up tells the page and closes.
// GET  /api/ms-auth?action=token  a fresh one-hour access token for the
//      signed-in session (no pop-up), or 401.
// DELETE /api/ms-auth             signs out (deletes the stored token).
//
// The refresh token never reaches the browser. Needs MS_CLIENT_ID and
// MS_CLIENT_SECRET (from the Microsoft Entra app registration) in the
// project's environment variables, plus the sync database.

const SCOPES = 'offline_access openid email User.Read Mail.Read Calendars.ReadWrite'
const SESSION = 'hr_ms'
const STATE = 'hr_ms_state'
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'

const clientId = () => process.env.MS_CLIENT_ID
const secret = () => process.env.MS_CLIENT_SECRET
const redirectUri = (request) => `${new URL(request.url).origin}/api/ms-auth`
const recordKey = (account) => `homeroom:ms:${account}`

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', ...headers },
  })
}

// The page shown in the pop-up when sign-in finishes: tells Homeroom how it
// went, then closes.
function popupDone(request, result, headers = {}) {
  const origin = JSON.stringify(new URL(request.url).origin)
  const message = JSON.stringify({ type: 'homeroom-microsoft', ...result })
  const text = result.ok ? 'Signed in. You can close this window.' : result.error
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Homeroom</title><body style="font:15px system-ui;padding:24px">` +
      `<p>${text.replace(/[<>&]/g, '')}</p><script>try{window.opener&&window.opener.postMessage(${message},${origin})}catch(e){}` +
      `${result.ok ? 'window.close()' : ''}</script>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } },
  )
}

async function tokenRequest(request, params) {
  const response = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: secret(), scope: SCOPES, redirect_uri: redirectUri(request), ...params }),
    signal: AbortSignal.timeout(8000),
  })
  return { ok: response.ok, result: await response.json().catch(() => ({})) }
}

const forBrowser = (result, email) => ({
  accessToken: result.access_token,
  expiresAt: Date.now() + (Number(result.expires_in) || 3600) * 1000,
  email,
})

function explain(error, description = '') {
  if (/AADSTS65001|consent/i.test(description) && /admin/i.test(description)) {
    return 'Your school or work account needs an administrator to approve Homeroom. A personal Outlook account will work.'
  }
  if (error === 'access_denied') return 'Sign-in was cancelled, or Microsoft didn’t allow access.'
  if (/admin/i.test(description)) return 'Your school or work account needs an administrator to approve Homeroom. A personal Outlook account will work.'
  return 'Microsoft sign-in didn’t finish. Try again.'
}

export async function GET(request) {
  const store = storage()
  if (!clientId() || !secret() || !store) return json(503, { error: 'Outlook sign-in isn’t set up on this site yet.' })
  const params = new URL(request.url).searchParams

  if (params.get('action') === 'start') {
    const state = randomState()
    const url = new URL(`${AUTHORITY}/authorize`)
    url.search = new URLSearchParams({
      client_id: clientId(),
      response_type: 'code',
      redirect_uri: redirectUri(request),
      response_mode: 'query',
      scope: SCOPES,
      state,
      prompt: 'select_account',
    })
    return new Response(null, { status: 302, headers: { location: url.toString(), 'set-cookie': cookie(request, STATE, sign(secret(), state), { maxAgeDays: 1 / 96 }) } })
  }

  if (params.has('code') || params.has('error')) {
    const clearState = { 'set-cookie': cookie(request, STATE, null) }
    if (params.has('error')) return popupDone(request, { ok: false, error: explain(params.get('error'), params.get('error_description') ?? '') }, clearState)
    // The state must match the one this browser started with.
    if (verify(secret(), readCookie(request, STATE)) !== params.get('state')) {
      return popupDone(request, { ok: false, error: 'That sign-in didn’t start here. Try again.' }, clearState)
    }
    const { ok, result } = await tokenRequest(request, { code: params.get('code'), grant_type: 'authorization_code' })
    if (!ok || !result.access_token) return popupDone(request, { ok: false, error: explain(result.error, result.error_description) }, clearState)
    const me = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName', {
      headers: { authorization: `Bearer ${result.access_token}` },
      signal: AbortSignal.timeout(6000),
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
    if (!me?.id) return popupDone(request, { ok: false, error: 'Microsoft sign-in didn’t finish. Try again.' }, clearState)
    const email = me.mail ?? me.userPrincipalName ?? null
    if (result.refresh_token) {
      await redis(store, 'SET', recordKey(me.id), JSON.stringify({ refreshToken: encrypt(secret(), result.refresh_token), email }))
    }
    const headers = new Headers({ 'content-type': 'text/html' })
    headers.append('set-cookie', cookie(request, STATE, null))
    headers.append('set-cookie', cookie(request, SESSION, sign(secret(), me.id), { maxAgeDays: 90 }))
    const page = popupDone(request, { ok: true })
    headers.set('content-type', 'text/html; charset=utf-8')
    headers.set('cache-control', 'no-store')
    return new Response(page.body, { status: 200, headers })
  }

  if (params.get('action') === 'token') {
    const account = verify(secret(), readCookie(request, SESSION))
    if (!account) return json(401, { error: 'Not signed in.' })
    const saved = await redis(store, 'GET', recordKey(account)).catch(() => null)
    const record = saved ? JSON.parse(saved) : null
    let refreshToken
    try {
      refreshToken = record ? decrypt(secret(), record.refreshToken) : null
    } catch {
      refreshToken = null
    }
    if (!refreshToken) return json(401, { error: 'Not signed in.' }, { 'set-cookie': cookie(request, SESSION, null) })
    const { ok, result } = await tokenRequest(request, { refresh_token: refreshToken, grant_type: 'refresh_token' })
    if (!ok || !result.access_token) {
      if (result.error === 'invalid_grant') await redis(store, 'DEL', recordKey(account)).catch(() => {})
      return json(401, { error: 'Your Outlook sign-in expired. Sign in again.' }, { 'set-cookie': cookie(request, SESSION, null) })
    }
    // Microsoft hands out a new refresh token each time; keep the newest.
    if (result.refresh_token) {
      await redis(store, 'SET', recordKey(account), JSON.stringify({ ...record, refreshToken: encrypt(secret(), result.refresh_token) })).catch(() => {})
    }
    return json(200, forBrowser(result, record.email ?? null))
  }

  return json(400, { error: 'Unknown request.' })
}

export async function DELETE(request) {
  const store = storage()
  const account = secret() ? verify(secret(), readCookie(request, SESSION)) : null
  if (store && account) await redis(store, 'DEL', recordKey(account)).catch(() => {})
  return json(200, { ok: true }, { 'set-cookie': cookie(request, SESSION, null) })
}
