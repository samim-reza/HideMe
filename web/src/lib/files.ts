// Which files can be shown in a browser, and what to tell the user when one can't.
//
// Nothing here is ever downloaded by the person opening a link. A file is only
// accepted if the browser can display it (and print it, if the owner allows).

export type DocKind = 'pdf' | 'docx' | 'image' | 'text' | 'table'

export type Classified = { ok: true; kind: DocKind | 'zip' } | { ok: false; reason: string }

const IMAGE = ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif']
const TEXT = ['txt', 'text', 'md', 'markdown', 'log', 'json', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'srt', 'vtt']
const TABLE = ['csv', 'tsv', 'xlsx', 'xlsm', 'xls', 'ods']

const SAVE_AS_PDF = 'Open it and use "Save as PDF" (or Export → PDF), then add the PDF.'

const ADVICE: Record<string, string> = {
  doc: 'Old Word files (.doc) can’t be shown in a browser. Open it in Word or Google Docs and save it as .docx or PDF.',
  dot: 'Old Word files can’t be shown in a browser. Save it as .docx or PDF first.',
  ppt: `Presentations can’t be shown in a browser. ${SAVE_AS_PDF}`,
  pptx: `Presentations can’t be shown in a browser. ${SAVE_AS_PDF}`,
  pps: `Presentations can’t be shown in a browser. ${SAVE_AS_PDF}`,
  ppsx: `Presentations can’t be shown in a browser. ${SAVE_AS_PDF}`,
  odp: `Presentations can’t be shown in a browser. ${SAVE_AS_PDF}`,
  key: `Keynote files can’t be shown in a browser. ${SAVE_AS_PDF}`,
  odt: `This document type can’t be shown in a browser. ${SAVE_AS_PDF}`,
  rtf: `This document type can’t be shown in a browser. ${SAVE_AS_PDF}`,
  pages: `Pages files can’t be shown in a browser. ${SAVE_AS_PDF}`,
  wps: `This document type can’t be shown in a browser. ${SAVE_AS_PDF}`,
  numbers: 'Numbers files can’t be shown in a browser. Export it as Excel (.xlsx) or PDF first.',
  docm: 'Word files with macros can’t be shared. Save it as a normal .docx or PDF first.',
  rar: 'Only .zip archives are supported. Put the files in a .zip instead.',
  '7z': 'Only .zip archives are supported. Put the files in a .zip instead.',
  tar: 'Only .zip archives are supported. Put the files in a .zip instead.',
  gz: 'Only .zip archives are supported. Put the files in a .zip instead.',
  tgz: 'Only .zip archives are supported. Put the files in a .zip instead.',
  svg: 'SVG images aren’t supported. Export it as PNG or JPG first.',
  html: 'Web pages aren’t supported. Print the page to PDF and add the PDF.',
  htm: 'Web pages aren’t supported. Print the page to PDF and add the PDF.',
}

const MEDIA = ['mp3', 'mp4', 'm4a', 'mov', 'avi', 'mkv', 'wav', 'webm', 'ogg', 'flac', 'aac']
const PROGRAMS = ['exe', 'msi', 'apk', 'dmg', 'bat', 'cmd', 'sh', 'js', 'jar', 'app', 'iso']

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(i + 1).toLowerCase() : ''
}

export function classify(name: string, mime = ''): Classified {
  const ext = extensionOf(name)
  if (ext === 'pdf' || mime === 'application/pdf') return { ok: true, kind: 'pdf' }
  if (ext === 'docx') return { ok: true, kind: 'docx' }
  if (ext === 'zip' || mime === 'application/zip' || mime === 'application/x-zip-compressed') return { ok: true, kind: 'zip' }
  if (TABLE.includes(ext)) return { ok: true, kind: 'table' }
  if (IMAGE.includes(ext)) return { ok: true, kind: 'image' }
  if (TEXT.includes(ext)) return { ok: true, kind: 'text' }
  if (ADVICE[ext]) return { ok: false, reason: ADVICE[ext] }
  if (MEDIA.includes(ext)) return { ok: false, reason: 'Audio and video files aren’t supported.' }
  if (PROGRAMS.includes(ext)) return { ok: false, reason: 'Programs and scripts can’t be shared.' }
  // No (or an unknown) extension: fall back to the type the browser reports.
  if (!ext && mime.startsWith('image/') && mime !== 'image/svg+xml') return { ok: true, kind: 'image' }
  if (!ext && mime === 'text/plain') return { ok: true, kind: 'text' }
  return { ok: false, reason: `This file type can’t be shown in a browser. ${SAVE_AS_PDF}` }
}

export const KIND_LABEL: Record<DocKind, string> = {
  pdf: 'PDF',
  docx: 'Word',
  image: 'Image',
  text: 'Text',
  table: 'Spreadsheet',
}

/** For the file picker. Anything else is still accepted and then explained. */
export const ACCEPT = [
  '.pdf',
  '.docx',
  '.zip',
  ...TABLE.map((e) => '.' + e),
  ...IMAGE.map((e) => '.' + e),
  ...TEXT.map((e) => '.' + e),
  'image/*',
  'text/plain',
  'application/pdf',
].join(',')
