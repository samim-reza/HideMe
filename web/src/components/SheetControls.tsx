import type { Align } from '../lib/layout'
import { Choice, Notice, RangeField, Toggle } from './ui'

/**
 * Position, spacing and cut-line controls for a photo sheet.
 * Used by the owner when making the sheet and by the shop when printing it.
 */
export default function SheetControls(props: {
  align: Align
  onAlign: (a: Align) => void
  /** Small text under "Custom", e.g. "dragged" or "as sent". */
  customHint?: string
  gapX: number
  onGapX: (n: number) => void
  gapY: number
  onGapY: (n: number) => void
  margin: number
  onMargin: (n: number) => void
  cutLines: boolean
  onCutLines: (b: boolean) => void
}) {
  return (
    <>
      <p className="mt-4 mb-2 text-sm text-gray-600">Position on the paper</p>
      <Choice
        label="Position"
        value={props.align}
        onChange={props.onAlign}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
          ...(props.align === 'custom' ? [{ value: 'custom' as const, label: 'Custom', hint: props.customHint ?? 'dragged' }] : []),
        ]}
      />
      <p className="mt-2 text-xs text-gray-500">Or drag the photos on the preview to place them anywhere.</p>

      <p className="mt-4 mb-1 text-sm text-gray-600">Spacing</p>
      <RangeField label="Gap between photos (side by side)" value={props.gapX} onChange={props.onGapX} min={0} max={20} step={0.5} unit="mm" />
      <RangeField label="Gap between rows" value={props.gapY} onChange={props.onGapY} min={0} max={20} step={0.5} unit="mm" />
      <RangeField label="Distance from paper edge" value={props.margin} onChange={props.onMargin} min={0} max={30} step={0.5} unit="mm" />
      {props.margin < 4 && (
        <div className="mt-1">
          <Notice tone="warn">Many printers can't print closer than about 4 mm to the edge, so photos may be cut off.</Notice>
        </div>
      )}

      <div className="mt-3">
        <Toggle checked={props.cutLines} onChange={props.onCutLines} label="Cut lines" hint="Thin grey guides around each photo" />
      </div>
    </>
  )
}
