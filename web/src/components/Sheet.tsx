import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { SheetLayout } from '../lib/layout'

const PX_PER_MM = 96 / 25.4

interface SheetProps {
  layout: SheetLayout
  imageUrl: string | null
  cutLines: boolean
  /** In print mode the page is made a hair shorter so browsers don't add a blank second page. */
  forPrint?: boolean
}

function blockSave(e: React.SyntheticEvent) {
  e.preventDefault()
}

/** The white page with the photos placed on it, sized in real millimetres. */
function Sheet({ layout, imageUrl, cutLines, forPrint, children }: SheetProps & { children?: ReactNode }) {
  const { paper } = layout
  return (
    <div
      className="sheet"
      style={{
        width: `${paper.w}mm`,
        height: `${forPrint ? paper.h - 1 : paper.h}mm`,
      }}
      onContextMenu={blockSave}
    >
      {imageUrl &&
        layout.slots.map((s, i) => (
          <img
            key={i}
            src={imageUrl}
            alt=""
            draggable={false}
            onDragStart={blockSave}
            className={cutLines ? 'sheet-photo cut' : 'sheet-photo'}
            style={{
              left: `${s.x}mm`,
              top: `${s.y}mm`,
              width: `${layout.photoW}mm`,
              height: `${layout.photoH}mm`,
            }}
          />
        ))}
      {children}
    </div>
  )
}

/**
 * Scaled-down preview that fits the width of its container.
 * With `onMoveBlock`, the photos can be dragged (mouse, finger or arrow keys).
 */
export function SheetPreview(
  props: SheetProps & { maxHeightPx?: number; onMoveBlock?: (x: number, y: number) => void },
) {
  const { layout, onMoveBlock } = props
  const box = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: number; startX: number; startY: number; bx: number; by: number } | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el)
    setBoxW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const paperWpx = layout.paper.w * PX_PER_MM
  const paperHpx = layout.paper.h * PX_PER_MM
  let scale = boxW ? boxW / paperWpx : 0
  if (props.maxHeightPx) scale = Math.min(scale, props.maxHeightPx / paperHpx)

  const { bounds, block } = layout
  const move = (x: number, y: number) => {
    if (!onMoveBlock) return
    const nx = Math.min(bounds.maxX, Math.max(bounds.minX, x))
    const ny = Math.min(bounds.maxY, Math.max(bounds.minY, y))
    onMoveBlock(Math.round(nx * 2) / 2, Math.round(ny * 2) / 2) // 0.5 mm steps
  }

  const canDrag = !!onMoveBlock && layout.slots.length > 0 && scale > 0

  return (
    <div ref={box} className="w-full">
      <div className="mx-auto" style={{ width: paperWpx * scale, height: paperHpx * scale }}>
        <div className="sheet-shadow" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <Sheet {...props}>
            {canDrag && (
              <div
                role="slider"
                tabIndex={0}
                aria-label="Photo position. Drag, or use the arrow keys, to move the photos."
                aria-valuetext={`${Math.round(block.x)} mm from left, ${Math.round(block.y)} mm from top`}
                className={'sheet-drag' + (dragging ? ' dragging' : '')}
                style={{
                  left: `${block.x}mm`,
                  top: `${block.y}mm`,
                  width: `${block.w}mm`,
                  height: `${block.h}mm`,
                }}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, bx: block.x, by: block.y }
                  setDragging(true)
                }}
                onPointerMove={(e) => {
                  const d = drag.current
                  if (!d || d.id !== e.pointerId) return
                  const mmPerPx = 1 / (scale * PX_PER_MM)
                  move(d.bx + (e.clientX - d.startX) * mmPerPx, d.by + (e.clientY - d.startY) * mmPerPx)
                }}
                onPointerUp={() => {
                  drag.current = null
                  setDragging(false)
                }}
                onPointerCancel={() => {
                  drag.current = null
                  setDragging(false)
                }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 10 : 1
                  const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
                  if (!k) return
                  e.preventDefault()
                  move(block.x + k[0], block.y + k[1])
                }}
              />
            )}
          </Sheet>
        </div>
      </div>
    </div>
  )
}

/**
 * The page that actually prints. It is invisible on screen; when the browser
 * prints, everything else is hidden and only this is shown, at exact size.
 */
export function PrintSheet(props: SheetProps) {
  const { paper } = props.layout
  return createPortal(
    <div className="print-portal">
      <style>{`@page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }`}</style>
      <Sheet {...props} forPrint />
    </div>,
    document.body,
  )
}
