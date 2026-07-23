import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Selector } from '@/components/ui/Selector'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Task, TaskPriority, WorkflowStatus, WorkspaceRole } from '../../types/domain'
import { boardQueryKey } from '../board/useBoardData'
import { useWorkspaceTasks, workspaceTasksQueryKey } from '../tasks/useWorkspaceTasks'

type CalendarMode = 'month' | 'week'

interface CalendarViewProps {
  workspaceId: string
  userId: string
  role: WorkspaceRole | null
  onOpenTask: (task: Task) => void
}

interface TaskRange {
  start: Date
  end: Date
}

interface WeekSegment {
  task: Task
  startIndex: number
  endIndex: number
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

const priorityOptions = [
  { value: 'ALL', label: 'All priorities' },
  ...(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((value) => ({
    value,
    label: value.charAt(0) + value.slice(1).toLowerCase(),
  })),
]

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
const mondayOf = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7))
const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
const diffDays = (from: Date, to: Date) => Math.round(dayNumber(to) - dayNumber(from))
const isoForDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString()

function taskRange(task: Task): TaskRange | null {
  const rawStart = task.start_date ? startOfDay(new Date(task.start_date)) : task.due_date ? startOfDay(new Date(task.due_date)) : null
  const rawEnd = task.due_date ? startOfDay(new Date(task.due_date)) : task.start_date ? startOfDay(new Date(task.start_date)) : null
  if (!rawStart || !rawEnd) return null
  return rawStart <= rawEnd ? { start: rawStart, end: rawEnd } : { start: rawEnd, end: rawStart }
}

function statusTone(status?: WorkflowStatus) {
  if (!status) return 'neutral'
  const name = status.name.toLowerCase()
  if (name.includes('review')) return 'review'
  if (status.category === 'BACKLOG') return 'backlog'
  if (status.category === 'UNSTARTED') return 'unstarted'
  if (status.category === 'STARTED') return 'started'
  if (status.category === 'COMPLETED') return 'completed'
  if (status.category === 'CANCELED') return 'canceled'
  return 'neutral'
}

function buildWeekSegments(tasks: Task[], weekStart: Date): { segments: WeekSegment[]; laneCount: number } {
  const weekEnd = addDays(weekStart, 6)
  const raw = tasks.flatMap((task) => {
    const range = taskRange(task)
    if (!range || range.end < weekStart || range.start > weekEnd) return []
    return [{
      task,
      startIndex: Math.max(0, diffDays(weekStart, range.start)),
      endIndex: Math.min(6, diffDays(weekStart, range.end)),
      continuesBefore: range.start < weekStart,
      continuesAfter: range.end > weekEnd,
    }]
  }).sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex || a.task.position - b.task.position)

  const laneEnds: number[] = []
  const segments: WeekSegment[] = raw.map((segment) => {
    let lane = laneEnds.findIndex((lastEnd) => segment.startIndex > lastEnd)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(segment.endIndex)
    } else {
      laneEnds[lane] = segment.endIndex
    }
    return { ...segment, lane }
  })

  return { segments, laneCount: Math.max(1, laneEnds.length) }
}

export function CalendarView({ workspaceId, userId, role, onOpenTask }: CalendarViewProps) {
  const query = useWorkspaceTasks(workspaceId)
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<CalendarMode>(() => window.matchMedia('(max-width: 760px)').matches ? 'week' : 'month')
  const [anchor, setAnchor] = useState(startOfDay(new Date()))
  const [projectFilter, setProjectFilter] = useState('ALL')
  const [assigneeFilter, setAssigneeFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [error, setError] = useState<string | null>(null)

  const data = query.data
  const filteredTasks = useMemo(() => {
    if (!data) return []
    return data.tasks.filter((task) => {
      if (!task.start_date && !task.due_date) return false
      if (projectFilter !== 'ALL' && task.project_id !== projectFilter) return false
      if (priorityFilter !== 'ALL' && task.priority !== priorityFilter) return false
      if (statusFilter !== 'ALL' && task.status_id !== statusFilter) return false
      if (assigneeFilter !== 'ALL') {
        const expected = assigneeFilter === 'ME' ? userId : assigneeFilter
        if (!data.assignees.some((entry) => entry.task_id === task.id && entry.user_id === expected)) return false
      }
      return true
    })
  }, [assigneeFilter, data, priorityFilter, projectFilter, statusFilter, userId])

  if (query.isLoading) return <div className="calendar-loading">Loading calendar…</div>
  if (!data) return <div className="calendar-loading">Unable to load calendar.</div>

  const projectOptions = [{ value: 'ALL', label: 'All projects' }, ...data.projects.map((project) => ({ value: project.id, label: project.name }))]
  const assigneeOptions = [{ value: 'ALL', label: 'All assignees' }, { value: 'ME', label: 'Assigned to me' }, ...data.profiles.filter((profile) => profile.id !== userId).map((profile) => ({ value: profile.id, label: profile.display_name || profile.email }))]
  const statusOptions = [{ value: 'ALL', label: 'All statuses' }, ...data.statuses.filter((status) => projectFilter === 'ALL' || status.project_id === projectFilter).map((status) => ({ value: status.id, label: status.name }))]
  const projectById = new Map(data.projects.map((project) => [project.id, project]))
  const statusById = new Map(data.statuses.map((status) => [status.id, status]))

  async function moveTaskRange(taskId: string, targetDate: Date) {
    if (role === 'VIEWER') return
    const task = query.data?.tasks.find((entry) => entry.id === taskId)
    if (!task) return

    setError(null)
    const range = taskRange(task)
    const payload: { start_date?: string; due_date?: string } = {}

    if (task.start_date && task.due_date && range) {
      const durationDays = Math.max(0, diffDays(range.start, range.end))
      payload.start_date = isoForDate(targetDate)
      payload.due_date = isoForDate(addDays(targetDate, durationDays))
    } else if (task.start_date) {
      payload.start_date = isoForDate(targetDate)
    } else {
      payload.due_date = isoForDate(targetDate)
    }

    const { error: updateError } = await supabase.from('tasks').update(payload).eq('id', taskId)
    if (updateError) { setError(updateError.message); return }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceTasksQueryKey(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: boardQueryKey(workspaceId, task.project_id) }),
    ])
  }

  const changePeriod = (direction: number) => {
    if (mode === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1))
    else setAnchor(addDays(anchor, direction * 7))
  }

  const weekStart = mondayOf(anchor)
  const weekEnd = addDays(weekStart, 6)
  const heading = mode === 'month'
    ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`

  const firstVisibleDay = mode === 'month' ? mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : weekStart
  const visibleWeeks = mode === 'month' ? 6 : 1

  return <section className="calendar-page calendar-range-page">
    <header className="calendar-heading">
      <div><p className="eyebrow">Workspace schedule</p><h2>Calendar</h2><p>Tasks span from start to due date when both are available. Drag a range to move it while preserving its duration.</p></div>
      <div className="calendar-mode-switch"><Button label="Month" variant={mode === 'month' ? 'primary' : 'secondary'} size="sm" onClick={() => setMode('month')} /><Button label="Week" variant={mode === 'week' ? 'primary' : 'secondary'} size="sm" onClick={() => setMode('week')} /></div>
    </header>

    <div className="calendar-filter-bar">
      <Selector label="Project" isLabelHidden options={projectOptions} value={projectFilter} onChange={(value) => { setProjectFilter(value); setStatusFilter('ALL') }} width="100%" />
      <Selector label="Assignee" isLabelHidden options={assigneeOptions} value={assigneeFilter} onChange={setAssigneeFilter} width="100%" />
      <Selector label="Priority" isLabelHidden options={priorityOptions} value={priorityFilter} onChange={setPriorityFilter} width="100%" />
      <Selector label="Status" isLabelHidden options={statusOptions} value={statusFilter} onChange={setStatusFilter} width="100%" />
    </div>

    <div className="calendar-period-bar">
      <Button label="Previous" variant="ghost" size="sm" icon={<ChevronLeft size={15} />} onClick={() => changePeriod(-1)} />
      <Button label="Today" variant="secondary" size="sm" onClick={() => setAnchor(startOfDay(new Date()))} />
      <strong>{heading}</strong>
      <Button label="Next" variant="ghost" size="sm" icon={<ChevronRight size={15} />} onClick={() => changePeriod(1)} />
    </div>

    {error ? <div className="inline-alert error-alert">{error}</div> : null}

    <div className={`calendar-range-board ${mode}`}>
      {Array.from({ length: visibleWeeks }, (_, weekIndex) => addDays(firstVisibleDay, weekIndex * 7)).map((rangeWeekStart) => {
        const { segments, laneCount } = buildWeekSegments(filteredTasks, rangeWeekStart)
        const days = Array.from({ length: 7 }, (_, index) => addDays(rangeWeekStart, index))
        const extraSpace = mode === 'week' ? 112 : 18
        const blockHeight = 48 + laneCount * 32 + extraSpace

        return <div className="calendar-week-block" key={keyOf(rangeWeekStart)} style={{ minHeight: `${blockHeight}px` }}>
          <div className="calendar-week-days">
            {days.map((date) => {
              const outside = mode === 'month' && date.getMonth() !== anchor.getMonth()
              const isToday = keyOf(date) === keyOf(new Date())
              return <div
                key={keyOf(date)}
                className={`calendar-date-cell${outside ? ' outside' : ''}${isToday ? ' today' : ''}`}
                onDragOver={(event) => { if (role !== 'VIEWER') event.preventDefault() }}
                onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData('text/flowlane-task'); if (taskId) void moveTaskRange(taskId, date) }}
              >
                <span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <strong>{date.getDate()}</strong>
              </div>
            })}
          </div>

          <div className="calendar-range-layer" style={{ gridTemplateRows: `repeat(${laneCount}, 28px)` }}>
            {segments.map((segment) => {
              const status = statusById.get(segment.task.status_id)
              const range = taskRange(segment.task)
              const project = projectById.get(segment.task.project_id)
              return <button
                key={`${segment.task.id}-${keyOf(rangeWeekStart)}`}
                type="button"
                draggable={role !== 'VIEWER'}
                onDragStart={(event) => event.dataTransfer.setData('text/flowlane-task', segment.task.id)}
                onClick={() => onOpenTask(segment.task)}
                className={`calendar-range-task workflow-tone-${statusTone(status)}${status?.is_terminal ? ' complete' : ''}${segment.continuesBefore ? ' continues-before' : ''}${segment.continuesAfter ? ' continues-after' : ''}`}
                style={{ gridColumn: `${segment.startIndex + 1} / ${segment.endIndex + 2}`, gridRow: `${segment.lane + 1}` }}
                title={`${project?.name ?? 'Project'} · ${status?.name ?? 'Status'} · ${range ? `${range.start.toLocaleDateString()} – ${range.end.toLocaleDateString()}` : ''}`}
              >
                <span className="calendar-range-ref">FL-{segment.task.task_number}</span>
                <strong>{segment.task.title}</strong>
                <span className="calendar-range-status">{status?.name}</span>
              </button>
            })}
          </div>
        </div>
      })}
    </div>
  </section>
}
