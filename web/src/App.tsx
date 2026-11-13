import { useEffect, useState } from 'react'
import { LockIcon } from './components/ui'
import { parseShareHash } from './lib/share'
import Create from './pages/Create'
import MyLinks from './pages/MyLinks'
import Open from './pages/Open'

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
  const page = share ? 'open' : hash === '#/links' ? 'links' : 'create'

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
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
                className={'rounded-lg px-3 py-2 ' + (page === 'create' ? 'bg-gray-100 font-semibold' : 'text-gray-600 hover:bg-gray-50')}
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

      <main className="mx-auto max-w-5xl px-4 pt-5 pb-16">
        {share ? <Open key={share.id} id={share.id} keyB64={share.key} /> : page === 'links' ? <MyLinks /> : <Create />}
      </main>
    </div>
  )
}
