import { Popover } from '@base-ui/react/popover'
import { CalendarDays, X } from 'lucide-react'
import { useState } from 'react'
import { Calendar, type ISODateString } from './Calendar'

interface DateInputProps {
  label: string
  value?: ISODateString
  onChange: (value: ISODateString | undefined) => void
  hasClear?: boolean
  width?: React.CSSProperties['width']
}

function parseIsoDate(value?: ISODateString) {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

function toIsoDate(date: Date): ISODateString {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` as ISODateString
}

export function DateInput({ label, value, onChange, hasClear = false, width }: DateInputProps) {
  const [open, setOpen] = useState(false)
  const selected = parseIsoDate(value)
  const displayValue = selected
    ? selected.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Pick a date'

  return <div className="fl-field fl-date-field" style={{ width }}>
    <span className="fl-field-label">{label}</span>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="fl-date-trigger-shell">
        <Popover.Trigger className="fl-date-trigger" aria-label={`${label}: ${displayValue}`}>
          <CalendarDays size={16} aria-hidden="true" />
          <span className={selected ? undefined : 'is-placeholder'}>{displayValue}</span>
        </Popover.Trigger>
        {hasClear && value ? <button type="button" className="fl-date-clear" aria-label={`Clear ${label}`} onClick={() => onChange(undefined)}><X size={13} /></button> : null}
      </div>
      <Popover.Portal>
        <Popover.Positioner className="fl-date-positioner" sideOffset={8} align="start" collisionAvoidance={{ side: 'flip', align: 'shift' }}>
          <Popover.Popup className="fl-date-popover">
            <Calendar
              selected={selected}
              initialMonth={selected}
              onSelect={(date) => {
                onChange(toIsoDate(date))
                setOpen(false)
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  </div>
}

export type { ISODateString } from './Calendar'
