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

/** Default space kept empty at the paper edge (most printers cannot print the outer ~4 mm). */
export const MARGIN_MM = 6
/** Default space between photos, for cutting. */
export const GAP_MM = 3
export const MAX_COPIES = 60
export const MAX_GAP_MM = 30
export const MAX_MARGIN_MM = 40

/**
 * Where the block of photos sits on the paper. 'left' | 'center' | 'right'
 * keep it at the top; 'custom' uses x/y (set by dragging).
 */
export type Align = 'left' | 'center' | 'right' | 'custom'

export interface SheetSettings {
  photoW: number
  photoH: number
  /** Number of copies, or 'fill' for as many as fit on the paper. */
  copies: number | 'fill'
  paperId: string
  cutLines: boolean
  /** Gap between photos side by side, in mm. */
  gapX?: number
  /** Gap between rows, in mm. */
  gapY?: number
  /** Empty space kept at the paper edge, in mm. */
  margin?: number
  /** Links made before these options existed have no align and stay centred. */
  align?: Align
  /** Top-left corner of the photo block in mm, used when align is 'custom'. */
  x?: number
  y?: number
}

export interface Slot {
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
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
  /** The rectangle around all photos (empty when nothing fits). */
  block: Box
  /** Where the block's top-left corner may go while staying inside the margins. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

export function getPaper(id: string): Paper {
  return PAPERS.find((p) => p.id === id) ?? PAPERS[0]
}

export function computeLayout(s: SheetSettings): SheetLayout {
  const paper = getPaper(s.paperId)
  const gapX = clamp(s.gapX ?? GAP_MM, 0, MAX_GAP_MM)
  const gapY = clamp(s.gapY ?? GAP_MM, 0, MAX_GAP_MM)
  const margin = clamp(s.margin ?? MARGIN_MM, 0, MAX_MARGIN_MM)
  const align: Align = s.align ?? 'center'

  const usableW = paper.w - 2 * margin
  const usableH = paper.h - 2 * margin
  // A tiny tolerance so that photos that fit exactly are not lost to rounding.
  const maxCols = Math.max(0, Math.floor((usableW + gapX + 1e-6) / (s.photoW + gapX)))
  const maxRows = Math.max(0, Math.floor((usableH + gapY + 1e-6) / (s.photoH + gapY)))
  const capacity = maxCols * maxRows

  const wanted =
    s.copies === 'fill' ? capacity : Math.max(1, Math.min(MAX_COPIES, Math.floor(s.copies)))
  const count = Math.min(wanted, capacity)
  const dropped = wanted - count

  if (count === 0) {
    return {
      paper,
      photoW: s.photoW,
      photoH: s.photoH,
      slots: [],
      capacity,
      dropped,
      block: { x: margin, y: margin, w: 0, h: 0 },
      bounds: { minX: margin, maxX: margin, minY: margin, maxY: margin },
    }
  }

  // Use as few rows as possible, then spread the photos evenly over those rows,
  // so 8 copies become 4 + 4 rather than 5 + 3.
  const rows = Math.ceil(count / maxCols)
  const cols = Math.ceil(count / rows)
  const blockW = cols * s.photoW + (cols - 1) * gapX
  const blockH = rows * s.photoH + (rows - 1) * gapY

  const bounds = {
    minX: margin,
    maxX: Math.max(margin, paper.w - margin - blockW),
    minY: margin,
    maxY: Math.max(margin, paper.h - margin - blockH),
  }

  let x0: number
  let y0 = margin
  if (align === 'left') x0 = bounds.minX
  else if (align === 'right') x0 = bounds.maxX
  else if (align === 'custom') {
    x0 = clamp(s.x ?? bounds.minX, bounds.minX, bounds.maxX)
    y0 = clamp(s.y ?? bounds.minY, bounds.minY, bounds.maxY)
  } else x0 = (paper.w - blockW) / 2

  const slots: Slot[] = []
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    slots.push({
      x: round2(x0 + c * (s.photoW + gapX)),
      y: round2(y0 + r * (s.photoH + gapY)),
    })
  }
  return {
    paper,
    photoW: s.photoW,
    photoH: s.photoH,
    slots,
    capacity,
    dropped,
    block: { x: round2(x0), y: round2(y0), w: round2(blockW), h: round2(blockH) },
    bounds,
  }
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
