// Copies the fonts and image decoders pdf.js needs into public/pdfjs/
// (they are served as plain files next to the site). Runs before dev/build.
// The PDF scripting engine (quickjs) is left out on purpose: shared PDFs never run code.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'

const src = new URL('../node_modules/pdfjs-dist/', import.meta.url)
const dst = new URL('../public/pdfjs/', import.meta.url)

rmSync(dst, { recursive: true, force: true })
mkdirSync(dst, { recursive: true })
for (const dir of ['cmaps', 'standard_fonts', 'iccs']) {
  cpSync(new URL(`${dir}/`, src), new URL(`${dir}/`, dst), { recursive: true })
}
mkdirSync(new URL('wasm/', dst), { recursive: true })
for (const f of readdirSync(new URL('wasm/', src))) {
  if (f.startsWith('quickjs') || f.includes('QUICKJS')) continue
  cpSync(new URL(`wasm/${f}`, src), new URL(`wasm/${f}`, dst))
}
console.log('pdf.js assets copied to public/pdfjs/')
