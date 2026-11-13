export default function Home() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Share it without giving it away</h1>
      <p className="mt-2 max-w-2xl text-gray-600">
        Send a link instead of the file. The other person can view and print, but never download it — and the link
        stops working when you choose.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Choice
          href="#/photo"
          title="Photo prints"
          text="Passport, stamp and visa photos. Many copies on one page, ready for the shop to print."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="12" cy="11" r="3" />
              <path d="M7 20c.8-2.6 2.8-4 5-4s4.2 1.4 5 4" strokeLinecap="round" />
            </svg>
          }
        />
        <Choice
          href="#/docs"
          title="Documents"
          text="PDF, Word, Excel, text, scans or a ZIP. They can view and print — no download."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7" aria-hidden>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
              <path d="M14 3v5h5M9 13h6M9 17h6" strokeLinecap="round" />
            </svg>
          }
        />
      </div>

      <ol className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
        {[
          ['Lock it', 'Your file is locked on your device. Our server only ever sees scrambled data.'],
          ['Send a link', 'WhatsApp, email or a QR code. They open it in any browser — no app, no account.'],
          ['It expires', 'After the time you choose, the link shows nothing and the data is deleted.'],
        ].map(([t, d], i) => (
          <li key={t} className="rounded-xl bg-white p-4 ring-1 ring-black/5">
            <span className="text-xs font-bold text-brand-700">STEP {i + 1}</span>
            <span className="mt-1 block font-semibold text-gray-900">{t}</span>
            <span className="mt-1 block text-gray-600">{d}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs leading-relaxed text-gray-500">
        Honest limit: while a link works, the person viewing it can still take a screenshot or a photo of the screen.
        Hide Me stops your file from being kept and passed around; it can’t stop a camera.
      </p>
    </div>
  )
}

function Choice({ href, title, text, icon }: { href: string; title: string; text: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      className="group flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:shadow-md hover:ring-brand-600"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 group-hover:bg-brand-700 group-hover:text-white">
        {icon}
      </span>
      <span>
        <span className="block text-lg font-semibold text-gray-900">{title}</span>
        <span className="mt-1 block text-sm text-gray-600">{text}</span>
        <span className="mt-2 inline-block text-sm font-semibold text-brand-700">Start →</span>
      </span>
    </a>
  )
}
