import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { revokeShare } from '../lib/api'
import type { SheetLayout } from '../lib/layout'
import { forgetLink, formatRemaining } from '../lib/share'
import { useNow } from '../lib/useNow'
import type { Created } from '../pages/Create'
import { SheetPreview } from './Sheet'
import { Button, Card, Notice } from './ui'

export default function ShareResult({
  created,
  layout,
  imageUrl,
  cutLines,
  onDone,
  onEdit,
}: {
  created: Created
  layout: SheetLayout
  imageUrl: string | null
  cutLines: boolean
  onDone: () => void
  onEdit: () => void
}) {
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const [revokeError, setRevokeError] = useState('')
  const now = useNow()

  useEffect(() => {
    QRCode.toDataURL(created.link, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''))
  }, [created.link])

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.link)
    } catch {
      // Older browsers: select the text so the user can copy it.
      const el = document.getElementById('share-link') as HTMLInputElement | null
      el?.select()
      document.execCommand?.('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function share() {
    try {
      await navigator.share({
        title: 'Photo for printing',
        text: 'Please print this sheet at 100% scale. The link expires soon.',
        url: created.link,
      })
    } catch {
      // User closed the share sheet.
    }
  }

  async function revoke() {
    if (!confirm('Stop this link now? Nobody will be able to open it again.')) return
    setRevokeError('')
    try {
      await revokeShare(created.id, created.deleteToken)
      forgetLink(created.id)
      setRevoked(true)
    } catch (e) {
      setRevokeError((e as Error).message)
    }
  }

  const expiresText = new Date(created.expiresAt).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  })
  const canShare = typeof navigator.share === 'function'

  if (revoked) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <h1 className="text-xl font-bold">Link stopped</h1>
          <p className="mt-2 text-gray-600">Nobody can open it any more. The locked data has been deleted from the server.</p>
          <Button onClick={onDone} className="mt-5 w-full">
            Make a new sheet
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
      <Card>
        <div className="flex items-center gap-2 text-brand-700">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 className="text-xl font-bold text-gray-900">Your link is ready</h1>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Send it to the print shop. It works until <strong>{expiresText}</strong> (
          {formatRemaining(created.expiresAt - now)} left).
        </p>

        <div className="mt-4 flex gap-2">
          <input
            id="share-link"
            readOnly
            value={created.link}
            onFocus={(e) => e.target.select()}
            className="h-11 min-w-0 flex-1 rounded-xl border border-gray-300 bg-gray-50 px-3 font-mono text-xs text-gray-700"
          />
          <Button onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {canShare && (
            <Button variant="secondary" onClick={share}>
              Share (WhatsApp, email…)
            </Button>
          )}
          <a
            href={`https://wa.me/?text=${encodeURIComponent('Please print this sheet at 100% scale: ' + created.link)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50"
          >
            Send on WhatsApp
          </a>
        </div>

        <div className="mt-5">
          <Notice>
            Anyone with this link can open it until it expires, so send it only to the shop. The link contains the key
            that unlocks your photo; our server never sees it.
          </Notice>
        </div>

        {revokeError && (
          <div className="mt-3">
            <Notice tone="error">{revokeError}</Notice>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          <Button variant="danger" onClick={revoke}>
            Stop link now
          </Button>
          <Button variant="ghost" onClick={onEdit}>
            Change and make another link
          </Button>
          <Button variant="ghost" onClick={onDone}>
            New photo
          </Button>
        </div>
      </Card>

      <div className="space-y-5">
        {qr && (
          <Card title="Or let them scan">
            <img src={qr} alt="QR code of the link" className="mx-auto w-48 rounded-lg" />
            <p className="mt-2 text-center text-xs text-gray-500">Show this on your phone at the shop counter.</p>
          </Card>
        )}
        <Card title="What they will print">
          <SheetPreview layout={layout} imageUrl={imageUrl} cutLines={cutLines} maxHeightPx={300} />
        </Card>
      </div>
    </div>
  )
}
