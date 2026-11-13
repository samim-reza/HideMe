import { describe, expect, it } from 'vitest'
import { computeLayout, GAP_MM, MARGIN_MM, type SheetSettings } from './layout'

const passport = { photoW: 35, photoH: 45, cutLines: false }

describe('computeLayout', () => {
  it('puts 4 passport photos in one row on A4', () => {
    const l = computeLayout({ ...passport, copies: 4, paperId: 'a4' })
    expect(l.slots).toHaveLength(4)
    expect(new Set(l.slots.map((s) => s.y)).size).toBe(1)
    expect(l.dropped).toBe(0)
  })

  it('splits 8 copies into two even rows of 4', () => {
    const l = computeLayout({ ...passport, copies: 8, paperId: 'a4' })
    const rows = new Map<number, number>()
    for (const s of l.slots) rows.set(s.y, (rows.get(s.y) ?? 0) + 1)
    expect([...rows.values()]).toEqual([4, 4])
  })

  it('keeps 5 copies in a single row on A4', () => {
    const l = computeLayout({ ...passport, copies: 5, paperId: 'a4' })
    expect(new Set(l.slots.map((s) => s.y)).size).toBe(1)
  })

  it('centres the block horizontally', () => {
    const l = computeLayout({ ...passport, copies: 4, paperId: 'a4' })
    const left = l.slots[0].x
    const right = 210 - (l.slots[3].x + 35)
    expect(Math.abs(left - right)).toBeLessThan(0.02)
  })

  it('keeps every photo inside the printable area with gaps', () => {
    const l = computeLayout({ ...passport, copies: 'fill', paperId: 'a4' })
    expect(l.slots.length).toBe(l.capacity)
    for (const s of l.slots) {
      expect(s.x).toBeGreaterThanOrEqual(MARGIN_MM - 0.01)
      expect(s.y).toBeGreaterThanOrEqual(MARGIN_MM - 0.01)
      expect(s.x + 35).toBeLessThanOrEqual(210 - MARGIN_MM + 0.01)
      expect(s.y + 45).toBeLessThanOrEqual(297 - MARGIN_MM + 0.01)
    }
    const xs = [...new Set(l.slots.map((s) => s.x))].sort((a, b) => a - b)
    expect(xs[1] - xs[0]).toBeCloseTo(35 + GAP_MM, 1)
  })

  it('fills A4 with 5 × 6 = 30 passport photos', () => {
    const l = computeLayout({ ...passport, copies: 'fill', paperId: 'a4' })
    expect(l.capacity).toBe(30)
  })

  it('reports copies that do not fit on small paper', () => {
    const l = computeLayout({ ...passport, copies: 8, paperId: '4x6' })
    expect(l.capacity).toBe(4)
    expect(l.slots).toHaveLength(4)
    expect(l.dropped).toBe(4)
  })

  it('handles a photo bigger than the paper', () => {
    const l = computeLayout({ photoW: 300, photoH: 400, cutLines: false, copies: 1, paperId: '4x6' })
    expect(l.slots).toHaveLength(0)
    expect(l.capacity).toBe(0)
  })
})

describe('position and spacing', () => {
  const base: SheetSettings = { photoW: 35, photoH: 45, cutLines: false, copies: 4, paperId: 'a4' }

  it('keeps old links (no align set) centred with 3 mm gaps', () => {
    const l = computeLayout(base)
    expect(l.slots[1].x - l.slots[0].x).toBeCloseTo(35 + 3, 5)
    expect(Math.abs(l.block.x - (210 - l.block.x - l.block.w))).toBeLessThan(0.02)
  })

  it('left-aligns the block at the margin', () => {
    const l = computeLayout({ ...base, align: 'left' })
    expect(l.slots[0]).toEqual({ x: MARGIN_MM, y: MARGIN_MM })
  })

  it('right-aligns the block at the margin', () => {
    const l = computeLayout({ ...base, align: 'right' })
    const last = l.slots[l.slots.length - 1]
    expect(last.x + 35).toBeCloseTo(210 - MARGIN_MM, 5)
  })

  it('uses separate horizontal and vertical gaps', () => {
    const l = computeLayout({ ...base, copies: 8, align: 'left', gapX: 10, gapY: 2 })
    const xs = [...new Set(l.slots.map((s) => s.x))].sort((a, b) => a - b)
    const ys = [...new Set(l.slots.map((s) => s.y))].sort((a, b) => a - b)
    expect(xs[1] - xs[0]).toBeCloseTo(45, 5)
    expect(ys[1] - ys[0]).toBeCloseTo(47, 5)
  })

  it('zero gaps put photos edge to edge', () => {
    const l = computeLayout({ ...base, align: 'left', gapX: 0 })
    expect(l.slots[1].x - l.slots[0].x).toBeCloseTo(35, 5)
  })

  it('respects a custom edge margin', () => {
    const l = computeLayout({ ...base, align: 'left', margin: 15 })
    expect(l.slots[0]).toEqual({ x: 15, y: 15 })
  })

  it('a bigger margin fits fewer photos', () => {
    const small = computeLayout({ ...base, copies: 'fill', margin: 6 })
    const big = computeLayout({ ...base, copies: 'fill', margin: 30 })
    expect(big.capacity).toBeLessThan(small.capacity)
  })

  it('places a dragged block where it was dropped', () => {
    const l = computeLayout({ ...base, align: 'custom', x: 50, y: 100 })
    expect(l.slots[0]).toEqual({ x: 50, y: 100 })
  })

  it('keeps a dragged block inside the margins', () => {
    const l = computeLayout({ ...base, align: 'custom', x: 500, y: -20 })
    expect(l.block.x + l.block.w).toBeCloseTo(210 - MARGIN_MM, 5)
    expect(l.block.y).toBe(MARGIN_MM)
  })

  it('reports drag bounds that match the block size', () => {
    const l = computeLayout({ ...base, align: 'left' })
    expect(l.bounds.maxX).toBeCloseTo(210 - MARGIN_MM - l.block.w, 5)
    expect(l.bounds.maxY).toBeCloseTo(297 - MARGIN_MM - l.block.h, 5)
  })

  it('ignores nonsense values', () => {
    const l = computeLayout({ ...base, gapX: Number.NaN, gapY: -5, margin: 999 })
    expect(l.slots.length).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(l.block.x)).toBe(true)
  })
})
