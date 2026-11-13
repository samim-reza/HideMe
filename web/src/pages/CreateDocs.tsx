import { useState } from 'react'
import DocsViewer from '../components/docs/DocsViewer'
import LinkSettings from '../components/LinkSettings'
import ShareResult from '../components/ShareResult'
import { Button, Card, LockIcon, Notice, Toggle } from '../components/ui'
import { createShare } from '../lib/api'
import { encrypt, randomBytes, toBase64Url } from '../lib/crypto'
import { MAX_WATERMARK, packDocs, type DocFile } from '../lib/docs'
import { checkDocx } from '../lib/docx'
import { ACCEPT, KIND_LABEL } from '../lib/files'
import { formatBytes, MAX_SHARE_BYTES, type Created } from '../lib/linkOptions'
import { checkPdf } from '../lib/pdf'
import { fromFile, prepareSources, type Skipped } from '../lib/prepare'
import { buildLink, rememberLink } from '../lib/share'

export default function CreateDocs() {
  const [files, setFiles] = useState<DocFile[]>([])
  const [skipped, setSkipped] = useState<Skipped[]>([])
  const [processing, setProcessing] = useState(false)

  const [allowPrint, setAllowPrint] = useState(true)
  const [watermark, setWatermark] = useState('')
  const [expiresIn, setExpiresIn] = useState(6 * 3600)
  const [maxOpens, setMaxOpens] = useState(0)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Created | null>(null)

  const total = files.reduce((n, f) => n + f.bytes.length, 0)
  const tooBig = total > MAX_SHARE_BYTES

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return
    setProcessing(true)
    setError('')
    try {
      const res = await prepareSources([...list].map(fromFile), { pdf: checkPdf, docx: checkDocx })
      setFiles((f) => [...f, ...res.files])
      setSkipped((s) => [...s, ...res.skipped])
    } finally {
      setProcessing(false)
    }
  }

  function remove(i: number) {
    setFiles((f) => f.filter((_, j) => j !== i))
  }

  async function hideMe() {
    if (files.length === 0 || tooBig) return
    setBusy(true)
    setError('')
    try {
      const plain = packDocs({ allowPrint, watermark }, files)
      const key = randomBytes(32)
      const blob = await encrypt(key, plain)
      plain.fill(0)
      const res = await createShare(blob, expiresIn, maxOpens || null)
      const keyB64 = toBase64Url(key)
      key.fill(0)
      const first = files[0].entry.name.split(' › ').pop()
      rememberLink({
        id: res.id,
        key: keyB64,
        deleteToken: res.deleteToken,
        expiresAt: res.expiresAt,
        createdAt: Date.now(),
        label: files.length === 1 ? `${first}` : `${first} + ${files.length - 1} more`,
      })
      setCreated({ link: buildLink(res.id, keyB64), id: res.id, deleteToken: res.deleteToken, expiresAt: res.expiresAt })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError((e as Error).message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function startOver() {
    setCreated(null)
    setFiles([])
    setSkipped([])
    setWatermark('')
  }

  if (created) {
    return (
      <ShareResult
        created={created}
        title="Shared document"
        message={
          allowPrint
            ? 'Here is the document. You can view and print it until the link expires.'
            : 'Here is the document. You can view it until the link expires.'
        }
        previewTitle="What they can open"
        preview={<FileList files={files} />}
        doneLabel="Share something else"
        onDone={startOver}
        onEdit={() => setCreated(null)}
      />
    )
  }

  if (files.length === 0) {
    return <PickFiles onPick={add} processing={processing} skipped={skipped} onClearSkipped={() => setSkipped([])} />
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card step={1} title="Files">
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <KindBadge kind={f.entry.kind} />
                <span className="min-w-0 flex-1 truncate" title={f.entry.name}>
                  {f.entry.name}
                </span>
                <span className="shrink-0 text-xs text-gray-500">
                  {f.entry.pages ? `${f.entry.pages} p · ` : ''}
                  {formatBytes(f.bytes.length)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                  aria-label={`Remove ${f.entry.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-50">
            {processing ? 'Opening…' : '+ Add more files'}
            <input type="file" multiple accept={ACCEPT} className="sr-only" disabled={processing} onChange={(e) => void add(e.target.files).then(() => (e.target.value = ''))} />
          </label>
          <SkippedList skipped={skipped} onClear={() => setSkipped([])} />
          <p className={'mt-3 text-xs ' + (tooBig ? 'font-semibold text-red-700' : 'text-gray-500')}>
            Total {formatBytes(total)} of {formatBytes(MAX_SHARE_BYTES)}
            {tooBig && ' — too big for one link. Remove some files.'}
          </p>
        </Card>

        <Card step={2} title="What can they do?">
          <Toggle
            checked={allowPrint}
            onChange={setAllowPrint}
            label="Allow printing"
            hint={allowPrint ? 'They can view and print. No download.' : 'View only. No printing, no download.'}
          />
          <label className="mt-3 block">
            <span className="text-sm font-medium text-gray-900">Watermark (optional)</span>
            <span className="block text-xs text-gray-500">Shown across every page, on screen and on paper.</span>
            <input
              type="text"
              value={watermark}
              maxLength={MAX_WATERMARK}
              onChange={(e) => setWatermark(e.target.value)}
              placeholder="e.g. For ABC Bank account opening only"
              className="mt-2 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
          </label>
        </Card>

        <LinkSettings step={3} expiresIn={expiresIn} onExpiresIn={setExpiresIn} maxOpens={maxOpens} onMaxOpens={setMaxOpens} />

        <Card>
          {error && (
            <div className="mb-3">
              <Notice tone="error">{error}</Notice>
            </div>
          )}
          <Button onClick={hideMe} disabled={busy || processing || tooBig} className="w-full py-3.5 text-base">
            <LockIcon />
            {busy ? 'Locking…' : 'Hide Me — create link'}
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Files are locked on this device before they leave. The other person can only view{allowPrint ? ' and print' : ''}{' '}
            them in the browser — there is no download button — until the link expires.
          </p>
        </Card>
      </div>

      <div className="min-w-0">
        <p className="mb-2 px-1 text-sm font-semibold text-gray-700">Preview — exactly what they will see</p>
        <DocsViewer files={files} watermark={watermark.trim()} allowPrint={allowPrint} guard={false} />
      </div>
    </div>
  )
}

function KindBadge({ kind }: { kind: DocFile['entry']['kind'] }) {
  return (
    <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-800">
      {KIND_LABEL[kind]}
    </span>
  )
}

function FileList({ files }: { files: DocFile[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {files.map((f, i) => (
        <li key={i} className="flex items-center gap-2">
          <KindBadge kind={f.entry.kind} />
          <span className="truncate">{f.entry.name}</span>
        </li>
      ))}
    </ul>
  )
}

function SkippedList({ skipped, onClear }: { skipped: Skipped[]; onClear: () => void }) {
  if (skipped.length === 0) return null
  return (
    <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold">
          {skipped.length === 1 ? '1 file was not added' : `${skipped.length} files were not added`}
        </span>
        <button type="button" onClick={onClear} className="text-xs font-semibold underline">
          Hide
        </button>
      </div>
      <ul className="space-y-1.5">
        {skipped.map((s, i) => (
          <li key={i}>
            <span className="font-medium break-all">{s.name}</span>
            <span className="block text-xs text-amber-800">{s.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PickFiles({
  onPick,
  processing,
  skipped,
  onClearSkipped,
}: {
  onPick: (f: FileList | null) => void
  processing: boolean
  skipped: Skipped[]
  onClearSkipped: () => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Share documents they can’t keep</h1>
      <p className="mt-2 text-gray-600">
        Send a link instead of the file. They open it in the browser and can view and print it, but there is no
        download — and the link stops working when you choose.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          onPick(e.dataTransfer.files)
        }}
        className={
          'mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-14 text-center transition ' +
          (over ? 'border-brand-600 bg-brand-50' : 'border-gray-300 hover:border-brand-600')
        }
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7" aria-hidden>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
            <path d="M14 3v5h5M12 18v-6m0 0-2.5 2.5M12 12l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="mt-3 text-base font-semibold text-gray-900">{processing ? 'Opening files…' : 'Choose files'}</span>
        <span className="mt-1 text-sm text-gray-500">or drag them here · you can pick several</span>
        <input type="file" multiple accept={ACCEPT} className="sr-only" disabled={processing} onChange={(e) => onPick(e.target.files)} />
      </label>

      <SkippedList skipped={skipped} onClear={onClearSkipped} />

      <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
          <span className="font-semibold text-gray-900">Works with</span>
          <span className="mt-1 block text-gray-600">
            PDF, Word (.docx), Excel and CSV, text files, photos and scans (JPG, PNG, WEBP), and ZIP files of these.
          </span>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
          <span className="font-semibold text-gray-900">Other files</span>
          <span className="mt-1 block text-gray-600">
            Old .doc, PowerPoint and other formats can’t be shown in a browser. Use “Save as PDF” first.
          </span>
        </div>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-gray-500">
        Files are not uploaded until you press Hide Me, and then only in locked form. Max {formatBytes(MAX_SHARE_BYTES)}{' '}
        per link. Honest limit: while the link works, the person viewing can still take a screenshot or photo of the
        screen.
      </p>
    </div>
  )
}
