import { describe, expect, it } from 'vitest'
import { computeLayout, GAP_MM, MARGIN_MM } from './layout'

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
