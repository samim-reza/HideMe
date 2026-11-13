import { watermarkImage } from '../../lib/watermark'

/** Absolute overlay over its (relative) parent; `fixed` repeats on every printed page. */
export function Watermark({ text, fixed = false }: { text: string; fixed?: boolean }) {
  if (!text) return null
  return (
    <div
      aria-hidden
      className="watermark"
      style={{ position: fixed ? 'fixed' : 'absolute', backgroundImage: watermarkImage(text) }}
    />
  )
}
