// Turns the files the owner picked into the files that will be shared.
// Everything happens on the owner's device, before encryption:
//
// - ZIP files are opened here; only the files inside that can be shown are kept.
//   The person opening the link never receives the ZIP.
// - Images are re-drawn, which removes location/camera metadata.
// - Spreadsheets become plain tables of text (no formulas, macros or hidden data).
// - Text files are cleaned up into UTF-8.
// - PDF and Word files are checked so broken or password-protected ones are
//   caught now instead of on the other person's screen.

import type { DocFile, TableData } from './docs'
import { classify, extensionOf, type DocKind } from './files'
import { MAX_SHARE_BYTES } from './linkOptions'

export class Skip extends Error {}

export interface Skipped {
  name: string
  reason: string
}

const MAX_TEXT_CHARS = 3_000_000
const MAX_ROWS = 5000
const MAX_COLS = 100
const MAX_IMAGE_SIDE = 4000
const MAX_ZIP_ENTRY = 50 * 1024 * 1024
const MAX_ZIP_TOTAL = 200 * 1024 * 1024

export interface Source {
  name: string
  type: string
  size?: number
  bytes: () => Promise<ArrayBuffer>
}

export function fromFile(f: File): Source {
  return { name: f.name, type: f.type, size: f.size, bytes: () => f.arrayBuffer() }
}

const MB = 1024 * 1024
const MAX_ZIP_INPUT = 200 * MB

export type ImageFn = (
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  mime: string,
) => Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }>

/** Browser-only checks, passed in so this module can be tested without a browser. */
export interface Checks {
  image?: ImageFn
  /** Opens the PDF and returns its page count; throws Skip if it can't be shown. */
  pdf?: (bytes: Uint8Array<ArrayBuffer>) => Promise<number>
  /** Parses the Word file; throws Skip if it can't be shown. */
  docx?: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>
}

export async function prepareSources(
  sources: Source[],
  checks: Checks = {},
): Promise<{ files: DocFile[]; skipped: Skipped[] }> {
  const files: DocFile[] = []
  const skipped: Skipped[] = []

  async function one(name: string, mime: string, bytes: Uint8Array<ArrayBuffer>, insideZip: boolean) {
    const c = classify(name, mime)
    if (!c.ok) throw new Skip(c.reason)
    if (c.kind === 'zip') {
      if (insideZip) throw new Skip('A ZIP inside a ZIP isn’t opened. Add it separately.')
      const entries = await unzip(bytes)
      if (entries.length === 0) throw new Skip('This ZIP is empty.')
      for (const [path, data] of entries) {
        try {
          await one(`${name} › ${path}`, '', data, true)
        } catch (e) {
          skipped.push({ name: `${name} › ${path}`, reason: e instanceof Skip ? e.message : 'This file could not be opened.' })
        }
      }
      return
    }
    files.push(await convert(c.kind, name, mime, bytes, checks))
  }

  for (const s of sources) {
    try {
      const c = classify(s.name, s.type)
      if (c.ok && s.size !== undefined) {
        if (c.kind === 'zip' && s.size > MAX_ZIP_INPUT) throw new Skip('This ZIP is larger than 200 MB.')
        // Images are re-saved smaller, so only other files are checked against the link size here.
        if (c.kind !== 'zip' && c.kind !== 'image' && s.size > MAX_SHARE_BYTES) {
          throw new Skip(`This file is larger than ${MAX_SHARE_BYTES / MB} MB, the most one link can hold.`)
        }
      }
      await one(s.name, s.type, new Uint8Array(await s.bytes()), false)
    } catch (e) {
      skipped.push({ name: s.name, reason: e instanceof Skip ? e.message : 'This file could not be opened.' })
    }
  }
  return { files, skipped }
}

async function convert(
  kind: DocKind,
  name: string,
  mime: string,
  bytes: Uint8Array<ArrayBuffer>,
  checks: Checks,
): Promise<DocFile> {
  switch (kind) {
    case 'pdf': {
      if (!findAscii(bytes, '%PDF-', 1024)) throw new Skip('This doesn’t look like a PDF file.')
      const pages = checks.pdf ? await checks.pdf(bytes) : undefined
      return { entry: { name, kind, mime: 'application/pdf', size: bytes.length, pages }, bytes }
    }
    case 'docx': {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        throw new Skip('This Word file is password-protected or damaged. Remove the password and save it again.')
      }
      if (checks.docx) await checks.docx(bytes)
      return { entry: { name, kind, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: bytes.length }, bytes }
    }
    case 'image': {
      const out = await (checks.image ?? normalizeImage)(bytes, name, mime)
      return { entry: { name, kind, mime: out.mime, size: out.bytes.length }, bytes: out.bytes }
    }
    case 'text': {
      const text = decodeAnyText(bytes)
      if (looksBinary(text)) throw new Skip('This doesn’t look like a text file.')
      if (text.length > MAX_TEXT_CHARS) throw new Skip('This text file is too large to show (about 3 MB maximum).')
      const out = new TextEncoder().encode(text)
      return { entry: { name, kind, mime: 'text/plain', size: out.length }, bytes: out }
    }
    case 'table': {
      const table = await toTable(bytes, extensionOf(name))
      const out = new TextEncoder().encode(JSON.stringify(table))
      return { entry: { name, kind, mime: 'application/json', size: out.length }, bytes: out }
    }
  }
}

// ---- ZIP ----

async function unzip(bytes: Uint8Array): Promise<[string, Uint8Array<ArrayBuffer>][]> {
  const { unzipSync } = await import('fflate')
  let total = 0
  let result: Record<string, Uint8Array>
  try {
    result = unzipSync(bytes, {
      filter(f) {
        const base = f.name.split('/').pop() ?? ''
        if (f.name.endsWith('/') || f.name.startsWith('__MACOSX/') || base.startsWith('.') || base === 'Thumbs.db') return false
        if (f.originalSize > MAX_ZIP_ENTRY) return false
        total += f.originalSize
        return total <= MAX_ZIP_TOTAL
      },
    })
  } catch {
    throw new Skip('This ZIP couldn’t be opened. It may be password-protected or damaged.')
  }
  return Object.entries(result)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, data]) => [path, new Uint8Array(data)])
}

// ---- Text ----

export function decodeAnyText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4000)
  let bad = 0
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i)
    if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12)) bad++
  }
  return bad > sample.length * 0.02
}

// ---- Spreadsheets ----

export async function toTable(bytes: Uint8Array, ext: string): Promise<TableData> {
  const XLSX = await import('xlsx')
  let wb
  try {
    wb =
      ext === 'csv' || ext === 'tsv'
        ? XLSX.read(decodeAnyText(bytes), { type: 'string', FS: ext === 'tsv' ? '\t' : undefined, sheetRows: MAX_ROWS + 1, raw: false })
        : XLSX.read(bytes, { type: 'array', sheetRows: MAX_ROWS + 1, cellHTML: false, cellFormula: false, bookVBA: false })
  } catch (e) {
    const msg = String((e as Error)?.message ?? '')
    if (/password|encrypt/i.test(msg)) throw new Skip('Password-protected spreadsheets can’t be opened. Remove the password first.')
    throw new Skip('This spreadsheet couldn’t be opened.')
  }
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false })
    const truncated = all.length > MAX_ROWS || all.some((r) => r.length > MAX_COLS)
    const rows = all.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((v) => (v == null ? '' : String(v))))
    return { name, rows, truncated }
  })
  if (sheets.every((s) => s.rows.length === 0)) throw new Skip('This spreadsheet is empty.')
  return { sheets }
}

// ---- Images ----

/** Re-draws the image (drops metadata). PNG stays PNG; everything else becomes JPEG. */
export async function normalizeImage(
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  mime: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  const ext = extensionOf(name)
  const type = mime || (ext === 'jpg' || ext === 'jfif' ? 'image/jpeg' : `image/${ext}`)
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(new Blob([bytes], { type }))
  } catch {
    if (ext === 'heic' || ext === 'heif') {
      throw new Skip('HEIC photos can’t be opened in this browser. On iPhone, share the photo as JPG (or set Camera → Formats → Most Compatible).')
    }
    throw new Skip('This image couldn’t be opened.')
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Skip('Your browser cannot process images.')
  const keepPng = type === 'image/png'
  if (!keepPng) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const outType = keepPng ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, outType, 0.92))
  canvas.width = canvas.height = 0
  if (!blob) throw new Skip('This image couldn’t be prepared.')
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: outType }
}

function findAscii(bytes: Uint8Array, needle: string, within: number): boolean {
  const n = [...needle].map((c) => c.charCodeAt(0))
  const end = Math.min(bytes.length - n.length, within)
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer
    return true
  }
  return false
}
