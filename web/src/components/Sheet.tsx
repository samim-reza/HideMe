import { useLayoutEffect, useRef, useState } from 'react'
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
function Sheet({ layout, imageUrl, cutLines, forPrint }: SheetProps) {
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
    </div>
  )
}

/** Scaled-down preview that fits the width of its container. */
export function SheetPreview(props: SheetProps & { maxHeightPx?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el)
    setBoxW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const paperWpx = props.layout.paper.w * PX_PER_MM
  const paperHpx = props.layout.paper.h * PX_PER_MM
  let scale = boxW ? boxW / paperWpx : 0
  if (props.maxHeightPx) scale = Math.min(scale, props.maxHeightPx / paperHpx)

  return (
    <div ref={box} className="w-full">
      <div className="mx-auto" style={{ width: paperWpx * scale, height: paperHpx * scale }}>
        <div className="sheet-shadow" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <Sheet {...props} />
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
