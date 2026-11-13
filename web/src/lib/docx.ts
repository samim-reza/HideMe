// Word (.docx) rendering with docx-preview, loaded only when needed.

import { Skip } from './prepare'

const OPTIONS = {
  className: 'docx',
  inWrapper: true,
  hideWrapperOnPrint: false,
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  breakPages: true,
  // Use the page breaks Word recorded, so pages split where they did in Word.
  ignoreLastRenderedPageBreak: false,
  experimental: false,
  trimXmlDeclaration: true,
  useBase64URL: false,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  // Never show comments or tracked changes: they can hold private notes.
  renderComments: false,
  renderChanges: false,
  // Embedded HTML chunks are not shown.
  renderAltChunks: false,
  debug: false,
}

export async function renderDocx(
  bytes: Uint8Array,
  body: HTMLElement,
  styles: HTMLElement,
  opts: { inWrapper?: boolean } = {},
): Promise<void> {
  const { renderAsync } = await import('docx-preview')
  await renderAsync(bytes, body, styles, { ...OPTIONS, ...opts })
  // No clickable links and no pictures from the internet.
  body.querySelectorAll('a[href]').forEach((a) => a.removeAttribute('href'))
  body.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (!src.startsWith('blob:') && !src.startsWith('data:')) img.removeAttribute('src')
  })
}

/** Owner-side check before sharing. */
export async function checkDocx(bytes: Uint8Array): Promise<void> {
  const { parseAsync } = await import('docx-preview')
  try {
    await parseAsync(bytes, OPTIONS)
  } catch {
    throw new Skip('This Word file couldn’t be opened. It may be damaged.')
  }
}
