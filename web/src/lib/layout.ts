// Pure layout maths for a print sheet. All sizes are in millimetres.

export interface Paper {
  id: string
  label: string
  w: number
  h: number
}

export const PAPERS: Paper[] = [
  { id: 'a4', label: 'A4', w: 210, h: 297 },
  { id: 'letter', label: 'Letter', w: 215.9, h: 279.4 },
  { id: '4x6', label: '4×6 in', w: 101.6, h: 152.4 },
  { id: '5x7', label: '5×7 in', w: 127, h: 177.8 },
]

export interface PhotoSize {
  id: string
  label: string
  hint: string
  w: number
  h: number
}

export const PHOTO_SIZES: PhotoSize[] = [
  { id: 'passport', label: 'Passport', hint: '35 × 45 mm', w: 35, h: 45 },
  { id: 'stamp', label: 'Stamp', hint: '20 × 25 mm', w: 20, h: 25 },
  { id: '2x2', label: '2 × 2 in', hint: '51 × 51 mm', w: 50.8, h: 50.8 },
  { id: '40x50', label: 'Visa', hint: '40 × 50 mm', w: 40, h: 50 },
  { id: '3r', label: '3R', hint: '3.5 × 5 in', w: 88.9, h: 127 },
]

/** Space kept empty at the paper edge (most printers cannot print the outer ~4 mm). */
export const MARGIN_MM = 6
/** Space between photos, for cutting. */
export const GAP_MM = 3
export const MAX_COPIES = 60

export interface SheetSettings {
  photoW: number
  photoH: number
  /** Number of copies, or 'fill' for as many as fit on the paper. */
  copies: number | 'fill'
  paperId: string
  cutLines: boolean
}

export interface Slot {
  x: number
  y: number
}

export interface SheetLayout {
  paper: Paper
  photoW: number
  photoH: number
  slots: Slot[]
  /** How many photos fit on one sheet at most. */
  capacity: number
  /** Copies the user asked for that do not fit on this paper. */
  dropped: number
}

export function getPaper(id: string): Paper {
  return PAPERS.find((p) => p.id === id) ?? PAPERS[0]
}

export function computeLayout(s: SheetSettings): SheetLayout {
  const paper = getPaper(s.paperId)
  const usableW = paper.w - 2 * MARGIN_MM
  const usableH = paper.h - 2 * MARGIN_MM
  const maxCols = Math.max(0, Math.floor((usableW + GAP_MM) / (s.photoW + GAP_MM)))
  const maxRows = Math.max(0, Math.floor((usableH + GAP_MM) / (s.photoH + GAP_MM)))
  const capacity = maxCols * maxRows

  const wanted =
    s.copies === 'fill' ? capacity : Math.max(1, Math.min(MAX_COPIES, Math.floor(s.copies)))
  const count = Math.min(wanted, capacity)
  const dropped = wanted - count

  if (count === 0) {
    return { paper, photoW: s.photoW, photoH: s.photoH, slots: [], capacity, dropped }
  }

  // Use as few rows as possible, then spread the photos evenly over those rows,
  // so 8 copies become 4 + 4 rather than 5 + 3.
  const rows = Math.ceil(count / maxCols)
  const cols = Math.ceil(count / rows)
  const blockW = cols * s.photoW + (cols - 1) * GAP_MM
  const x0 = (paper.w - blockW) / 2
  const y0 = MARGIN_MM

  const slots: Slot[] = []
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    slots.push({
      x: round2(x0 + c * (s.photoW + GAP_MM)),
      y: round2(y0 + r * (s.photoH + GAP_MM)),
    })
  }
  return { paper, photoW: s.photoW, photoH: s.photoH, slots, capacity, dropped }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
