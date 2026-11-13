// What goes inside the encrypted package, and how links are built and read.

import type { SheetSettings } from './layout'

export interface SharePayload {
  v: 1
  kind: 'photo-sheet'
  mime: string
  sheet: SheetSettings
  /** Whether the person opening the link may change copies and paper. */
  allowAdjust: boolean
  /** Short label shown to the shop, e.g. "Passport 35 × 45 mm". */
  label: string
}

export function buildLink(id: string, key: string) {
  const base = window.location.origin + window.location.pathname
  return `${base}#/p/${id}.${key}`
}

/** Parses "#/p/<id>.<key>". Returns null if the hash is not a share link. */
export function parseShareHash(hash: string): { id: string; key: string } | null {
  const m = /^#\/p\/([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{43})$/.exec(hash)
  return m ? { id: m[1], key: m[2] } : null
}

// Links made on this device, so the owner can check or revoke them later.
// Stored only in this browser. No photo is stored, only the link details.

export interface SavedLink {
  id: string
  key: string
  deleteToken: string
  expiresAt: number
  createdAt: number
  label: string
}

const STORE = 'hideme.links.v1'

export function loadLinks(): SavedLink[] {
  try {
    const raw = localStorage.getItem(STORE)
    const list = raw ? (JSON.parse(raw) as SavedLink[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveLinks(list: SavedLink[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list))
  } catch {
    // Private mode or storage blocked: the link still works, it just isn't listed.
  }
}

export function rememberLink(link: SavedLink) {
  saveLinks([link, ...loadLinks().filter((l) => l.id !== link.id)].slice(0, 100))
}

export function forgetLink(id: string) {
  saveLinks(loadLinks().filter((l) => l.id !== id))
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'expired'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`
  return `${sec}s`
}
