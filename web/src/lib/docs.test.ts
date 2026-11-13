import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { unpack } from './crypto'
import { decodeTable, decodeText, packDocs, splitDocs, type DocsPayload } from './docs'
import { classify } from './files'
import { decodeAnyText, prepareSources, Skip, type Source } from './prepare'

function src(name: string, data: Uint8Array | string, type = ''): Source {
  const bytes = typeof data === 'string' ? strToU8(data) : data
  return { name, type, bytes: async () => bytes.slice().buffer }
}

const fakeImage = async (bytes: Uint8Array<ArrayBuffer>) => ({ bytes, mime: 'image/jpeg' })
const pdfBytes = strToU8('%PDF-1.4\n% test\n')

describe('classify', () => {
  it('accepts formats a browser can show', () => {
    expect(classify('a.PDF')).toEqual({ ok: true, kind: 'pdf' })
    expect(classify('letter.docx')).toEqual({ ok: true, kind: 'docx' })
    expect(classify('scan.jpeg')).toEqual({ ok: true, kind: 'image' })
    expect(classify('notes.txt')).toEqual({ ok: true, kind: 'text' })
    expect(classify('bill.xlsx')).toEqual({ ok: true, kind: 'table' })
    expect(classify('data.csv')).toEqual({ ok: true, kind: 'table' })
    expect(classify('bundle.zip')).toEqual({ ok: true, kind: 'zip' })
  })

  it('explains formats that cannot be shown', () => {
    const doc = classify('old.doc')
    expect(doc.ok).toBe(false)
    expect(!doc.ok && doc.reason).toMatch(/\.docx or PDF/)
    expect(!classify('deck.pptx').ok).toBe(true)
    expect(!classify('archive.rar').ok).toBe(true)
    expect(!classify('virus.exe').ok).toBe(true)
    expect(!classify('song.mp3').ok).toBe(true)
    expect(!classify('logo.svg').ok).toBe(true)
  })

  it('uses the browser-reported type when there is no extension', () => {
    expect(classify('photo', 'image/png')).toEqual({ ok: true, kind: 'image' })
    expect(classify('readme', 'text/plain')).toEqual({ ok: true, kind: 'text' })
    expect(classify('thing', 'application/octet-stream').ok).toBe(false)
  })
})

describe('bundle', () => {
  it('packs several files and splits them back', () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([9, 8])
    const packed = packDocs({ allowPrint: true, watermark: '  For ABC only  ' }, [
      { entry: { name: 'a.pdf', kind: 'pdf', mime: 'application/pdf', size: 0 }, bytes: a },
      { entry: { name: 'b.txt', kind: 'text', mime: 'text/plain', size: 0 }, bytes: b },
    ])
    const { header, file } = unpack<DocsPayload>(packed)
    expect(header.kind).toBe('docs')
    expect(header.watermark).toBe('For ABC only')
    expect(header.files.map((f) => f.size)).toEqual([3, 2])
    const files = splitDocs(header, file)
    expect(files[0].bytes).toEqual(a)
    expect(files[1].bytes).toEqual(b)
  })

  it('rejects a header that does not match the data', () => {
    const header: DocsPayload = {
      v: 1,
      kind: 'docs',
      allowPrint: true,
      watermark: '',
      files: [{ name: 'x', kind: 'text', mime: 'text/plain', size: 10 }],
    }
    expect(() => splitDocs(header, new Uint8Array(5))).toThrow()
    expect(() => splitDocs({ ...header, files: [] }, new Uint8Array(0))).toThrow()
  })
})

describe('prepareSources', () => {
  it('keeps PDFs and text, explains the rest', async () => {
    const { files, skipped } = await prepareSources(
      [src('a.pdf', pdfBytes), src('n.txt', 'hello'), src('old.doc', 'xx'), src('fake.pdf', 'not a pdf')],
      { image: fakeImage },
    )
    expect(files.map((f) => f.entry.name)).toEqual(['a.pdf', 'n.txt'])
    expect(skipped.map((s) => s.name)).toEqual(['old.doc', 'fake.pdf'])
  })

  it('records the page count from the PDF check', async () => {
    const { files } = await prepareSources([src('a.pdf', pdfBytes)], { pdf: async () => 3 })
    expect(files[0].entry.pages).toBe(3)
  })

  it('skips a PDF the check rejects', async () => {
    const { files, skipped } = await prepareSources([src('locked.pdf', pdfBytes)], {
      pdf: async () => {
        throw new Skip('password')
      },
    })
    expect(files).toHaveLength(0)
    expect(skipped[0].reason).toBe('password')
  })

  it('opens a ZIP and keeps only the files that can be shown', async () => {
    const zip = zipSync({
      'docs/letter.pdf': pdfBytes,
      'docs/notes.txt': strToU8('বাংলা text'),
      'docs/old.doc': strToU8('xx'),
      '__MACOSX/._letter.pdf': strToU8('junk'),
      'inner.zip': zipSync({ 'x.txt': strToU8('x') }),
    })
    const { files, skipped } = await prepareSources([src('pack.zip', zip)], { image: fakeImage })
    expect(files.map((f) => f.entry.name)).toEqual(['pack.zip › docs/letter.pdf', 'pack.zip › docs/notes.txt'])
    expect(decodeText(files[1].bytes)).toBe('বাংলা text')
    expect(skipped.map((s) => s.name).sort()).toEqual(['pack.zip › docs/old.doc', 'pack.zip › inner.zip'])
  })

  it('explains a damaged ZIP', async () => {
    const { skipped } = await prepareSources([src('bad.zip', 'PK not really')])
    expect(skipped[0].reason).toMatch(/ZIP/)
  })

  it('turns a CSV into a table, keeping UTF-8 text', async () => {
    const { files } = await prepareSources([src('t.csv', 'name,city\nরহিম,ঢাকা\n"a, b",c\n')])
    const t = decodeTable(files[0].bytes)
    expect(t.sheets[0].rows).toEqual([
      ['name', 'city'],
      ['রহিম', 'ঢাকা'],
      ['a, b', 'c'],
    ])
  })

  it('turns an Excel file into a table', async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Item', 'Price'], ['Tea', 20]]), 'Bill')
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
    const { files } = await prepareSources([src('bill.xlsx', bytes)])
    const t = decodeTable(files[0].bytes)
    expect(t.sheets[0].name).toBe('Bill')
    expect(t.sheets[0].rows).toEqual([
      ['Item', 'Price'],
      ['Tea', '20'],
    ])
  })

  it('rejects binary data pretending to be text', async () => {
    const { skipped } = await prepareSources([src('x.txt', new Uint8Array(500))])
    expect(skipped[0].reason).toMatch(/text file/)
  })

  it('rejects a Word file that is not a real .docx', async () => {
    const { skipped } = await prepareSources([src('w.docx', 'hello')])
    expect(skipped[0].reason).toMatch(/password-protected or damaged/)
  })

  it('decodes UTF-16 and Windows text', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00])
    expect(decodeAnyText(utf16)).toBe('Hi')
    expect(decodeAnyText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café')
  })
})
