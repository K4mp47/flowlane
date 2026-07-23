import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'

export type ISODateString = `${number}-${number}-${number}`

interface CalendarProps {
  selected?: Date
  onSelect: (date: Date) => void
  initialMonth?: Date
  className?: string
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
const mondayOf = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7))
const sameDay = (left?: Date, right?: Date) => Boolean(left && right && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate())

export function Calendar({ selected, onSelect, initialMonth, className }: CalendarProps) {
  const [month, setMonth] = useState(() => new Date((initialMonth ?? selected ?? new Date()).getFullYear(), (initialMonth ?? selected ?? new Date()).getMonth(), 1))
  const days = useMemo(() => {
    const gridStart = mondayOf(new Date(month.getFullYear(), month.getMonth(), 1))
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  }, [month])
  const today = startOfDay(new Date())

  return <div className={cn('fl-calendar', className)}>
    <div className="fl-calendar-header">
      <button type="button" className="fl-calendar-nav" aria-label="Previous month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
      <strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
      <button type="button" className="fl-calendar-nav" aria-label="Next month" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
    </div>
    <div className="fl-calendar-weekdays" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="fl-calendar-grid">
      {days.map((date) => {
        const outside = date.getMonth() !== month.getMonth()
        const isSelected = sameDay(date, selected)
        const isToday = sameDay(date, today)
        return <button
          type="button"
          key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
          className={cn('fl-calendar-day', outside && 'is-outside', isSelected && 'is-selected', isToday && 'is-today')}
          aria-pressed={isSelected}
          aria-label={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          onClick={() => onSelect(startOfDay(date))}
        >{date.getDate()}</button>
      })}
    </div>
  </div>
}
