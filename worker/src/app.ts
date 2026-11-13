// Hide Me API (Cloudflare Worker).
//
// Stores only encrypted blobs. The key to unlock them lives in the link's
// #fragment and never reaches this server. Every item is written to KV with an
// expiry, so Cloudflare deletes it automatically when the time is up; the
// expiry is also checked here on every request using the server's clock.

export interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>
}

/** The subset of the KV API used here (lets tests use an in-memory fake). */
export interface KV {
  get(key: string, type: 'json'): Promise<unknown>
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  put(key: string, value: string | ArrayBuffer, opts?: { expiration?: number; expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface Env {
  SHARES: KV
  /** Comma-separated list of site origins allowed to create links. */
  ALLOWED_ORIGINS: string
  RATE_LIMITER?: RateLimiter
}

interface Meta {
  expiresAt: number
  opens: number
  maxOpens: number | null
  tokenHash: string
}

export const MAX_BYTES = 20 * 1024 * 1024
export const MIN_TTL_S = 60
export const MAX_TTL_S = 7 * 24 * 3600
const MAX_OPENS_LIMIT = 1000
const ID_RE = /^[A-Za-z0-9_-]{22}$/

export async function handle(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const origin = req.headers.get('Origin')
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  const cors = origin && allowed.includes(origin) ? origin : null

  const respond = (res: Response) => withHeaders(res, cors)

  try {
    if (req.method === 'OPTIONS') {
      return respond(
        new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Expires-In, X-Max-Opens, X-Delete-Token',
            'Access-Control-Max-Age': '86400',
          },
        }),
      )
    }

    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean) // ['api','shares',id?,'status'?]
    if (parts[0] !== 'api' || parts[1] !== 'shares' || parts.length > 4) return respond(error(404, 'not_found'))

    if (parts.length === 2) {
      if (req.method !== 'POST') return respond(error(405, 'method_not_allowed'))
      if (!cors) return respond(error(403, 'forbidden', 'Links can only be created from the Hide Me website.'))
      if (!(await allow(env, req, 'create'))) return respond(error(429, 'rate_limited'))
      return respond(await create(req, env, now))
    }

    const id = parts[2]
    if (!ID_RE.test(id)) return respond(error(404, 'not_found'))

    if (parts.length === 4) {
      if (parts[3] !== 'status' || req.method !== 'GET') return respond(error(404, 'not_found'))
      return respond(await status(id, env, now))
    }

    if (req.method === 'GET') return respond(await open(id, env, now))
    if (req.method === 'DELETE') {
      if (!(await allow(env, req, 'delete'))) return respond(error(429, 'rate_limited'))
      return respond(await revoke(id, req, env))
    }
    return respond(error(405, 'method_not_allowed'))
  } catch (e) {
    console.error(e)
    return respond(error(500, 'server_error', 'Something went wrong. Please try again.'))
  }
}

async function create(req: Request, env: Env, now: number): Promise<Response> {
  const declared = Number(req.headers.get('Content-Length') ?? 0)
  if (declared > MAX_BYTES) return error(413, 'too_large')

  const ttl = Number(req.headers.get('X-Expires-In'))
  if (!Number.isInteger(ttl) || ttl < MIN_TTL_S || ttl > MAX_TTL_S) {
    return error(400, 'bad_expiry', 'Expiry must be between 1 minute and 7 days.')
  }

  const rawMax = req.headers.get('X-Max-Opens')
  let maxOpens: number | null = null
  if (rawMax !== null && rawMax !== '') {
    maxOpens = Number(rawMax)
    if (!Number.isInteger(maxOpens) || maxOpens < 1 || maxOpens > MAX_OPENS_LIMIT) {
      return error(400, 'bad_max_opens')
    }
  }

  const body = await req.arrayBuffer()
  if (body.byteLength > MAX_BYTES) return error(413, 'too_large')
  // Must look like our encrypted format: version byte 1 + 12-byte IV + 16-byte tag at least.
  if (body.byteLength < 29 || new Uint8Array(body)[0] !== 1) return error(400, 'bad_payload')

  const id = b64url(randomBytes(16))
  const deleteToken = b64url(randomBytes(32))
  const expiresAt = now + ttl * 1000
  const meta: Meta = { expiresAt, opens: 0, maxOpens, tokenHash: await sha256hex(deleteToken) }

  await env.SHARES.put(`blob:${id}`, body, { expirationTtl: ttl })
  await env.SHARES.put(`meta:${id}`, JSON.stringify(meta), { expirationTtl: ttl })

  return json(201, { id, deleteToken, expiresAt })
}

async function readMeta(id: string, env: Env, now: number): Promise<Meta | Response> {
  const meta = (await env.SHARES.get(`meta:${id}`, 'json')) as Meta | null
  if (!meta) return error(404, 'not_found')
  if (now >= meta.expiresAt) return error(410, 'expired')
  return meta
}

async function open(id: string, env: Env, now: number): Promise<Response> {
  const meta = await readMeta(id, env, now)
  if (meta instanceof Response) return meta
  if (meta.maxOpens !== null && meta.opens >= meta.maxOpens) return error(410, 'used_up')

  const blob = await env.SHARES.get(`blob:${id}`, 'arrayBuffer')
  if (!blob) return error(404, 'not_found')

  // Count the open. KV is not transactional, so two opens at the very same
  // moment may count as one; the time limit is always exact.
  meta.opens += 1
  await env.SHARES.put(`meta:${id}`, JSON.stringify(meta), { expiration: kvExpiration(meta.expiresAt, now) })

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Expires-At': String(meta.expiresAt),
      'X-Server-Now': String(now),
      'X-Opens': String(meta.opens),
      ...(meta.maxOpens !== null ? { 'X-Max-Opens': String(meta.maxOpens) } : {}),
    },
  })
}

async function status(id: string, env: Env, now: number): Promise<Response> {
  const meta = await readMeta(id, env, now)
  if (meta instanceof Response) return meta
  return json(200, { expiresAt: meta.expiresAt, now, opens: meta.opens, maxOpens: meta.maxOpens })
}

async function revoke(id: string, req: Request, env: Env): Promise<Response> {
  const token = req.headers.get('X-Delete-Token') ?? ''
  const meta = (await env.SHARES.get(`meta:${id}`, 'json')) as Meta | null
  if (!meta) return error(404, 'not_found')
  if (!token || !timingSafeEqual(await sha256hex(token), meta.tokenHash)) return error(403, 'forbidden')
  await env.SHARES.delete(`blob:${id}`)
  await env.SHARES.delete(`meta:${id}`)
  return new Response(null, { status: 204 })
}

// ---- helpers ----

async function allow(env: Env, req: Request, action: string): Promise<boolean> {
  if (!env.RATE_LIMITER) return true
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  const { success } = await env.RATE_LIMITER.limit({ key: `${action}:${ip}` })
  return success
}

/** KV needs an absolute expiry at least 60 s in the future. */
function kvExpiration(expiresAt: number, now: number) {
  return Math.max(Math.ceil(expiresAt / 1000), Math.ceil(now / 1000) + 61)
}

function withHeaders(res: Response, corsOrigin: string | null): Response {
  const h = new Headers(res.headers)
  h.set('Cache-Control', 'no-store')
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Referrer-Policy', 'no-referrer')
  h.set('Vary', 'Origin')
  if (corsOrigin) {
    h.set('Access-Control-Allow-Origin', corsOrigin)
    h.set('Access-Control-Expose-Headers', 'X-Expires-At, X-Server-Now, X-Opens, X-Max-Opens')
  }
  return new Response(res.body, { status: res.status, headers: h })
}

const MESSAGES: Record<string, string> = {
  not_found: 'This link has expired or was removed.',
  expired: 'This link has expired.',
  used_up: 'This link has been opened the maximum number of times.',
  too_large: 'This file is too big (20 MB maximum).',
  rate_limited: 'Too many requests. Please wait a minute.',
  forbidden: 'Not allowed.',
  bad_payload: 'The upload was not in the expected format.',
  bad_max_opens: 'Open limit must be between 1 and 1000.',
  method_not_allowed: 'Method not allowed.',
}

function error(status: number, code: string, message = MESSAGES[code] ?? code): Response {
  return json(status, { error: code, message })
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function randomBytes(n: number) {
  return crypto.getRandomValues(new Uint8Array(n))
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
