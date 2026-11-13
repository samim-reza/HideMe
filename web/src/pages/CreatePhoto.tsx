import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { PrintSheet, SheetPreview } from '../components/Sheet'
import LinkSettings from '../components/LinkSettings'
import { Button, Card, Choice, LockIcon, Notice, PrinterIcon, RangeField, Toggle } from '../components/ui'
import ShareResult from '../components/ShareResult'
import { createShare } from '../lib/api'
import { encrypt, pack, randomBytes, toBase64Url } from '../lib/crypto'
import { cropToJpeg, dpiFor, loadImage } from '../lib/image'
import {
  computeLayout,
  GAP_MM,
  MARGIN_MM,
  MAX_COPIES,
  PAPERS,
  PHOTO_SIZES,
  type Align,
  type SheetSettings,
} from '../lib/layout'
import type { Created } from '../lib/linkOptions'
import { buildLink, rememberLink, type SharePayload } from '../lib/share'

const MAX_INPUT_BYTES = 40 * 1024 * 1024

type CopiesChoice = number | 'fill' | 'other'
const COPY_OPTIONS: { value: CopiesChoice; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 4, label: '4' },
  { value: 6, label: '6' },
  { value: 8, label: '8' },
  { value: 'fill', label: 'Fill page' },
  { value: 'other', label: 'Other' },
]

export default function CreatePhoto() {
  // Photo
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState('')

  // Size + crop
  const [sizeId, setSizeId] = useState('passport')
  const [customW, setCustomW] = useState(35)
  const [customH, setCustomH] = useState(45)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPx, setAreaPx] = useState<Area | null>(null)
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null)

  // Sheet
  const [copiesChoice, setCopiesChoice] = useState<CopiesChoice>(4)
  const [otherCopies, setOtherCopies] = useState(10)
  const [paperId, setPaperId] = useState('a4')
  const [cutLines, setCutLines] = useState(true)
  const [align, setAlign] = useState<Align>('left')
  const [pos, setPos] = useState({ x: MARGIN_MM, y: MARGIN_MM })
  const [gapX, setGapX] = useState(GAP_MM)
  const [gapY, setGapY] = useState(GAP_MM)
  const [margin, setMargin] = useState(MARGIN_MM)

  // Link
  const [expiresIn, setExpiresIn] = useState(6 * 3600)
  const [maxOpens, setMaxOpens] = useState(0)
  const [allowAdjust, setAllowAdjust] = useState(true)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Created | null>(null)

  const preset = PHOTO_SIZES.find((s) => s.id === sizeId)
  const photoW = preset ? preset.w : clamp(customW, 10, 200)
  const photoH = preset ? preset.h : clamp(customH, 10, 280)
  const sizeLabel = preset ? `${preset.label} ${preset.hint}` : `${photoW} × ${photoH} mm`

  const copies = copiesChoice === 'other' ? clamp(otherCopies, 1, MAX_COPIES) : copiesChoice
  const settings: SheetSettings = {
    photoW,
    photoH,
    copies,
    paperId,
    cutLines,
    gapX,
    gapY,
    margin,
    align,
    ...(align === 'custom' ? pos : {}),
  }
  const layout = useMemo(
    () =>
      computeLayout({
        photoW,
        photoH,
        copies,
        paperId,
        cutLines,
        gapX,
        gapY,
        margin,
        align,
        ...(align === 'custom' ? pos : {}),
      }),
    [photoW, photoH, copies, paperId, cutLines, gapX, gapY, margin, align, pos],
  )

  // ---- choosing a photo ----

  const pickFile = useCallback(async (file: File | undefined) => {
    setLoadError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLoadError('Please choose a photo (JPG, PNG or WEBP).')
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      setLoadError('This photo is larger than 40 MB. Please choose a smaller one.')
      return
    }
    const url = URL.createObjectURL(file)
    try {
      imgRef.current = await loadImage(url)
    } catch (e) {
      URL.revokeObjectURL(url)
      setLoadError((e as Error).message)
      return
    }
    setSrcUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return url
    })
    setFileName(file.name)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCreated(null)
  }, [])

  // ---- cropped preview (debounced) ----

  useEffect(() => {
    const img = imgRef.current
    if (!srcUrl || !img || !areaPx) return
    let cancelled = false
    const t = setTimeout(async () => {
      const blob = await cropToJpeg(img, areaPx, photoW, photoH).catch(() => null)
      if (cancelled || !blob) return
      const url = URL.createObjectURL(blob)
      setCroppedUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return url
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [srcUrl, areaPx, photoW, photoH])

  // Free memory when leaving the page.
  const urls = useRef({ srcUrl, croppedUrl })
  useEffect(() => {
    urls.current = { srcUrl, croppedUrl }
  }, [srcUrl, croppedUrl])
  useEffect(
    () => () => {
      if (urls.current.srcUrl) URL.revokeObjectURL(urls.current.srcUrl)
      if (urls.current.croppedUrl) URL.revokeObjectURL(urls.current.croppedUrl)
    },
    [],
  )

  const dpi = areaPx ? dpiFor(areaPx.width, photoW) : null

  // ---- Hide Me ----

  async function hideMe() {
    const img = imgRef.current
    if (!img || !areaPx) return
    setBusy(true)
    setError('')
    try {
      const jpeg = new Uint8Array(await (await cropToJpeg(img, areaPx, photoW, photoH)).arrayBuffer())
      const payload: SharePayload = {
        v: 1,
        kind: 'photo-sheet',
        mime: 'image/jpeg',
        sheet: settings,
        allowAdjust,
        label: sizeLabel,
      }
      const key = randomBytes(32)
      const plain = pack(payload, jpeg)
      const blob = await encrypt(key, plain)
      plain.fill(0)
      jpeg.fill(0)
      const res = await createShare(blob, expiresIn, maxOpens || null)
      const keyB64 = toBase64Url(key)
      key.fill(0)
      const link = buildLink(res.id, keyB64)
      rememberLink({
        id: res.id,
        key: keyB64,
        deleteToken: res.deleteToken,
        expiresAt: res.expiresAt,
        createdAt: Date.now(),
        label: `${sizeLabel} · ${layout.slots.length} on ${layout.paper.label}`,
      })
      setCreated({ link, id: res.id, deleteToken: res.deleteToken, expiresAt: res.expiresAt })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError((e as Error).message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function startOver() {
    setCreated(null)
    setSrcUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    setCroppedUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    imgRef.current = null
    setAreaPx(null)
    setFileName('')
  }

  // ---- render ----

  if (created) {
    return (
      <ShareResult
        created={created}
        title="Photo for printing"
        message="Please print this sheet at 100% scale. The link expires soon."
        previewTitle="What they will print"
        preview={<SheetPreview layout={layout} imageUrl={croppedUrl} cutLines={cutLines} maxHeightPx={300} />}
        doneLabel="Make a new sheet"
        onDone={startOver}
        onEdit={() => setCreated(null)}
      />
    )
  }

  if (!srcUrl) {
    return <PickPhoto onPick={pickFile} error={loadError} />
  }

  const ready = !!areaPx && layout.slots.length > 0

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-5">
        <Card step={1} title="Photo size and crop">
          <Choice
            label="Photo size"
            value={sizeId}
            onChange={setSizeId}
            options={[
              ...PHOTO_SIZES.map((s) => ({ value: s.id, label: s.label, hint: s.hint })),
              { value: 'custom', label: 'Custom', hint: 'any size' },
            ]}
          />
          {sizeId === 'custom' && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <NumberField label="Width" value={customW} onChange={setCustomW} min={10} max={200} />
              <span className="pt-5 text-gray-400">×</span>
              <NumberField label="Height" value={customH} onChange={setCustomH} min={10} max={280} />
              <span className="pt-5 text-gray-500">mm</span>
            </div>
          )}

          <div className="relative mt-4 h-72 overflow-hidden rounded-xl bg-gray-900 sm:h-80">
            <Cropper
              image={srcUrl}
              crop={crop}
              zoom={zoom}
              aspect={photoW / photoH}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, px) => setAreaPx(px)}
              showGrid
              zoomSpeed={0.15}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm text-gray-600">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-11 flex-1 accent-brand-700"
              aria-label="Zoom"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span className="truncate">Drag the photo to position it. {fileName && <>File: {fileName}</>}</span>
            <label className="cursor-pointer font-semibold text-brand-700 hover:underline">
              Change photo
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
          </div>
          {dpi !== null && dpi < 200 && (
            <div className="mt-3">
              <Notice tone="warn">
                This photo is low resolution for this size ({dpi} dpi). The print may look blurry. Zoom out or use a
                larger photo.
              </Notice>
            </div>
          )}
        </Card>

        <Card step={2} title="Copies and paper">
          <p className="mb-2 text-sm text-gray-600">How many copies?</p>
          <Choice label="Copies" value={copiesChoice} onChange={setCopiesChoice} options={COPY_OPTIONS} />
          {copiesChoice === 'other' && (
            <div className="mt-3 w-32">
              <NumberField label="Copies" value={otherCopies} onChange={setOtherCopies} min={1} max={MAX_COPIES} />
            </div>
          )}
          <p className="mt-4 mb-2 text-sm text-gray-600">Paper</p>
          <Choice
            label="Paper"
            value={paperId}
            onChange={setPaperId}
            options={PAPERS.map((p) => ({ value: p.id, label: p.label }))}
          />
          <p className="mt-4 mb-2 text-sm text-gray-600">Position on the paper</p>
          <Choice
            label="Position"
            value={align}
            onChange={setAlign}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
              ...(align === 'custom' ? [{ value: 'custom' as const, label: 'Custom', hint: 'dragged' }] : []),
            ]}
          />
          <p className="mt-2 text-xs text-gray-500">Or drag the photos on the preview to place them anywhere.</p>

          <p className="mt-4 mb-1 text-sm text-gray-600">Spacing</p>
          <RangeField label="Gap between photos (side by side)" value={gapX} onChange={setGapX} min={0} max={20} step={0.5} unit="mm" />
          <RangeField label="Gap between rows" value={gapY} onChange={setGapY} min={0} max={20} step={0.5} unit="mm" />
          <RangeField label="Distance from paper edge" value={margin} onChange={setMargin} min={0} max={30} step={0.5} unit="mm" />
          {margin < 4 && (
            <div className="mt-1">
              <Notice tone="warn">Many printers can't print closer than about 4 mm to the edge, so photos may be cut off.</Notice>
            </div>
          )}

          <div className="mt-3">
            <Toggle checked={cutLines} onChange={setCutLines} label="Cut lines" hint="Thin grey guides around each photo" />
          </div>
          {layout.capacity === 0 ? (
            <div className="mt-2">
              <Notice tone="error">This photo size is bigger than the paper. Choose a larger paper or a smaller size.</Notice>
            </div>
          ) : (
            layout.dropped > 0 && (
              <div className="mt-2">
                <Notice tone="warn">
                  Only {layout.capacity} fit on {layout.paper.label}. Choose a larger paper for more copies.
                </Notice>
              </div>
            )
          )}
        </Card>

        <LinkSettings
          step={3}
          expiresIn={expiresIn}
          onExpiresIn={setExpiresIn}
          maxOpens={maxOpens}
          onMaxOpens={setMaxOpens}
        >
          <Toggle
            checked={allowAdjust}
            onChange={setAllowAdjust}
            label="Let the shop change copies, paper and position"
            hint="They still can't download or edit the photo"
          />
        </LinkSettings>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card title="Print preview">
          <SheetPreview
            layout={layout}
            imageUrl={croppedUrl}
            cutLines={cutLines}
            maxHeightPx={460}
            onMoveBlock={(x, y) => {
              setAlign('custom')
              setPos({ x, y })
            }}
          />
          <p className="mt-3 text-center text-xs text-gray-500">
            {layout.slots.length} × {sizeLabel} on {layout.paper.label} · drag the photos to move them
          </p>

          {error && (
            <div className="mt-3">
              <Notice tone="error">{error}</Notice>
            </div>
          )}

          <Button onClick={hideMe} disabled={!ready || busy} className="mt-4 w-full py-3.5 text-base">
            <LockIcon />
            {busy ? 'Locking…' : 'Hide Me — create link'}
          </Button>
          <Button variant="secondary" onClick={() => window.print()} disabled={!ready} className="mt-2 w-full">
            <PrinterIcon />
            Print here myself
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            The photo is locked on this device before it leaves. The server only stores scrambled data and deletes it
            when the time is up.
          </p>
        </Card>
      </div>

      {ready && <PrintSheet layout={layout} imageUrl={croppedUrl} cutLines={cutLines} />}
    </div>
  )
}

function PickPhoto({ onPick, error }: { onPick: (f: File | undefined) => void; error: string }) {
  const [over, setOver] = useState(false)
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Print your photo without giving it away</h1>
      <p className="mt-2 text-gray-600">
        Make a print-ready sheet, then send the shop a link. They press Print. They never get the file, and the link
        stops working when you choose.
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
          onPick(e.dataTransfer.files?.[0])
        }}
        className={
          'mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-14 text-center transition ' +
          (over ? 'border-brand-600 bg-brand-50' : 'border-gray-300 hover:border-brand-600')
        }
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7" aria-hidden>
            <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mt-3 text-base font-semibold text-gray-900">Choose a photo</span>
        <span className="mt-1 text-sm text-gray-500">or drag it here · JPG, PNG, WEBP</span>
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
      </label>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <ol className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
        {[
          ['Crop and arrange', 'Pick the size and how many copies fit on the page.'],
          ['Send a link', 'Share it on WhatsApp, email, or show a QR code.'],
          ['It expires', 'After the time you choose, the link shows nothing.'],
        ].map(([t, d], i) => (
          <li key={t} className="rounded-xl bg-white p-4 ring-1 ring-black/5">
            <span className="text-xs font-bold text-brand-700">STEP {i + 1}</span>
            <span className="mt-1 block font-semibold text-gray-900">{t}</span>
            <span className="mt-1 block text-gray-600">{d}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs leading-relaxed text-gray-500">
        Your photo is not uploaded until you press Hide Me, and then only in locked form. Honest limit: while the link
        works, the person viewing it can still take a screenshot. Hide Me stops the file from being kept, not from
        being photographed.
      </p>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="h-11 w-24 rounded-xl border border-gray-300 px-3 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
      />
    </label>
  )
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}
