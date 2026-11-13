// A faint diagonal text repeated across the page, on screen and on paper.
// Drawn as a repeating SVG background so it covers any length of content.

function escapeXml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
}

export function watermarkImage(text: string): string {
  const w = Math.max(260, Math.min(900, Math.round(text.length * 9.5) + 90))
  const h = Math.round(w * 0.55)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" transform="rotate(-28 ${w / 2} ${h / 2})" ` +
    `font-family="Arial, Helvetica, 'Noto Sans', 'Noto Sans Bengali', sans-serif" font-size="17" font-weight="600" ` +
    `fill="#4b5563" fill-opacity="0.26">${escapeXml(text)}</text></svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

/** The same overlay as a plain element, for print pages built outside React. */
export function watermarkElement(text: string, fixed = false): HTMLElement {
  const el = document.createElement('div')
  el.className = 'watermark'
  el.setAttribute('aria-hidden', 'true')
  el.style.position = fixed ? 'fixed' : 'absolute'
  el.style.backgroundImage = watermarkImage(text)
  return el
}
