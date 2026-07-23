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

interface CalendarViewProps { workspaceId: string; userId: string; role: WorkspaceRole | null; onOpenTask: (task: Task) => void }

const priorityOptions = [{ value: 'ALL', label: 'All priorities' }, ...(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as TaskPriority[]).map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))]
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
const mondayOf = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7))
const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const taskKey = (task: Task) => task.due_date ? keyOf(new Date(task.due_date)) : ''
const isoForDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString()

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

export function CalendarView({ workspaceId, userId, role, onOpenTask }: CalendarViewProps) {
  const query = useWorkspaceTasks(workspaceId)
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<CalendarMode>('month')
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
      if (!task.due_date) return false
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

  async function reschedule(taskId: string, date: Date) {
    if (role === 'VIEWER') return
    setError(null)
    const task = query.data?.tasks.find((entry) => entry.id === taskId)
    const { error: updateError } = await supabase.from('tasks').update({ due_date: isoForDate(date) }).eq('id', taskId)
    if (updateError) { setError(updateError.message); return }
    await Promise.all([queryClient.invalidateQueries({ queryKey: workspaceTasksQueryKey(workspaceId) }), queryClient.invalidateQueries({ queryKey: boardQueryKey(workspaceId, task?.project_id) })])
  }

  const changePeriod = (direction: number) => { if (mode === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1)); else setAnchor(addDays(anchor, direction * 7)) }
  const weekStart = mondayOf(anchor)
  const weekEnd = addDays(weekStart, 6)
  const heading = mode === 'month' ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`

  const renderTask = (task: Task) => {
    const status = statusById.get(task.status_id)
    return <button key={task.id} type="button" draggable={role !== 'VIEWER'} onDragStart={(event) => event.dataTransfer.setData('text/flowlane-task', task.id)} onClick={(event) => { event.stopPropagation(); onOpenTask(task) }} className={`calendar-task workflow-tone-${statusTone(status)}${status?.is_terminal ? ' complete' : ''}`} title={`${projectById.get(task.project_id)?.name ?? ''} · ${status?.name ?? ''}`}>
      <span className="calendar-task-ref">FL-{task.task_number}</span>
      <span className="calendar-task-title">{task.title}</span>
      {mode === 'week' ? <span className="calendar-task-status">{status?.name}</span> : null}
    </button>
  }

  const gridStart = mode === 'month' ? mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : weekStart
  const count = mode === 'month' ? 42 : 7

  return <section className="calendar-page">
    <header className="calendar-heading"><div><p className="eyebrow">Workspace schedule</p><h2>Calendar</h2><p>Deadlines across projects. Task color follows its workflow state; drag a task to reschedule it.</p></div><div className="calendar-mode-switch"><Button label="Month" variant={mode === 'month' ? 'primary' : 'secondary'} size="sm" onClick={() => setMode('month')} /><Button label="Week" variant={mode === 'week' ? 'primary' : 'secondary'} size="sm" onClick={() => setMode('week')} /></div></header>
    <div className="calendar-filter-bar"><Selector label="Project" isLabelHidden options={projectOptions} value={projectFilter} onChange={(value) => { setProjectFilter(value); setStatusFilter('ALL') }} width="100%" /><Selector label="Assignee" isLabelHidden options={assigneeOptions} value={assigneeFilter} onChange={setAssigneeFilter} width="100%" /><Selector label="Priority" isLabelHidden options={priorityOptions} value={priorityFilter} onChange={setPriorityFilter} width="100%" /><Selector label="Status" isLabelHidden options={statusOptions} value={statusFilter} onChange={setStatusFilter} width="100%" /></div>
    <div className="calendar-period-bar"><Button label="Previous" variant="ghost" size="sm" icon={<ChevronLeft size={15} />} onClick={() => changePeriod(-1)} /><Button label="Today" variant="secondary" size="sm" onClick={() => setAnchor(startOfDay(new Date()))} /><strong>{heading}</strong><Button label="Next" variant="ghost" size="sm" icon={<ChevronRight size={15} />} onClick={() => changePeriod(1)} /></div>
    {error ? <div className="inline-alert error-alert">{error}</div> : null}
    <div className={`calendar-grid ${mode}`}>{Array.from({ length: count }, (_, index) => addDays(gridStart, index)).map((date) => { const key = keyOf(date); const dayTasks = filteredTasks.filter((task) => taskKey(task) === key); const outside = mode === 'month' && date.getMonth() !== anchor.getMonth(); return <div key={key} className={`calendar-day${outside ? ' outside' : ''}${key === keyOf(new Date()) ? ' today' : ''}`} onDragOver={(event) => { if (role !== 'VIEWER') event.preventDefault() }} onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData('text/flowlane-task'); if (taskId) void reschedule(taskId, date) }}><header><span>{date.toLocaleDateString(undefined, { weekday: mode === 'week' ? 'short' : undefined })}</span><strong>{date.getDate()}</strong></header><div className="calendar-day-tasks">{dayTasks.map(renderTask)}</div></div> })}</div>
  </section>
}
