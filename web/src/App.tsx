import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LockIcon } from './components/ui'
import { parseShareHash } from './lib/share'
import CreateDocs from './pages/CreateDocs'
import CreatePhoto from './pages/CreatePhoto'
import Home from './pages/Home'
import MyLinks from './pages/MyLinks'
import Open from './pages/Open'

type Page = 'open' | 'links' | 'photo' | 'docs' | 'home'

function pageFor(hash: string, isShare: boolean): Page {
  if (isShare) return 'open'
  if (hash === '#/links') return 'links'
  if (hash === '#/photo') return 'photo'
  if (hash === '#/docs') return 'docs'
  return 'home'
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  const share = parseShareHash(hash)
  const page = pageFor(hash, !!share)
  const newActive = page === 'home' || page === 'photo' || page === 'docs'
  const wide = page === 'docs' || page === 'open'

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [page])

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className={'mx-auto flex h-14 items-center justify-between px-4 ' + (wide ? 'max-w-6xl' : 'max-w-5xl')}>
          <a href="#/" className="flex items-center gap-2 font-bold text-gray-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white">
              <LockIcon className="h-4.5 w-4.5" />
            </span>
            Hide Me
          </a>
          {!share && (
            <nav className="flex gap-1 text-sm">
              <a
                href="#/"
                className={'rounded-lg px-3 py-2 ' + (newActive ? 'bg-gray-100 font-semibold' : 'text-gray-600 hover:bg-gray-50')}
              >
                New
              </a>
              <a
                href="#/links"
                className={'rounded-lg px-3 py-2 ' + (page === 'links' ? 'bg-gray-100 font-semibold' : 'text-gray-600 hover:bg-gray-50')}
              >
                My links
              </a>
            </nav>
          )}
        </div>
      </header>

      <main className={'mx-auto px-4 pt-5 pb-16 ' + (wide ? 'max-w-6xl' : 'max-w-5xl')}>
        {share ? (
          <Open key={share.id} id={share.id} keyB64={share.key} />
        ) : page === 'links' ? (
          <MyLinks />
        ) : page === 'photo' ? (
          <CreatePhoto />
        ) : page === 'docs' ? (
          <CreateDocs />
        ) : (
          <Home />
        )}
      </main>
      {createPortal(<div className="print-fallback">To print, use the Print button on the page.</div>, document.body)}
    </div>
  )
}
