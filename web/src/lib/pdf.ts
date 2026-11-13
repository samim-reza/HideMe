// PDF rendering with pdf.js, loaded only when a PDF is actually shown.
// The "legacy" build is used so older browsers (common on print-shop
// computers) can still open PDFs. Pages are drawn onto canvases: there is no
// text layer to copy from and no links to click, and PDF scripts never run.

import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { Skip } from './prepare'

export type { PDFDocumentProxy, PDFPageProxy }

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let lib: Promise<PdfJs> | null = null

export function loadPdfjs(): Promise<PdfJs> {
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = workerUrl
    return m
  })
  return lib
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs()
  const base = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href
  const task = pdfjs.getDocument({
    data: bytes.slice(), // pdf.js takes over the buffer it is given, so pass a copy
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
    wasmUrl: base + 'wasm/',
    iccUrl: base + 'iccs/',
    enableXfa: false,
    stopAtErrors: false,
  })
  try {
    return await task.promise
  } catch (e) {
    void task.destroy() // also stop the worker when the file can't be opened
    throw e
  }
}

/** Frees the document and its worker (pdf.js v6 closes documents through their loading task). */
export function closePdf(doc: PDFDocumentProxy | null | undefined): Promise<void> {
  return doc ? doc.loadingTask.destroy() : Promise.resolve()
}

function isPasswordError(e: unknown) {
  return (e as { name?: string } | null)?.name === 'PasswordException'
}

/** Owner-side check before sharing: returns the page count or explains the problem. */
export async function checkPdf(bytes: Uint8Array): Promise<number> {
  let doc: PDFDocumentProxy | null = null
  try {
    doc = await openPdf(bytes)
    return doc.numPages
  } catch (e) {
    if (isPasswordError(e)) {
      throw new Skip('This PDF is password-protected. Remove the password first (for example, print it to a new PDF).')
    }
    throw new Skip('This PDF couldn’t be opened. It may be damaged.')
  } finally {
    await closePdf(doc)
  }
}

/** Draws a page onto `canvas` at `scale` (1 = 72 dpi). Returns the task so it can be cancelled. */
export function renderPage(page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number): RenderTask {
  const viewport = page.getViewport({ scale })
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  return page.render({ canvas, viewport, background: '#ffffff' })
}

/** Page size in millimetres. */
export function pageSizeMm(page: PDFPageProxy): { w: number; h: number } {
  const v = page.getViewport({ scale: 1 })
  return { w: (v.width / 72) * 25.4, h: (v.height / 72) * 25.4 }
}
