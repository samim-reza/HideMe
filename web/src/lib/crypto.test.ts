import { describe, expect, it } from 'vitest'
import { decrypt, encrypt, fromBase64Url, pack, randomBytes, toBase64Url, unpack } from './crypto'

describe('crypto', () => {
  it('round-trips data', async () => {
    const key = randomBytes(32)
    const data = new Uint8Array(200_000).map((_, i) => (i * 31) % 256)
    const blob = await encrypt(key, data)
    expect(await decrypt(key, blob)).toEqual(data)
  })

  it('uses a fresh IV every time', async () => {
    const key = randomBytes(32)
    const data = new Uint8Array([1, 2, 3])
    const a = await encrypt(key, data)
    const b = await encrypt(key, data)
    expect(toBase64Url(a)).not.toBe(toBase64Url(b))
  })

  it('rejects the wrong key', async () => {
    const blob = await encrypt(randomBytes(32), new Uint8Array([1, 2, 3]))
    await expect(decrypt(randomBytes(32), blob)).rejects.toThrow()
  })

  it('rejects tampered data', async () => {
    const key = randomBytes(32)
    const blob = await encrypt(key, randomBytes(64))
    blob[blob.length - 1] ^= 1
    await expect(decrypt(key, blob)).rejects.toThrow()
  })

  it('rejects a changed version byte', async () => {
    const key = randomBytes(32)
    const blob = await encrypt(key, randomBytes(64))
    blob[0] = 2
    await expect(decrypt(key, blob)).rejects.toThrow()
  })

  it('encodes keys as base64url and back', () => {
    const key = randomBytes(32)
    const s = toBase64Url(key)
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(fromBase64Url(s)).toEqual(key)
  })

  it('packs a header with a file', () => {
    const file = randomBytes(500)
    const { header, file: out } = unpack<{ a: number }>(pack({ a: 1 }, file))
    expect(header).toEqual({ a: 1 })
    expect(out).toEqual(file)
  })
})
