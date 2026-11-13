// On-screen viewers for each kind of shared file. Nothing here offers a way to
// download: PDFs are drawn onto canvases, other files are shown as page-like
// boxes, right-click and dragging are blocked, and a watermark (if set) covers
// every page.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { decodeTable, decodeText, type DocFile } from '../../lib/docs'
import { renderDocx } from '../../lib/docx'
import { closePdf, openPdf, renderPage, type PDFDocumentProxy, type PDFPageProxy } from '../../lib/pdf'
import { Notice } from '../ui'
import { watermarkElement } from '../../lib/watermark'
import { Watermark } from './Watermark'

interface ViewProps {
  file: DocFile
  zoom: number
  watermark: string
}

const stop = (e: React.SyntheticEvent) => e.preventDefault()

export default function DocView(props: ViewProps) {
  switch (props.file.entry.kind) {
    case 'pdf':
      return <PdfView {...props} />
    case 'image':
      return <ImageView {...props} />
    case 'text':
      return <TextView {...props} />
    case 'table':
      return <TableView {...props} />
    case 'docx':
      return <DocxView {...props} />
  }
}

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [ref])
  return w
}

function Loading({ label = 'Opening…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-gray-600">
      <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-700" />
      {label}
    </div>
  )
}

// ---- PDF ----

function PdfView({ file, zoom, watermark }: ViewProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const width = useWidth(wrap)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    let opened: PDFDocumentProxy | null = null
    openPdf(file.bytes).then(
      (d) => {
        if (!alive) {
          void closePdf(d)
          return
        }
        opened = d
        setDoc(d)
      },
      () => alive && setError('This PDF couldn’t be opened.'),
    )
    return () => {
      alive = false
      void closePdf(opened)
    }
  }, [file.bytes])

  const pageW = Math.max(160, Math.round((width - 8) * zoom))
  return (
    <div ref={wrap} className="w-full overflow-x-auto">
      {error && <Notice tone="error">{error}</Notice>}
      {!doc && !error && <Loading />}
      {doc && width > 0 && (
        <div className="mx-auto flex flex-col items-center gap-4 py-1" style={{ width: Math.max(pageW, width - 8) }}>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i} doc={doc} number={i + 1} width={pageW} watermark={watermark} />
          ))}
        </div>
      )}
    </div>
  )
}

function PdfPage({ doc, number, width, watermark }: { doc: PDFDocumentProxy; number: number; width: number; watermark: string }) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [visible, setVisible] = useState(number <= 2)

  useEffect(() => {
    let alive = true
    doc.getPage(number).then((p) => alive && setPage(p), () => {})
    return () => {
      alive = false
    }
  }, [doc, number])

  // Only pages near the screen are drawn; far-away pages free their memory.
  useEffect(() => {
    const el = holder.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const c = canvas.current
    if (!c || !page) return
    if (!visible) {
      c.width = c.height = 0
      return
    }
    const v = page.getViewport({ scale: 1 })
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let scale = (width / v.width) * dpr
    const px = v.width * v.height * scale * scale
    const MAX = 16_000_000
    if (px > MAX) scale *= Math.sqrt(MAX / px)
    const task = renderPage(page, c, scale)
    task.promise.catch(() => {})
    return () => task.cancel()
  }, [page, visible, width])

  const aspect = page ? page.getViewport({ scale: 1 }).height / page.getViewport({ scale: 1 }).width : 1.414
  return (
    <div
      ref={holder}
      className="relative shrink-0 bg-white shadow-sm ring-1 ring-black/5"
      style={{ width, height: Math.round(width * aspect) }}
      onContextMenu={stop}
    >
      <canvas ref={canvas} className="block h-full w-full" />
      <Watermark text={watermark} />
    </div>
  )
}

// ---- Image ----

function ImageView({ file, zoom, watermark }: ViewProps) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([file.bytes], { type: file.entry.mime }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div className="w-full overflow-auto">
      <div className="relative mx-auto bg-white shadow-sm ring-1 ring-black/5" style={{ width: `${Math.round(zoom * 100)}%` }}>
        {url ? (
          <img src={url} alt="" draggable={false} onDragStart={stop} onContextMenu={stop} className="block h-auto w-full select-none" />
        ) : (
          <Loading />
        )}
        <Watermark text={watermark} />
      </div>
    </div>
  )
}

// ---- Text ----

function TextView({ file, zoom, watermark }: ViewProps) {
  const text = useMemo(() => decodeText(file.bytes), [file.bytes])
  return (
    <div className="w-full overflow-auto">
      <div className="relative mx-auto max-w-[210mm] bg-white px-5 py-6 shadow-sm ring-1 ring-black/5 sm:px-10 sm:py-10" onContextMenu={stop}>
        <pre
          className="font-sans break-words whitespace-pre-wrap text-gray-900"
          style={{ fontSize: `${Math.round(15 * zoom)}px`, lineHeight: 1.6 }}
        >
          {text}
        </pre>
        <Watermark text={watermark} />
      </div>
    </div>
  )
}

// ---- Spreadsheet ----

function TableView({ file, zoom, watermark }: ViewProps) {
  const data = useMemo(() => decodeTable(file.bytes), [file.bytes])
  const [sheet, setSheet] = useState(0)
  const s = data.sheets[Math.min(sheet, data.sheets.length - 1)]
  return (
    <div className="w-full">
      {data.sheets.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {data.sheets.map((sh, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSheet(i)}
              className={
                'rounded-lg px-3 py-1.5 text-sm ' + (i === sheet ? 'bg-brand-700 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200')
              }
            >
              {sh.name}
            </button>
          ))}
        </div>
      )}
      {s.truncated && (
        <div className="mb-2">
          <Notice tone="warn">This sheet is very large; only the first 5,000 rows and 100 columns are shown.</Notice>
        </div>
      )}
      <div className="relative overflow-auto bg-white shadow-sm ring-1 ring-black/5" onContextMenu={stop}>
        <table className="doc-table" style={{ fontSize: `${Math.round(13 * zoom)}px` }}>
          {s.rows.length > 0 && (
            <thead>
              <tr>
                {s.rows[0].map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {s.rows.slice(1).map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <Watermark text={watermark} />
      </div>
    </div>
  )
}

// ---- Word ----

function DocxView({ file, zoom, watermark }: ViewProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const styles = useRef<HTMLDivElement>(null)
  const width = useWidth(wrap)
  const [natural, setNatural] = useState(0)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const b = body.current
    const st = styles.current
    if (!b || !st) return
    let alive = true
    renderDocx(file.bytes, b, st).then(
      () => {
        if (!alive) return
        const section = b.querySelector('section.docx') as HTMLElement | null
        setNatural(section ? section.offsetWidth + 32 : b.scrollWidth)
        setReady(true)
      },
      () => alive && setError('This Word file couldn’t be opened.'),
    )
    return () => {
      alive = false
      b.replaceChildren()
      st.replaceChildren()
    }
  }, [file.bytes])

  // The watermark goes on each Word page (not on the grey space around them).
  useEffect(() => {
    const b = body.current
    if (!b || !ready || !watermark) return
    const added: HTMLElement[] = []
    b.querySelectorAll<HTMLElement>('section.docx').forEach((section) => {
      section.style.position = 'relative'
      const el = watermarkElement(watermark)
      section.append(el)
      added.push(el)
    })
    return () => added.forEach((el) => el.remove())
  }, [ready, watermark])

  const fit = natural && width ? Math.min(1, width / natural) : 1
  return (
    <div ref={wrap} className="w-full overflow-auto" onContextMenu={stop}>
      <div ref={styles} />
      {error && <Notice tone="error">{error}</Notice>}
      {!ready && !error && <Loading />}
      <div style={{ zoom: fit * zoom }}>
        <div ref={body} className="docx-host" />
      </div>
    </div>
  )
}
