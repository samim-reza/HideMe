import { useEffect, useMemo, useState } from 'react'
import DocsViewer from '../components/docs/DocsViewer'
import { PrintSheet, SheetPreview } from '../components/Sheet'
import SheetControls from '../components/SheetControls'
import { Button, Card, Choice, LockIcon, Notice, PrinterIcon } from '../components/ui'
import { fetchShare, getStatus, GoneError } from '../lib/api'
import { decrypt, fromBase64Url, unpack } from '../lib/crypto'
import { splitDocs, type DocsPayload } from '../lib/docs'
import { computeLayout, GAP_MM, MARGIN_MM, MAX_COPIES, PAPERS, type Align, type SheetSettings } from '../lib/layout'
import { formatRemaining, type SharePayload } from '../lib/share'
import { useNow } from '../lib/useNow'

type Payload = SharePayload | DocsPayload

interface Loaded {
  payload: Payload
  body: Uint8Array<ArrayBuffer>
  expiresAt: number
  /** serverTime - localTime, so the countdown uses the server's clock. */
  clockOffset: number
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'gone'; reason: 'gone' | 'used_up' | 'expired' }
  | ({ kind: 'ready' } & Loaded)

// React's development mode runs effects twice; share one download so a page
// load counts as only one "open" on the server.
const inflight = new Map<string, Promise<Loaded>>()

function load(id: string, keyB64: string): Promise<Loaded> {
  let p = inflight.get(id)
  if (!p) {
    p = (async () => {
      const { data, status } = await fetchShare(id)
      let plain: Uint8Array<ArrayBuffer>
      try {
        plain = await decrypt(fromBase64Url(keyB64), data)
      } catch {
        throw new Error('This link is damaged or incomplete. Ask the sender to copy it again.')
      }
      const { header, file } = unpack<Payload>(plain)
      plain.fill(0)
      if (header.v !== 1 || (header.kind !== 'photo-sheet' && header.kind !== 'docs')) {
        throw new Error('This link was made by a newer version of Hide Me. Try reloading the page.')
      }
      if (header.kind === 'docs') splitDocs(header, file) // validates the bundle
      return { payload: header, body: file, expiresAt: status.expiresAt, clockOffset: status.now - Date.now() }
    })()
    inflight.set(id, p)
    p.finally(() => setTimeout(() => inflight.delete(id), 2000)).catch(() => {})
  }
  return p
}

export default function Open({ id, keyB64 }: { id: string; keyB64: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const now = useNow()

  // Download and unlock.
  useEffect(() => {
    let cancelled = false
    load(id, keyB64).then(
      (loaded) => {
        if (!cancelled) setState({ kind: 'ready', ...loaded })
      },
      (e: unknown) => {
        if (cancelled) return
        if (e instanceof GoneError) setState({ kind: 'gone', reason: e.reason })
        else setState({ kind: 'error', message: (e as Error).message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, keyB64])

  // Wipe when the time is up (using the server's clock).
  const serverNow = state.kind === 'ready' ? now + state.clockOffset : now
  const remaining = state.kind === 'ready' ? state.expiresAt - serverNow : 0
  useEffect(() => {
    if (state.kind === 'ready' && remaining <= 0) {
      state.body.fill(0)
      setState({ kind: 'gone', reason: 'expired' })
    }
  }, [state, remaining])

  // Ask the server every 30 s whether the owner stopped the link.
  const ready = state.kind === 'ready'
  useEffect(() => {
    if (!ready) return
    let stopped = false
    async function check() {
      try {
        await getStatus(id)
      } catch (e) {
        if (!stopped && e instanceof GoneError && e.reason === 'gone') {
          setState((s) => {
            if (s.kind === 'ready') s.body.fill(0)
            return { kind: 'gone', reason: 'gone' }
          })
        }
        // Network problems are ignored; the countdown still ends access on time.
      }
    }
    const t = setInterval(check, 30_000)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready, id])

  if (state.kind === 'loading') {
    return (
      <div className="mx-auto max-w-md py-16 text-center text-gray-600">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-700" />
        <p className="mt-4">Unlocking…</p>
      </div>
    )
  }

  if (state.kind === 'gone') {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-gray-600">
          <LockIcon className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">
          {state.reason === 'used_up' ? 'This link has been used up' : 'This link has expired'}
        </h1>
        <p className="mt-2 text-gray-600">
          {state.reason === 'used_up'
            ? 'It has already been opened the maximum number of times.'
            : 'What was shared is no longer available.'}{' '}
          If you still need it, ask the person who sent it for a new link.
        </p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="mx-auto max-w-md py-10">
        <Notice tone="error">{state.message}</Notice>
        <Button variant="secondary" className="mt-4 w-full" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    )
  }

  if (state.payload.kind === 'docs') {
    return <ReadyDocs payload={state.payload} body={state.body} remaining={remaining} />
  }
  return <ReadySheet payload={state.payload} body={state.body} remaining={remaining} />
}

function TimeLeft({ remaining }: { remaining: number }) {
  const soon = remaining < 5 * 60_000
  return (
    <span
      className={
        'shrink-0 rounded-full px-3 py-1 text-xs font-semibold tabular-nums ' +
        (soon ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-700')
      }
      title="Time left before this link stops working"
    >
      {formatRemaining(remaining)} left
    </span>
  )
}

// ---- Documents ----

function ReadyDocs({ payload, body, remaining }: { payload: DocsPayload; body: Uint8Array<ArrayBuffer>; remaining: number }) {
  const files = useMemo(() => splitDocs(payload, body), [payload, body])
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Shared with you</h1>
            <p className="text-sm text-gray-600">
              {files.length === 1 ? files[0].entry.name.split(' › ').pop() : `${files.length} files`} · you can view
              {payload.allowPrint ? ' and print' : ''} {files.length === 1 ? 'it' : 'them'} here. Downloading is not
              possible.
            </p>
          </div>
          <TimeLeft remaining={remaining} />
        </div>
      </Card>
      <DocsViewer files={files} watermark={payload.watermark} allowPrint={payload.allowPrint} guard />
      <p className="px-1 text-xs leading-relaxed text-gray-500">
        Shared privately with Hide Me. Nothing is saved on this computer, and this page clears itself when the link
        expires.
      </p>
    </div>
  )
}

// ---- Photo sheet ----

interface SheetEdits {
  copies: number | 'fill'
  paperId: string
  align: Align
  x?: number
  y?: number
  gapX: number
  gapY: number
  margin: number
  cutLines: boolean
}

/** The layout exactly as the owner sent it, with defaults for links made before these options existed. */
function asSent(s: SheetSettings): SheetEdits {
  return {
    copies: s.copies,
    paperId: s.paperId,
    align: s.align ?? 'center',
    x: s.x,
    y: s.y,
    gapX: s.gapX ?? GAP_MM,
    gapY: s.gapY ?? GAP_MM,
    margin: s.margin ?? MARGIN_MM,
    cutLines: s.cutLines,
  }
}

function ReadySheet({ payload, body, remaining }: { payload: SharePayload; body: Uint8Array<ArrayBuffer>; remaining: number }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([body], { type: payload.mime }))
    setImageUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setImageUrl(null)
    }
  }, [body, payload.mime])

  const sent = useMemo(() => asSent(payload.sheet), [payload.sheet])
  const [edits, setEdits] = useState<SheetEdits>(sent)
  const set = (patch: Partial<SheetEdits>) => setEdits((e) => ({ ...e, ...patch }))
  const canEdit = payload.allowAdjust
  const sheet: SheetSettings = canEdit ? { ...payload.sheet, ...edits } : payload.sheet
  const layout = computeLayout(sheet) // cheap; recomputed on every render
  const changed = canEdit && JSON.stringify(edits) !== JSON.stringify(sent)
  const atSentPosition = sent.align === 'custom' && edits.x === sent.x && edits.y === sent.y

  const copyOptions = useMemo(() => {
    const base: number[] = [1, 2, 4, 6, 8]
    if (typeof payload.sheet.copies === 'number' && !base.includes(payload.sheet.copies)) base.push(payload.sheet.copies)
    return [
      ...base
        .filter((n) => n <= MAX_COPIES)
        .sort((a, b) => a - b)
        .map((n) => ({ value: n as number | 'fill', label: String(n) })),
      { value: 'fill' as const, label: 'Fill page' },
    ]
  }, [payload.sheet.copies])

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Top on phones; top right on computers. */}
      <div className="lg:col-start-2 lg:row-start-1">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Ready to print</h1>
              <p className="text-sm text-gray-600">
                {layout.slots.length} × {payload.label} on {layout.paper.label}
              </p>
            </div>
            <TimeLeft remaining={remaining} />
          </div>

          <Button onClick={() => window.print()} disabled={!imageUrl || layout.slots.length === 0} className="mt-4 w-full py-4 text-base">
            <PrinterIcon />
            Print
          </Button>

          <ol className="mt-4 space-y-2 text-sm text-gray-700">
            <li className="flex gap-2">
              <Num n={1} /> Paper size: <strong>{layout.paper.label}</strong>
            </li>
            <li className="flex gap-2">
              <Num n={2} />
              <span>
                Scale: <strong>100%</strong> / <strong>Actual size</strong>. Not "Fit to page", or the photo size will be
                wrong.
              </span>
            </li>
            <li className="flex gap-2">
              <Num n={3} /> Margins: <strong>None</strong> (or Default)
            </li>
          </ol>
          {canEdit && (
            <p className="mt-3 text-xs text-gray-500">
              {changed
                ? 'You changed the layout. The print uses your changes; the photo itself stays the same.'
                : 'You can change the layout below before printing.'}
            </p>
          )}
        </Card>
      </div>

      {/* Between the two cards on phones; the whole left column on computers. */}
      <div className="lg:col-start-1 lg:row-span-3 lg:row-start-1">
        <div className="lg:sticky lg:top-20">
          <Card>
            <SheetPreview
              layout={layout}
              imageUrl={imageUrl}
              cutLines={sheet.cutLines}
              maxHeightPx={720}
              onMoveBlock={canEdit ? (x, y) => set({ align: 'custom', x, y }) : undefined}
            />
            {canEdit && <p className="mt-3 text-center text-xs text-gray-500">Drag the photos to move them.</p>}
          </Card>
        </div>
      </div>

      {canEdit && (
        <div className="lg:col-start-2 lg:row-start-2">
          <Card title="Change the layout">
            <p className="mb-2 text-sm text-gray-600">Copies</p>
            <Choice label="Copies" value={edits.copies} onChange={(copies) => set({ copies })} options={copyOptions} />
            <p className="mt-4 mb-2 text-sm text-gray-600">Paper</p>
            <Choice
              label="Paper"
              value={edits.paperId}
              onChange={(paperId) => set({ paperId })}
              options={PAPERS.map((p) => ({ value: p.id, label: p.label }))}
            />
            <SheetControls
              align={edits.align}
              onAlign={(align) => set({ align })}
              customHint={atSentPosition ? 'as sent' : 'dragged'}
              gapX={edits.gapX}
              onGapX={(gapX) => set({ gapX })}
              gapY={edits.gapY}
              onGapY={(gapY) => set({ gapY })}
              margin={edits.margin}
              onMargin={(margin) => set({ margin })}
              cutLines={edits.cutLines}
              onCutLines={(cutLines) => set({ cutLines })}
            />
            {layout.capacity === 0 ? (
              <div className="mt-2">
                <Notice tone="error">The photos don't fit on this paper with these settings. Choose a larger paper or smaller gaps.</Notice>
              </div>
            ) : (
              layout.dropped > 0 && <p className="mt-2 text-xs text-amber-800">Only {layout.capacity} fit on this paper.</p>
            )}
            {changed && (
              <Button variant="secondary" className="mt-4 w-full" onClick={() => setEdits(sent)}>
                Reset to how it was sent
              </Button>
            )}
          </Card>
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-gray-500 lg:col-start-2">
        This photo was shared privately with Hide Me. It is not saved on this computer, and this page clears itself
        when the link expires. Please don't save or copy it.
      </p>

      {imageUrl && layout.slots.length > 0 && <PrintSheet layout={layout} imageUrl={imageUrl} cutLines={sheet.cutLines} />}
    </div>
  )
}

function Num({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
      {n}
    </span>
  )
}
