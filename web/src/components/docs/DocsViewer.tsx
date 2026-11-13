import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { DocFile } from '../../lib/docs'
import { KIND_LABEL } from '../../lib/files'
import { clearPrintJob, printDoc } from '../../lib/printDocs'
import { Button, Notice, PrinterIcon } from '../ui'
import DocView from './DocView'

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3]

/**
 * Shows shared files with a toolbar (file tabs, zoom, full screen, Print).
 * With `guard`, the usual "save" and "copy" shortcuts are blocked, as on the
 * page the other person sees. There is no download button anywhere.
 */
export default function DocsViewer({
  files,
  watermark,
  allowPrint,
  guard,
  extra,
}: {
  files: DocFile[]
  watermark: string
  allowPrint: boolean
  guard: boolean
  extra?: ReactNode
}) {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState('')
  const viewer = useRef<HTMLDivElement>(null)
  const file = files[Math.min(index, files.length - 1)]

  // A prepared print job belongs to one file; drop it when the file changes or the viewer closes.
  useEffect(() => () => clearPrintJob(), [file])

  const busy = progress !== null
  const print = async () => {
    if (busy || !file) return
    setMessage('')
    setProgress({ done: 0, total: 0 })
    try {
      await printDoc(file, { watermark, onProgress: (done, total) => setProgress({ done, total }) })
    } catch {
      setMessage('This file couldn’t be prepared for printing.')
    } finally {
      setProgress(null)
    }
  }
  const printRef = useRef(print)
  useEffect(() => {
    printRef.current = print
  })

  const flash = (m: string) => {
    setMessage(m)
    window.setTimeout(() => setMessage((cur) => (cur === m ? '' : cur)), 3500)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'p') {
        e.preventDefault()
        if (allowPrint) void printRef.current()
        else flash('Printing is turned off for this document.')
      } else if (guard && k === 's') {
        e.preventDefault()
        flash('This document can’t be saved or downloaded.')
      }
    }
    const onCopy = (e: ClipboardEvent) => {
      if (guard) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('copy', onCopy)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('copy', onCopy)
    }
  }, [allowPrint, guard])

  const zi = ZOOMS.indexOf(zoom)
  const fullscreen = () => {
    const el = viewer.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => {})
  }

  if (!file) return null

  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 p-2 shadow-sm ring-1 ring-black/5 backdrop-blur">
        {files.length > 1 && (
          <div className="flex max-w-full min-w-0 flex-1 basis-full gap-1.5 overflow-x-auto pb-0.5 sm:basis-auto">
            {files.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                title={f.entry.name}
                className={
                  'flex max-w-[220px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition ' +
                  (i === index ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200')
                }
              >
                <span className={'shrink-0 font-semibold ' + (i === index ? 'text-brand-100' : 'text-gray-500')}>
                  {KIND_LABEL[f.entry.kind]}
                </span>
                <span className="truncate">{f.entry.name.split(' › ').pop()}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <IconButton label="Zoom out" disabled={zi <= 0} onClick={() => setZoom(ZOOMS[Math.max(0, zi - 1)])}>
            −
          </IconButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="min-h-9 min-w-14 rounded-lg px-2 text-xs font-semibold text-gray-700 tabular-nums hover:bg-gray-100"
            title="Fit to width"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label="Zoom in" disabled={zi >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])}>
            +
          </IconButton>
          <IconButton label="Full screen" onClick={fullscreen}>
            ⤢
          </IconButton>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {extra}
          {allowPrint ? (
            <Button onClick={() => void print()} disabled={busy} className="min-h-10 px-4">
              <PrinterIcon />
              {busy ? (progress.total ? `Preparing ${progress.done}/${progress.total}` : 'Preparing…') : 'Print'}
            </Button>
          ) : (
            <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">View only · printing off</span>
          )}
        </div>
      </div>

      {message && <Notice tone="warn">{message}</Notice>}

      <div ref={viewer} className={'docview rounded-2xl bg-gray-100 p-2 sm:p-4' + (guard ? ' guarded' : '')}>
        <DocView key={index} file={file} zoom={zoom} watermark={watermark} />
      </div>

      {!allowPrint &&
        createPortal(
          <div className="print-portal print-blocked">Printing is turned off for this document.</div>,
          document.body,
        )}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-gray-700 hover:bg-gray-100 disabled:opacity-30"
    >
      {children}
    </button>
  )
}
