import type { ReactNode } from 'react'

export function Card({ title, step, children }: { title?: string; step?: number; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
      {title && (
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
          {step !== undefined && (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
              {step}
            </span>
          )}
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

export interface ChoiceOption<T> {
  value: T
  label: string
  hint?: string
}

/** A row of tappable chips; exactly one is selected. */
export function Choice<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: ChoiceOption<T>[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={
              'min-h-11 rounded-xl px-3.5 py-2 text-left text-sm transition ' +
              (on
                ? 'bg-brand-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200')
            }
          >
            <span className="block font-medium leading-tight">{o.label}</span>
            {o.hint && (
              <span className={'block text-xs leading-tight ' + (on ? 'text-brand-100' : 'text-gray-500')}>
                {o.hint}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={
          'relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2 ' +
          (checked ? 'bg-brand-700' : 'bg-gray-300')
        }
      >
        <span
          className={
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ' +
            (checked ? 'left-[22px]' : 'left-0.5')
          }
        />
      </span>
    </label>
  )
}

/** A labelled slider with its current value shown, e.g. "Gap between rows  3 mm". */
export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  unit?: string
}) {
  return (
    <label className="block py-1">
      <span className="flex items-center justify-between gap-3 text-sm">
        <span className="text-gray-700">{label}</span>
        <span className="font-medium text-gray-900 tabular-nums">
          {value} {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-8 w-full accent-brand-700"
      />
    </label>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  const styles = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm',
    secondary: 'bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50',
    danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
    ghost: 'text-gray-700 hover:bg-gray-100',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ' +
        styles +
        ' ' +
        className
      }
    >
      {children}
    </button>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const styles = {
    info: 'bg-brand-50 text-brand-800 ring-brand-100',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
    error: 'bg-red-50 text-red-800 ring-red-200',
  }[tone]
  return <div className={'rounded-xl px-3.5 py-2.5 text-sm ring-1 ' + styles}>{children}</div>
}

export function LockIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export function PrinterIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <rect x="7" y="14" width="10" height="7" />
    </svg>
  )
}
