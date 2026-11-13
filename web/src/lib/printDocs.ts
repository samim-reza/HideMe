// Printing a shared document, without ever handing over the file.
//
// The print pages are built off-screen (PDF pages are drawn to images, other
// files are laid out as plain HTML), the browser prints them, and they stay
// hidden on screen. Only one print job exists at a time; it is removed when
// another file is opened, when the link expires, or when the page closes.

import { watermarkElement } from './watermark'
import { decodeTable, decodeText, type DocFile } from './docs'
import { renderDocx } from './docx'
import { closePdf, openPdf, pageSizeMm, renderPage } from './pdf'

const PRINT_DPI = 200
const MAX_PAGE_PIXELS = 24_000_000

let current: (() => void) | null = null

export function clearPrintJob() {
  current?.()
  current = null
}

export async function printDoc(
  file: DocFile,
  opts: { watermark: string; onProgress?: (done: number, total: number) => void },
): Promise<void> {
  clearPrintJob()

  const portal = document.createElement('div')
  portal.className = 'print-portal print-job'
  portal.setAttribute('aria-hidden', 'true')
  const style = document.createElement('style')
  const urls: string[] = []
  let cancelled = false
  const cleanup = () => {
    cancelled = true
    portal.remove()
    style.remove()
    urls.forEach((u) => URL.revokeObjectURL(u))
    urls.length = 0
  }
  current = cleanup

  const wm = opts.watermark.trim()
  const kind = file.entry.kind

  if (kind === 'pdf') {
    const doc = await openPdf(file.bytes)
    try {
      const first = pageSizeMm(await doc.getPage(1))
      style.textContent = `@page { size: ${first.w}mm ${first.h}mm; margin: 0; }`
      const total = doc.numPages
      opts.onProgress?.(0, total)
      for (let i = 1; i <= total; i++) {
        if (cancelled) return
        const page = await doc.getPage(i)
        const v = page.getViewport({ scale: 1 })
        let scale = PRINT_DPI / 72
        const px = v.width * v.height * scale * scale
        if (px > MAX_PAGE_PIXELS) scale *= Math.sqrt(MAX_PAGE_PIXELS / px)
        const canvas = document.createElement('canvas')
        await renderPage(page, canvas, scale).promise
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
        canvas.width = canvas.height = 0
        page.cleanup()
        if (!blob) throw new Error('Could not prepare page')
        const url = URL.createObjectURL(blob)
        urls.push(url)
        portal.append(pageBox(first.w, first.h, url, wm))
        opts.onProgress?.(i, total)
      }
    } finally {
      await closePdf(doc)
    }
  } else if (kind === 'image') {
    const url = URL.createObjectURL(new Blob([file.bytes], { type: file.entry.mime }))
    urls.push(url)
    const probe = new Image()
    probe.src = url
    await probe.decode().catch(() => {})
    const landscape = probe.naturalWidth > probe.naturalHeight
    const [w, h] = landscape ? [297, 210] : [210, 297]
    style.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`
    const box = pageBox(w, h, url, wm)
    box.style.padding = '10mm'
    portal.append(box)
  } else if (kind === 'text') {
    style.textContent = '@page { size: 210mm 297mm; margin: 16mm 15mm; }'
    const pre = document.createElement('pre')
    pre.className = 'print-text'
    pre.textContent = decodeText(file.bytes)
    portal.append(pre)
    if (wm) portal.append(watermarkElement(wm, true))
  } else if (kind === 'table') {
    style.textContent = '@page { size: 297mm 210mm; margin: 10mm; }'
    const data = decodeTable(file.bytes)
    for (const sheet of data.sheets) {
      if (data.sheets.length > 1) {
        const h = document.createElement('h2')
        h.className = 'print-sheet-title'
        h.textContent = sheet.name
        portal.append(h)
      }
      portal.append(tableElement(sheet.rows))
    }
    if (wm) portal.append(watermarkElement(wm, true))
  } else if (kind === 'docx') {
    const styles = document.createElement('div')
    const body = document.createElement('div')
    body.className = 'print-docx'
    portal.append(styles, body)
    document.body.append(portal) // docx-preview needs the nodes in the page
    await renderDocx(file.bytes, body, styles, { inWrapper: false })
    const section = body.querySelector('section.docx') as HTMLElement | null
    const s = section?.style
    const size = s?.width && s?.minHeight ? `${s.width} ${s.minHeight}` : '210mm 297mm'
    const margin = s ? [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((m) => m || '20mm').join(' ') : '20mm'
    style.textContent = `@page { size: ${size}; margin: ${margin}; }`
    if (wm) portal.append(watermarkElement(wm, true))
  }

  if (cancelled) return
  document.head.append(style)
  if (!portal.isConnected) document.body.append(portal)
  await Promise.all([...portal.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  if (cancelled) return
  window.print()
}

function pageBox(wMm: number, hMm: number, url: string, wm: string): HTMLElement {
  const box = document.createElement('div')
  box.className = 'print-page'
  box.style.width = `${wMm}mm`
  box.style.height = `${hMm - 0.6}mm` // a hair shorter so no blank page is added
  const img = document.createElement('img')
  img.src = url
  img.alt = ''
  box.append(img)
  if (wm) box.append(watermarkElement(wm))
  return box
}

function tableElement(rows: string[][]): HTMLTableElement {
  const table = document.createElement('table')
  table.className = 'print-table'
  if (rows.length === 0) return table
  const head = document.createElement('thead')
  const tr = document.createElement('tr')
  for (const cell of rows[0]) {
    const th = document.createElement('th')
    th.textContent = cell
    tr.append(th)
  }
  head.append(tr)
  table.append(head)
  const tbody = document.createElement('tbody')
  for (const row of rows.slice(1)) {
    const r = document.createElement('tr')
    for (const cell of row) {
      const td = document.createElement('td')
      td.textContent = cell
      r.append(td)
    }
    tbody.append(r)
  }
  table.append(tbody)
  return table
}
