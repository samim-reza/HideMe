// Calls to the Hide Me Worker. Only encrypted bytes are ever sent.

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8787'

export interface CreatedShare {
  id: string
  deleteToken: string
  expiresAt: number
}

export interface ShareStatus {
  expiresAt: number
  now: number
  opens: number
  maxOpens: number | null
}

/** A link that has expired, been revoked, or never existed. */
export class GoneError extends Error {
  reason: 'gone' | 'used_up'
  constructor(reason: 'gone' | 'used_up') {
    super(reason === 'used_up' ? 'This link has been opened the maximum number of times.' : 'This link has expired or was removed.')
    this.reason = reason
  }
}

async function failure(res: Response): Promise<never> {
  if (res.status === 404) throw new GoneError('gone')
  if (res.status === 410) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new GoneError(body.error === 'used_up' ? 'used_up' : 'gone')
  }
  if (res.status === 429) throw new Error('Too many requests. Please wait a minute and try again.')
  if (res.status === 413) throw new Error('This file is too big.')
  const body = (await res.json().catch(() => ({}))) as { message?: string }
  throw new Error(body.message || `Server error (${res.status}). Please try again.`)
}

async function request(path: string, init?: RequestInit) {
  try {
    return await fetch(API_URL + path, { cache: 'no-store', ...init })
  } catch {
    throw new Error('Could not reach the Hide Me server. Check your internet connection.')
  }
}

export async function createShare(
  ciphertext: Uint8Array<ArrayBuffer>,
  expiresInSeconds: number,
  maxOpens: number | null,
): Promise<CreatedShare> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-Expires-In': String(expiresInSeconds),
  }
  if (maxOpens) headers['X-Max-Opens'] = String(maxOpens)
  const res = await request('/api/shares', { method: 'POST', headers, body: ciphertext })
  if (!res.ok) return failure(res)
  return res.json()
}

export async function fetchShare(id: string): Promise<{ data: Uint8Array<ArrayBuffer>; status: ShareStatus }> {
  const res = await request(`/api/shares/${encodeURIComponent(id)}`)
  if (!res.ok) return failure(res)
  const data = new Uint8Array(await res.arrayBuffer())
  const maxOpens = res.headers.get('X-Max-Opens')
  return {
    data,
    status: {
      expiresAt: Number(res.headers.get('X-Expires-At')),
      now: Number(res.headers.get('X-Server-Now')),
      opens: Number(res.headers.get('X-Opens')),
      maxOpens: maxOpens ? Number(maxOpens) : null,
    },
  }
}

export async function getStatus(id: string): Promise<ShareStatus> {
  const res = await request(`/api/shares/${encodeURIComponent(id)}/status`)
  if (!res.ok) return failure(res)
  return res.json()
}

export async function revokeShare(id: string, deleteToken: string): Promise<void> {
  const res = await request(`/api/shares/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-Delete-Token': deleteToken },
  })
  if (!res.ok && res.status !== 404) return failure(res)
}
