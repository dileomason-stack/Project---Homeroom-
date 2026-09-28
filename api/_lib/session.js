import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Small helpers shared by the sign-in server functions: signed cookies (so a
// cookie can't be forged) and encryption for tokens stored in the database.
// `secret` is a server-only value (a client secret) the keys are derived from.

const keyFor = (secret, purpose) => createHash('sha256').update(`${purpose}:${secret}`).digest()

export function sign(secret, value) {
  return `${value}.${createHmac('sha256', keyFor(secret, 'cookie')).update(value).digest('base64url')}`
}

export function verify(secret, signed) {
  const at = signed?.lastIndexOf('.') ?? -1
  if (at < 1) return null
  const value = signed.slice(0, at)
  const expected = Buffer.from(sign(secret, value).slice(at + 1))
  const given = Buffer.from(signed.slice(at + 1))
  return expected.length === given.length && timingSafeEqual(expected, given) ? value : null
}

export function encrypt(secret, text) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret, 'storage'), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.')
}

export function decrypt(secret, text) {
  const [iv, tag, data] = text.split('.').map((part) => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', keyFor(secret, 'storage'), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function readCookie(request, name) {
  const raw = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1]
  return raw ? decodeURIComponent(raw) : null
}

export function cookie(request, name, value, { maxAgeDays = 30, path = '/api' } = {}) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return value
    ? `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${Math.round(maxAgeDays * 86400)}${secure}`
    : `${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
}

export const randomState = () => randomBytes(16).toString('base64url')
