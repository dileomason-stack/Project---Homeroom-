// The Upstash Redis database connected to the Vercel project (its REST URL
// and token come from the project's environment variables), or null if it
// isn't set up.
export function storage() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

// One Redis command, e.g. redis(store, 'SET', key, value).
export async function redis(store, command, ...args) {
  const response = await fetch(store.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${store.token}`, 'content-type': 'application/json' },
    body: JSON.stringify([command, ...args]),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`storage ${response.status}`)
  return (await response.json()).result
}
