import { Badge } from '@astryxdesign/core/Badge'
import { CalendarDays, CircleAlert, FolderKanban, UserRoundCheck } from 'lucide-react'
import type { Task } from '../../types/domain'
import { useWorkspaceTasks } from './useWorkspaceTasks'

type TaskListMode = 'today' | 'mine' | 'all'

interface WorkspaceTaskListProps {
  workspaceId: string
  userId: string
  mode: TaskListMode
  onOpenTask: (task: Task) => void
}

function dayKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function WorkspaceTaskList({ workspaceId, userId, mode, onOpenTask }: WorkspaceTaskListProps) {
  const query = useWorkspaceTasks(workspaceId)
  if (query.isLoading) return <div className="workspace-list-loading">Loading tasks…</div>
  if (!query.data) return <div className="workspace-list-loading">Unable to load tasks.</div>

  const { tasks, projects, statuses, assignees } = query.data
  const assignedIds = new Set(assignees.filter((entry) => entry.user_id === userId).map((entry) => entry.task_id))
  const statusById = new Map(statuses.map((status) => [status.id, status]))
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const today = dayKey(new Date())

  const visible = tasks.filter((task) => {
    if (mode === 'mine' && !assignedIds.has(task.id)) return false
    if (mode === 'today') {
      if (!assignedIds.has(task.id)) return false
      const status = statusById.get(task.status_id)
      if (status?.is_terminal || !task.due_date) return false
      return dayKey(task.due_date) <= today
    }
    return true
  }).sort((a, b) => {
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
    return aDue - bDue || b.updated_at.localeCompare(a.updated_at)
  })

  const title = mode === 'today' ? 'Today' : mode === 'mine' ? 'My tasks' : 'All tasks'
  const copy = mode === 'today' ? 'Your overdue and due-today work, ordered by deadline.' : mode === 'mine' ? 'Every task currently assigned to you.' : 'Every task across the current workspace.'

  return <section className="workspace-task-page">
    <header className="workspace-task-heading"><div><p className="eyebrow">My work</p><h2>{title}</h2><p>{copy}</p></div><div className="workspace-task-count"><strong>{visible.length}</strong><span>tasks</span></div></header>
    <div className="workspace-task-table" role="table">
      <div className="workspace-task-row workspace-task-table-head" role="row"><span>Task</span><span>Project</span><span>Status</span><span>Due</span><span>Priority</span></div>
      {visible.map((task) => {
        const project = projectById.get(task.project_id)
        const status = statusById.get(task.status_id)
        const overdue = Boolean(task.due_date && dayKey(task.due_date) < today && !status?.is_terminal)
        return <button className="workspace-task-row" type="button" key={task.id} onClick={() => onOpenTask(task)} role="row">
          <span className="workspace-task-primary"><span className="task-reference">FL-{task.task_number}</span><strong>{task.title}</strong>{task.is_blocked ? <small><CircleAlert size={13} />Blocked</small> : null}</span>
          <span><FolderKanban size={14} />{project?.name ?? 'Project'}</span>
          <span>{status?.name ?? 'Status'}</span>
          <span className={overdue ? 'workspace-task-due overdue' : 'workspace-task-due'}><CalendarDays size={14} />{task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No deadline'}</span>
          <span>{task.priority ? <Badge label={task.priority} variant={task.priority === 'URGENT' ? 'red' : task.priority === 'HIGH' ? 'orange' : 'neutral'} /> : '—'}</span>
        </button>
      })}
      {!visible.length ? <div className="workspace-task-empty"><UserRoundCheck size={24} /><strong>Nothing needs attention here</strong><span>{mode === 'today' ? 'No assigned tasks are overdue or due today.' : 'No matching tasks yet.'}</span></div> : null}
    </div>
  </section>
}
