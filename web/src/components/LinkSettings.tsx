import type { ReactNode } from 'react'
import { EXPIRY_OPTIONS, OPEN_OPTIONS } from '../lib/linkOptions'
import { Card, Choice } from './ui'

/** "How long does the link work, and how many times can it be opened." */
export default function LinkSettings({
  step,
  expiresIn,
  onExpiresIn,
  maxOpens,
  onMaxOpens,
  children,
}: {
  step: number
  expiresIn: number
  onExpiresIn: (v: number) => void
  maxOpens: number
  onMaxOpens: (v: number) => void
  children?: ReactNode
}) {
  return (
    <Card step={step} title="Link settings">
      <p className="mb-2 text-sm text-gray-600">Link stops working after</p>
      <Choice label="Expiry" value={expiresIn} onChange={onExpiresIn} options={EXPIRY_OPTIONS} />
      <p className="mt-4 mb-2 text-sm text-gray-600">Can be opened</p>
      <Choice label="Open limit" value={maxOpens} onChange={onMaxOpens} options={OPEN_OPTIONS} />
      {maxOpens > 0 && <p className="mt-2 text-xs text-gray-500">Reloading the page also counts as opening it.</p>}
      {children && <div className="mt-3 border-t border-gray-100 pt-2">{children}</div>}
    </Card>
  )
}
