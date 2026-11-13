// Choices shared by every kind of link.

export const EXPIRY_OPTIONS = [
  { value: 600, label: '10 min' },
  { value: 3600, label: '1 hour' },
  { value: 6 * 3600, label: '6 hours' },
  { value: 24 * 3600, label: '1 day' },
  { value: 3 * 24 * 3600, label: '3 days' },
  { value: 7 * 24 * 3600, label: '7 days' },
]

export const OPEN_OPTIONS = [
  { value: 0, label: 'No limit' },
  { value: 1, label: '1 time' },
  { value: 3, label: '3 times' },
  { value: 10, label: '10 times' },
]

/** A link that was just created. */
export interface Created {
  link: string
  id: string
  deleteToken: string
  expiresAt: number
}

/** Largest total size of one link (the free storage plan allows 25 MB per item). */
export const MAX_SHARE_BYTES = 24 * 1024 * 1024

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
