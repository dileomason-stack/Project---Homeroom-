import { GOOGLE_CLIENT_ID } from '../src/lib/googleConfig.js'

// GET  /api/sync  -> { data, updatedAt } (or { data: null })
// PUT  /api/sync  { data, updatedAt }  -> { ok: true }
// Saves your own dashboard to your Google account so it shows up on every
// device where you sign in. Every request carries the Google access token
// from signing in; Google is asked who it belongs to (and that it was issued
// to Homeroom), and the dashboard is stored under that Google account's ID.
// Storage is an Upstash Redis database connected to the Vercel project
// (its REST URL and token come from the project's environment variables).

const MAX_BYTES = 1_000_000

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  })
}

function storage() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

// Which Google account a sign-in token belongs to, or null.
async function accountFor(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) return null
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const info = await response.json()
    const issuedToHomeroom = info.aud === GOOGLE_CLIENT_ID || info.azp === GOOGLE_CLIENT_ID
    return issuedToHomeroom && info.sub && Number(info.exp) * 1000 > Date.now() ? { id: info.sub, email: info.email ?? null } : null
  } catch {
    return null
  }
}

async function redis(store, command, ...args) {
  const response = await fetch(store.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${store.token}`, 'content-type': 'application/json' },
    body: JSON.stringify([command, ...args]),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`storage ${response.status}`)
  return (await response.json()).result
}

const keyFor = (account) => `homeroom:dashboard:${account.id}`

export async function GET(request) {
  const store = storage()
  if (!store) return json(503, { error: 'Sync isn’t set up on this site yet.' })
  const account = await accountFor(request)
  if (!account) return json(401, { error: 'Sign in with Google to sync.' })
  try {
    const saved = await redis(store, 'GET', keyFor(account))
    return json(200, saved ? JSON.parse(saved) : { data: null })
  } catch {
    return json(502, { error: 'Couldn’t reach sync storage. Try again in a minute.' })
  }
}

export async function PUT(request) {
  const store = storage()
  if (!store) return json(503, { error: 'Sync isn’t set up on this site yet.' })
  const account = await accountFor(request)
  if (!account) return json(401, { error: 'Sign in with Google to sync.' })
  const text = await request.text()
  if (text.length > MAX_BYTES) return json(413, { error: 'That dashboard is too big to sync.' })
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return json(400, { error: 'Send { data, updatedAt } as JSON.' })
  }
  if (!body || typeof body.data !== 'object' || typeof body.updatedAt !== 'number') {
    return json(400, { error: 'Send { data, updatedAt } as JSON.' })
  }
  try {
    await redis(store, 'SET', keyFor(account), JSON.stringify({ data: body.data, updatedAt: body.updatedAt }))
    return json(200, { ok: true })
  } catch {
    return json(502, { error: 'Couldn’t reach sync storage. Try again in a minute.' })
  }
}
