// The "documents" link format: several files packed into one encrypted bundle.
//
// Plaintext layout (inside the encryption): pack(header, all file bytes one
// after another). The header lists each file's name, kind and byte length.

import { pack } from './crypto'
import type { DocKind } from './files'

export interface DocEntry {
  name: string
  kind: DocKind
  mime: string
  /** Bytes of this file inside the bundle. */
  size: number
  /** Page count for PDFs (shown before opening). */
  pages?: number
}

export interface DocsPayload {
  v: 1
  kind: 'docs'
  files: DocEntry[]
  allowPrint: boolean
  /** Optional text repeated across every page, e.g. "For ABC Bank only". */
  watermark: string
}

export interface DocFile {
  entry: DocEntry
  bytes: Uint8Array<ArrayBuffer>
}

/** Rows of cell text per sheet; what a spreadsheet becomes before sharing. */
export interface TableData {
  sheets: { name: string; rows: string[][]; truncated: boolean }[]
}

export const MAX_WATERMARK = 80

export function packDocs(opts: { allowPrint: boolean; watermark: string }, files: DocFile[]): Uint8Array<ArrayBuffer> {
  const total = files.reduce((n, f) => n + f.bytes.length, 0)
  const body = new Uint8Array(total)
  let at = 0
  for (const f of files) {
    body.set(f.bytes, at)
    at += f.bytes.length
  }
  const header: DocsPayload = {
    v: 1,
    kind: 'docs',
    files: files.map((f) => ({ ...f.entry, size: f.bytes.length })),
    allowPrint: opts.allowPrint,
    watermark: opts.watermark.trim().slice(0, MAX_WATERMARK),
  }
  return pack(header, body)
}

/** Splits the bundle back into files. The views share the same memory as `body`. */
export function splitDocs(header: DocsPayload, body: Uint8Array<ArrayBuffer>): DocFile[] {
  if (!Array.isArray(header.files) || header.files.length === 0) throw new Error('Empty bundle')
  const total = header.files.reduce((n, f) => n + f.size, 0)
  if (total !== body.length || header.files.some((f) => !Number.isInteger(f.size) || f.size < 0)) {
    throw new Error('Damaged bundle')
  }
  let at = 0
  return header.files.map((entry) => {
    const bytes = body.subarray(at, at + entry.size)
    at += entry.size
    return { entry, bytes }
  })
}

export function decodeTable(bytes: Uint8Array): TableData {
  const data = JSON.parse(new TextDecoder().decode(bytes)) as TableData
  if (!Array.isArray(data.sheets)) throw new Error('Damaged table')
  return data
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
