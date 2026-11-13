import { useEffect, useState } from 'react'
import { useNow } from '../lib/useNow'
import { Button, Card, Notice } from '../components/ui'
import { getStatus, GoneError, revokeShare, type ShareStatus } from '../lib/api'
import { buildLink, forgetLink, formatRemaining, loadLinks, type SavedLink } from '../lib/share'

type LinkState = { kind: 'checking' } | { kind: 'live'; status: ShareStatus } | { kind: 'gone' } | { kind: 'unknown' }

export default function MyLinks() {
  const [links, setLinks] = useState<SavedLink[]>(() => loadLinks())
  const [states, setStates] = useState<Record<string, LinkState>>({})
  const [error, setError] = useState('')
  const now = useNow()

  useEffect(() => {
    for (const l of links) {
      if (l.expiresAt <= Date.now()) {
        setStates((s) => ({ ...s, [l.id]: { kind: 'gone' } }))
        continue
      }
      setStates((s) => ({ ...s, [l.id]: { kind: 'checking' } }))
      getStatus(l.id).then(
        (status) => setStates((s) => ({ ...s, [l.id]: { kind: 'live', status } })),
        (e) => setStates((s) => ({ ...s, [l.id]: e instanceof GoneError ? { kind: 'gone' } : { kind: 'unknown' } })),
      )
    }
    // Only on first load; status is refreshed by reopening the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function stop(l: SavedLink) {
    if (!confirm('Stop this link now? Nobody will be able to open it again.')) return
    setError('')
    try {
      await revokeShare(l.id, l.deleteToken)
      setStates((s) => ({ ...s, [l.id]: { kind: 'gone' } }))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function remove(l: SavedLink) {
    forgetLink(l.id)
    setLinks(loadLinks())
  }

  function clearEnded() {
    for (const l of links) if (states[l.id]?.kind === 'gone') forgetLink(l.id)
    setLinks(loadLinks())
  }

  const anyEnded = links.some((l) => states[l.id]?.kind === 'gone')

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My links</h1>
          <p className="text-sm text-gray-600">Links you made on this device. No photos are kept here.</p>
        </div>
        {anyEnded && (
          <Button variant="ghost" onClick={clearEnded}>
            Clear ended
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {links.length === 0 ? (
        <Card>
          <p className="text-gray-600">No links yet.</p>
          <a href="#/" className="mt-3 inline-block font-semibold text-brand-700 hover:underline">
            Make your first sheet →
          </a>
        </Card>
      ) : (
        <ul className="space-y-3">
          {links.map((l) => {
            const st = states[l.id] ?? { kind: 'checking' }
            const ended = st.kind === 'gone' || l.expiresAt <= now
            return (
              <li key={l.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{l.label}</p>
                      <p className="text-xs text-gray-500">Made {new Date(l.createdAt).toLocaleString()}</p>
                    </div>
                    <StatusPill state={st} ended={ended} remaining={l.expiresAt - now} />
                  </div>
                  {st.kind === 'live' && !ended && (
                    <p className="mt-2 text-sm text-gray-600">
                      Opened {st.status.opens} {st.status.opens === 1 ? 'time' : 'times'}
                      {st.status.maxOpens ? ` of ${st.status.maxOpens}` : ''}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!ended && (
                      <>
                        <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(buildLink(l.id, l.key))}>
                          Copy link
                        </Button>
                        <Button variant="danger" onClick={() => stop(l)}>
                          Stop link now
                        </Button>
                      </>
                    )}
                    {ended && (
                      <Button variant="ghost" onClick={() => remove(l)}>
                        Remove from list
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StatusPill({ state, ended, remaining }: { state: LinkState; ended: boolean; remaining: number }) {
  if (ended) return <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">Ended</span>
  if (state.kind === 'checking') return <span className="text-xs text-gray-400">Checking…</span>
  if (state.kind === 'unknown')
    return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Offline?</span>
  return (
    <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 tabular-nums">
      Active · {formatRemaining(remaining)} left
    </span>
  )
}
