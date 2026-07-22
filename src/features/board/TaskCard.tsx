import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/Badge'
import { CalendarDays, CheckSquare2, GripVertical, LockKeyhole } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ChecklistItem, Profile, Task, TaskAssignee, TaskPriority, TaskType } from '../../types/domain'

const priorityVariant: Record<TaskPriority, 'teal' | 'yellow' | 'orange' | 'red'> = {
  LOW: 'teal',
  MEDIUM: 'yellow',
  HIGH: 'orange',
  URGENT: 'red',
}

interface TaskCardProps {
  task: Task
  taskType?: TaskType
  assignees: TaskAssignee[]
  checklistItems: ChecklistItem[]
  profiles: Profile[]
  isReadOnly: boolean
  onOpen: (task: Task) => void
}

interface TaskCardContentProps {
  task: Task
  taskType?: TaskType
  assignees: TaskAssignee[]
  checklistItems: ChecklistItem[]
  profiles: Profile[]
  headerAction?: ReactNode
}

function taskProfiles(task: Task, assignees: TaskAssignee[], profiles: Profile[]) {
  return assignees.filter((entry) => entry.task_id === task.id).map((entry) => profiles.find((profile) => profile.id === entry.user_id)).filter(Boolean) as Profile[]
}

function checklistProgress(task: Task, checklistItems: ChecklistItem[]) {
  const items = checklistItems.filter((item) => item.task_id === task.id)
  return { total: items.length, completed: items.filter((item) => item.is_completed).length }
}

function TaskCardContent({ task, taskType, assignees, checklistItems, profiles, headerAction }: TaskCardContentProps) {
  const profilesForTask = taskProfiles(task, assignees, profiles)
  const checklist = checklistProgress(task, checklistItems)
  const dueLabel = task.due_date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(task.due_date)) : null

  return (
    <>
      <div className="task-card-topline"><span className="task-reference">FL-{task.task_number}</span>{headerAction}</div>
      <h3>{task.title}</h3>
      {task.context ? <p className="task-context">{task.context}</p> : null}
      {(taskType || task.priority || task.is_blocked) ? <div className="task-badges">{taskType ? <Badge label={taskType.name} variant="neutral" /> : null}{task.priority ? <Badge label={task.priority} variant={priorityVariant[task.priority]} /> : null}{task.is_blocked ? <Badge label="Blocked" variant="error" icon={<LockKeyhole size={12} />} /> : null}</div> : null}
      {(profilesForTask.length > 0 || dueLabel || checklist.total > 0) ? (
        <div className="task-card-footer">
          <div className="task-card-meta-left">
            <div className="avatar-stack" aria-label="Assignees">{profilesForTask.slice(0, 3).map((profile) => <span className="mini-avatar" key={profile.id} title={profile.display_name || profile.email}>{(profile.display_name || profile.email).slice(0, 1).toUpperCase()}</span>)}</div>
            {checklist.total > 0 ? <span className={checklist.completed === checklist.total ? 'task-checklist-progress complete' : 'task-checklist-progress'}><CheckSquare2 size={13} />{checklist.completed}/{checklist.total}</span> : null}
          </div>
          {dueLabel ? <span className="task-due"><CalendarDays size={14} />{dueLabel}</span> : null}
        </div>
      ) : null}
    </>
  )
}

export function TaskCard({ task, taskType, assignees, checklistItems, profiles, isReadOnly, onOpen }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: isReadOnly, data: { type: 'task', task } })
  const handle = !isReadOnly ? <button type="button" className="drag-handle-button" aria-label={`Move task ${task.title}`} onClick={(event) => event.stopPropagation()} {...listeners}><GripVertical size={16} /></button> : null
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'task-card dragging' : 'task-card'} onClick={() => { if (!isDragging) onOpen(task) }} {...attributes}><TaskCardContent task={task} taskType={taskType} assignees={assignees} checklistItems={checklistItems} profiles={profiles} headerAction={handle} /></article>
}

interface TaskCardOverlayProps { task: Task; taskType?: TaskType; assignees: TaskAssignee[]; checklistItems: ChecklistItem[]; profiles: Profile[] }

export function TaskCardOverlay({ task, taskType, assignees, checklistItems, profiles }: TaskCardOverlayProps) {
  return <article className="task-card task-card-overlay" aria-hidden="true"><TaskCardContent task={task} taskType={taskType} assignees={assignees} checklistItems={checklistItems} profiles={profiles} headerAction={<span className="drag-handle-static"><GripVertical size={16} /></span>} /></article>
}
