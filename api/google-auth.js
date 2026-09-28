import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { GOOGLE_CLIENT_ID } from '../src/lib/googleConfig.js'
import { redis, storage } from './_lib/redis.js'

// Keeps you signed in to Google for about a week instead of an hour.
//
// POST   /api/google-auth  { code }  finishes "Sign in with Google": trades the
//        one-time code for tokens, stores the long-lasting refresh token
//        (encrypted) under your Google account, sets a session cookie, and
//        returns a one-hour access token.
// GET    /api/google-auth  returns a fresh one-hour access token for the
//        signed-in session (no pop-up), or 401 if there isn't one.
// DELETE /api/google-auth  signs out: revokes Homeroom's access at Google,
//        deletes the stored token and clears the cookie.
//
// The refresh token never reaches the browser; the cookie only says which
// Google account this is, signed so it can't be forged, and page scripts
// can't read it (HttpOnly). Needs GOOGLE_CLIENT_SECRET (from the Google Cloud
// client) in the project's environment variables; without it, the site falls
// back to hour-long sign-ins.
//
// While Homeroom's Google project is in Testing mode, Google makes refresh
// tokens expire after 7 days, so you sign in again about once a week.

const COOKIE = 'hr_google'
const COOKIE_DAYS = 30

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', ...headers },
  })
}

const secret = () => process.env.GOOGLE_CLIENT_SECRET
// Separate keys for signing cookies and encrypting stored tokens, derived
// from the client secret (which only the server has).
const keyFor = (purpose) => createHash('sha256').update(`${purpose}:${secret()}`).digest()

function sign(value) {
  return `${value}.${createHmac('sha256', keyFor('cookie')).update(value).digest('base64url')}`
}

function verify(cookieValue) {
  const at = cookieValue?.lastIndexOf('.') ?? -1
  if (at < 1) return null
  const value = cookieValue.slice(0, at)
  const expected = Buffer.from(sign(value).slice(at + 1))
  const given = Buffer.from(cookieValue.slice(at + 1))
  return expected.length === given.length && timingSafeEqual(expected, given) ? value : null
}

function encrypt(text) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor('storage'), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.')
}

function decrypt(text) {
  const [iv, tag, data] = text.split('.').map((part) => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', keyFor('storage'), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

function cookieHeader(value, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return value
    ? `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_DAYS * 86400}${secure}`
    : `${COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
}

function sessionAccount(request) {
  const raw = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1]
  return raw ? verify(decodeURIComponent(raw)) : null
}

const recordKey = (account) => `homeroom:google:${account}`

async function googleToken(params) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: secret(), ...params }),
    signal: AbortSignal.timeout(8000),
  })
  const result = await response.json().catch(() => ({}))
  return { ok: response.ok, result }
}

async function whoIs(accessToken) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
    signal: AbortSignal.timeout(5000),
  })
  return response.ok ? response.json() : null
}

const forBrowser = (result, email) => ({
  accessToken: result.access_token,
  expiresAt: Date.now() + (Number(result.expires_in) || 3600) * 1000,
  scopes: String(result.scope ?? '').split(' ').filter(Boolean),
  email,
})

function setUp() {
  const store = storage()
  return secret() && store ? store : null
}

export async function POST(request) {
  const store = setUp()
  if (!store) return json(503, { error: 'Staying signed in isn’t set up on this site yet.' })
  const body = await request.json().catch(() => null)
  if (typeof body?.code !== 'string') return json(400, { error: 'Send { code } from Google sign-in.' })

  const { ok, result } = await googleToken({ code: body.code, grant_type: 'authorization_code', redirect_uri: 'postmessage' })
  if (!ok || !result.access_token) return json(401, { error: 'Google sign-in didn’t finish. Try again.' })
  const info = await whoIs(result.access_token)
  if (!info?.sub || (info.aud !== GOOGLE_CLIENT_ID && info.azp !== GOOGLE_CLIENT_ID)) {
    return json(401, { error: 'Google sign-in didn’t finish. Try again.' })
  }

  // Google only sends a refresh token the first time you agree; keep the
  // stored one otherwise.
  const saved = await redis(store, 'GET', recordKey(info.sub)).catch(() => null)
  const previous = saved ? JSON.parse(saved) : null
  const refreshToken = result.refresh_token ? encrypt(result.refresh_token) : previous?.refreshToken
  if (refreshToken) {
    await redis(store, 'SET', recordKey(info.sub), JSON.stringify({ refreshToken, email: info.email ?? previous?.email ?? null }))
  }
  return json(200, forBrowser(result, info.email ?? null), refreshToken ? { 'set-cookie': cookieHeader(sign(info.sub), request) } : {})
}

export async function GET(request) {
  const store = setUp()
  if (!store) return json(503, { error: 'Staying signed in isn’t set up on this site yet.' })
  const account = sessionAccount(request)
  if (!account) return json(401, { error: 'Not signed in.' })
  const saved = await redis(store, 'GET', recordKey(account)).catch(() => null)
  const record = saved ? JSON.parse(saved) : null
  if (!record?.refreshToken) return json(401, { error: 'Not signed in.' }, { 'set-cookie': cookieHeader(null, request) })

  let refreshToken
  try {
    refreshToken = decrypt(record.refreshToken)
  } catch {
    return json(401, { error: 'Not signed in.' }, { 'set-cookie': cookieHeader(null, request) })
  }
  const { ok, result } = await googleToken({ refresh_token: refreshToken, grant_type: 'refresh_token' })
  if (!ok || !result.access_token) {
    // Expired (7 days in Testing mode) or access removed: sign in again.
    if (result.error === 'invalid_grant') await redis(store, 'DEL', recordKey(account)).catch(() => {})
    return json(401, { error: 'Your Google sign-in expired. Sign in again.' }, { 'set-cookie': cookieHeader(null, request) })
  }
  return json(200, forBrowser(result, record.email ?? null))
}

export async function DELETE(request) {
  const store = setUp()
  const account = sessionAccount(request)
  if (store && account) {
    const saved = await redis(store, 'GET', recordKey(account)).catch(() => null)
    if (saved) {
      try {
        const token = decrypt(JSON.parse(saved).refreshToken)
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
          signal: AbortSignal.timeout(5000),
        })
      } catch {
        // Already gone at Google; delete our copy anyway.
      }
      await redis(store, 'DEL', recordKey(account)).catch(() => {})
    }
  }
  return json(200, { ok: true }, { 'set-cookie': cookieHeader(null, request) })
}
