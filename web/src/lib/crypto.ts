// Browser-side encryption. The key is created here, put only in the link's
// #fragment, and never sent to the server.
//
// Encrypted blob format (version 1):
//   [1 byte version = 1][12 bytes IV][AES-256-GCM ciphertext + 16 byte tag]
// The version byte is also passed as additional authenticated data, so it
// cannot be changed without decryption failing.
//
// Plaintext format:
//   [4 bytes big-endian header length][header JSON (UTF-8)][file bytes]

const VERSION = 1
const IV_LEN = 12

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('Invalid base64url')
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey(raw: Uint8Array<ArrayBuffer>, usage: KeyUsage) {
  if (raw.length !== 32) throw new Error('Key must be 32 bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage])
}

export async function encrypt(
  rawKey: Uint8Array<ArrayBuffer>,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await importKey(rawKey, 'encrypt')
  const iv = randomBytes(IV_LEN)
  const aad = new Uint8Array([VERSION])
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext),
  )
  const out = new Uint8Array(1 + IV_LEN + ct.length)
  out[0] = VERSION
  out.set(iv, 1)
  out.set(ct, 1 + IV_LEN)
  return out
}

export async function decrypt(
  rawKey: Uint8Array<ArrayBuffer>,
  blob: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (blob.length < 1 + IV_LEN + 16 || blob[0] !== VERSION) {
    throw new Error('Unsupported or damaged data')
  }
  const key = await importKey(rawKey, 'decrypt')
  const iv = blob.slice(1, 1 + IV_LEN)
  const ct = blob.slice(1 + IV_LEN)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: new Uint8Array([VERSION]) },
    key,
    ct,
  )
  return new Uint8Array(pt)
}

export function pack(header: unknown, file: Uint8Array): Uint8Array<ArrayBuffer> {
  const h = new TextEncoder().encode(JSON.stringify(header))
  const out = new Uint8Array(4 + h.length + file.length)
  new DataView(out.buffer).setUint32(0, h.length)
  out.set(h, 4)
  out.set(file, 4 + h.length)
  return out
}

export function unpack<T>(data: Uint8Array<ArrayBuffer>): { header: T; file: Uint8Array<ArrayBuffer> } {
  if (data.length < 4) throw new Error('Damaged data')
  const len = new DataView(data.buffer, data.byteOffset).getUint32(0)
  if (4 + len > data.length) throw new Error('Damaged data')
  const header = JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + len))) as T
  return { header, file: data.slice(4 + len) }
}
