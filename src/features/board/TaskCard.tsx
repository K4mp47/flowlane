import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@astryxdesign/core/Badge'
import { CalendarDays, GripVertical, LockKeyhole } from 'lucide-react'
import type { Profile, Task, TaskAssignee, TaskPriority, TaskType } from '../../types/domain'

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
  profiles: Profile[]
  isReadOnly: boolean
  onOpen: (task: Task) => void
}

export function TaskCard({ task, taskType, assignees, profiles, isReadOnly, onOpen }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isReadOnly,
    data: { type: 'task', task },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const taskProfiles = assignees
    .filter((entry) => entry.task_id === task.id)
    .map((entry) => profiles.find((profile) => profile.id === entry.user_id))
    .filter(Boolean) as Profile[]

  const dueLabel = task.due_date
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(task.due_date))
    : null

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'task-card dragging' : 'task-card'}
      onClick={() => onOpen(task)}
      {...attributes}
      {...listeners}
    >
      <div className="task-card-topline">
        <span className="task-reference">FL-{task.task_number}</span>
        {!isReadOnly ? <GripVertical className="drag-handle" size={16} /> : null}
      </div>
      <h3>{task.title}</h3>
      {task.context ? <p className="task-context">{task.context}</p> : <p className="task-context empty-copy">No context yet</p>}
      <div className="task-badges">
        {taskType ? <Badge label={taskType.name} variant="neutral" /> : null}
        {task.priority ? <Badge label={task.priority} variant={priorityVariant[task.priority]} /> : null}
        {task.is_blocked ? <Badge label="Blocked" variant="error" icon={<LockKeyhole size={12} />} /> : null}
      </div>
      <div className="task-card-footer">
        <div className="avatar-stack" aria-label="Assignees">
          {taskProfiles.length > 0 ? taskProfiles.slice(0, 3).map((profile) => (
            <span className="mini-avatar" key={profile.id} title={profile.display_name || profile.email}>
              {(profile.display_name || profile.email).slice(0, 1).toUpperCase()}
            </span>
          )) : <span className="unassigned-label">Unassigned</span>}
        </div>
        {dueLabel ? <span className="task-due"><CalendarDays size={14} />{dueLabel}</span> : null}
      </div>
    </article>
  )
}
