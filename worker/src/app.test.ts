import { beforeEach, describe, expect, it } from 'vitest'
import { handle, MAX_BYTES, type Env, type KV } from './app'

/** In-memory KV that honours expiry against a controllable clock. */
class MemoryKV implements KV {
  store = new Map<string, { value: string | ArrayBuffer; expiresAtS: number }>()
  constructor(private clock: { now: number }) {}

  private live(key: string) {
    const e = this.store.get(key)
    if (!e) return null
    if (this.clock.now / 1000 >= e.expiresAtS) {
      this.store.delete(key)
      return null
    }
    return e.value
  }

  async get(key: string, type: 'json' | 'text' | 'arrayBuffer'): Promise<any> {
    const v = this.live(key)
    if (v === null) return null
    return type === 'json' ? JSON.parse(v as string) : v
  }

  async put(key: string, value: string | ArrayBuffer, opts: { expiration?: number; expirationTtl?: number } = {}) {
    const expiresAtS = opts.expiration ?? this.clock.now / 1000 + (opts.expirationTtl ?? Infinity)
    this.store.set(key, { value, expiresAtS })
  }

  async delete(key: string) {
    this.store.delete(key)
  }
}

const SITE = 'https://hideme.samimreza.me'
const API = 'https://api.example.workers.dev'

let clock: { now: number }
let kv: MemoryKV
let env: Env

beforeEach(() => {
  clock = { now: Date.UTC(2026, 10, 14, 12, 0, 0) }
  kv = new MemoryKV(clock)
  env = { SHARES: kv, ALLOWED_ORIGINS: `${SITE}, http://localhost:5173` }
})

function fakeCiphertext(size = 200) {
  const b = new Uint8Array(size)
  b[0] = 1
  return b
}

function call(path: string, init: RequestInit = {}) {
  return handle(new Request(API + path, init), env, clock.now)
}

async function createShare(opts: { ttl?: number; maxOpens?: number; body?: Uint8Array; origin?: string } = {}) {
  const headers: Record<string, string> = { 'X-Expires-In': String(opts.ttl ?? 3600) }
  if (opts.origin !== '') headers.Origin = opts.origin ?? SITE
  if (opts.maxOpens) headers['X-Max-Opens'] = String(opts.maxOpens)
  return call('/api/shares', { method: 'POST', headers, body: opts.body ?? fakeCiphertext() })
}

async function created(opts?: Parameters<typeof createShare>[0]) {
  const res = await createShare(opts)
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string; deleteToken: string; expiresAt: number }
}

describe('create', () => {
  it('stores the blob and returns an id, token and expiry', async () => {
    const s = await created({ ttl: 600 })
    expect(s.id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(s.deleteToken.length).toBeGreaterThan(40)
    expect(s.expiresAt).toBe(clock.now + 600_000)
    expect(kv.store.has(`blob:${s.id}`)).toBe(true)
  })

  it('never stores the delete token in plain form', async () => {
    const s = await created()
    const meta = JSON.stringify(await kv.get(`meta:${s.id}`, 'json'))
    expect(meta).not.toContain(s.deleteToken)
  })

  it('sends CORS headers only to the allowed site', async () => {
    const res = await createShare()
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
  })

  it('refuses uploads from other websites', async () => {
    expect((await createShare({ origin: 'https://evil.example' })).status).toBe(403)
    expect((await createShare({ origin: '' })).status).toBe(403)
  })

  it('rejects expiry outside 1 minute to 7 days', async () => {
    expect((await createShare({ ttl: 30 })).status).toBe(400)
    expect((await createShare({ ttl: 8 * 24 * 3600 })).status).toBe(400)
  })

  it('rejects data that is not in the encrypted format', async () => {
    expect((await createShare({ body: new Uint8Array(200) })).status).toBe(400)
    expect((await createShare({ body: new Uint8Array([1, 2, 3]) })).status).toBe(400)
  })

  it('rejects files over the size limit', async () => {
    expect((await createShare({ body: fakeCiphertext(MAX_BYTES + 1) })).status).toBe(413)
  })

  it('obeys the rate limiter', async () => {
    env.RATE_LIMITER = { limit: async () => ({ success: false }) }
    expect((await createShare()).status).toBe(429)
  })
})

describe('open', () => {
  it('returns the blob with expiry info and counts the open', async () => {
    const s = await created()
    const res = await call(`/api/shares/${s.id}`, { headers: { Origin: SITE } })
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(fakeCiphertext())
    expect(res.headers.get('X-Expires-At')).toBe(String(s.expiresAt))
    expect(res.headers.get('X-Opens')).toBe('1')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('refuses after the expiry time even if storage still has it', async () => {
    const s = await created({ ttl: 600 })
    clock.now = s.expiresAt - 1
    // Simulate storage that has not deleted yet by bumping stored expiry.
    for (const e of kv.store.values()) e.expiresAtS += 3600
    expect((await call(`/api/shares/${s.id}`)).status).toBe(200)
    clock.now = s.expiresAt
    expect((await call(`/api/shares/${s.id}`)).status).toBe(410)
  })

  it('is gone once storage deletes it', async () => {
    const s = await created({ ttl: 600 })
    clock.now += 601_000
    expect((await call(`/api/shares/${s.id}`)).status).toBe(404)
  })

  it('stops after the maximum number of opens', async () => {
    const s = await created({ maxOpens: 2 })
    expect((await call(`/api/shares/${s.id}`)).status).toBe(200)
    expect((await call(`/api/shares/${s.id}`)).status).toBe(200)
    const third = await call(`/api/shares/${s.id}`)
    expect(third.status).toBe(410)
    expect(((await third.json()) as { error: string }).error).toBe('used_up')
  })

  it('keeps the original expiry when counting opens', async () => {
    const s = await created({ ttl: 600 })
    await call(`/api/shares/${s.id}`)
    expect(kv.store.get(`opens:${s.id}`)!.expiresAtS).toBe(Math.ceil(s.expiresAt / 1000))
  })

  it('never rewrites the link record when counting opens', async () => {
    const s = await created()
    const before = JSON.stringify(await kv.get(`meta:${s.id}`, 'json'))
    await call(`/api/shares/${s.id}`)
    expect(JSON.stringify(await kv.get(`meta:${s.id}`, 'json'))).toBe(before)
  })

  it('still reads open counts from links made before this change', async () => {
    const s = await created({ maxOpens: 3 })
    const meta = (await kv.get(`meta:${s.id}`, 'json')) as Record<string, unknown>
    await kv.put(`meta:${s.id}`, JSON.stringify({ ...meta, opens: 3 }), { expirationTtl: 3600 })
    expect((await call(`/api/shares/${s.id}`)).status).toBe(410)
  })

  it('returns 404 for unknown or malformed ids', async () => {
    expect((await call('/api/shares/AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404)
    expect((await call('/api/shares/..%2F..')).status).toBe(404)
  })
})

describe('status', () => {
  it('reports opens without counting one', async () => {
    const s = await created({ maxOpens: 3 })
    await call(`/api/shares/${s.id}`)
    const res = await call(`/api/shares/${s.id}/status`)
    expect(await res.json()).toEqual({ expiresAt: s.expiresAt, now: clock.now, opens: 1, maxOpens: 3 })
    const again = (await (await call(`/api/shares/${s.id}/status`)).json()) as { opens: number }
    expect(again.opens).toBe(1)
  })
})

describe('revoke', () => {
  it('deletes the data with the right token and marks the link stopped', async () => {
    const s = await created()
    await call(`/api/shares/${s.id}`)
    const res = await call(`/api/shares/${s.id}`, { method: 'DELETE', headers: { 'X-Delete-Token': s.deleteToken } })
    expect(res.status).toBe(204)
    expect(kv.store.has(`blob:${s.id}`)).toBe(false)
    expect(kv.store.has(`opens:${s.id}`)).toBe(false)
    expect((await call(`/api/shares/${s.id}`)).status).toBe(404)
    expect((await call(`/api/shares/${s.id}/status`)).status).toBe(404)
    // Stopping again is harmless
    expect((await call(`/api/shares/${s.id}`, { method: 'DELETE', headers: { 'X-Delete-Token': s.deleteToken } })).status).toBe(404)
  })

  it('a late open count from elsewhere cannot bring a stopped link back', async () => {
    const s = await created()
    await call(`/api/shares/${s.id}`, { method: 'DELETE', headers: { 'X-Delete-Token': s.deleteToken } })
    // What a slow open at another location might write after the stop:
    await kv.put(`opens:${s.id}`, '5', { expirationTtl: 3600 })
    await kv.put(`blob:${s.id}`, fakeCiphertext().buffer, { expirationTtl: 3600 })
    expect((await call(`/api/shares/${s.id}/status`)).status).toBe(404)
    expect((await call(`/api/shares/${s.id}`)).status).toBe(404)
  })

  it('keeps the stopped mark only until the original expiry', async () => {
    const s = await created({ ttl: 600 })
    await call(`/api/shares/${s.id}`, { method: 'DELETE', headers: { 'X-Delete-Token': s.deleteToken } })
    clock.now += 601_000
    expect(kv.store.size).toBeGreaterThan(0)
    await kv.get(`meta:${s.id}`, 'json')
    expect(kv.store.has(`meta:${s.id}`)).toBe(false)
  })

  it('refuses a wrong or missing token', async () => {
    const s = await created()
    expect((await call(`/api/shares/${s.id}`, { method: 'DELETE', headers: { 'X-Delete-Token': 'nope' } })).status).toBe(403)
    expect((await call(`/api/shares/${s.id}`, { method: 'DELETE' })).status).toBe(403)
    expect((await call(`/api/shares/${s.id}`)).status).toBe(200)
  })
})

describe('routing', () => {
  it('answers CORS preflight', async () => {
    const res = await call('/api/shares', { method: 'OPTIONS', headers: { Origin: SITE } })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Expires-In')
  })

  it('404s other paths', async () => {
    expect((await call('/')).status).toBe(404)
    expect((await call('/api/other')).status).toBe(404)
  })
})
