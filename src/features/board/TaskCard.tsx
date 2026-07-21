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

interface TaskCardContentProps {
  task: Task
  taskType?: TaskType
  assignees: TaskAssignee[]
  profiles: Profile[]
  showDragHandle?: boolean
}

function TaskCardContent({ task, taskType, assignees, profiles, showDragHandle = false }: TaskCardContentProps) {
  const taskProfiles = assignees
    .filter((entry) => entry.task_id === task.id)
    .map((entry) => profiles.find((profile) => profile.id === entry.user_id))
    .filter(Boolean) as Profile[]

  const dueLabel = task.due_date
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(task.due_date))
    : null

  return (
    <>
      <div className="task-card-topline">
        <span className="task-reference">FL-{task.task_number}</span>
        {showDragHandle ? (
          <span className="drag-handle-static" aria-hidden="true">
            <GripVertical size={16} />
          </span>
        ) : null}
      </div>
      <h3>{task.title}</h3>
      {task.context ? <p className="task-context">{task.context}</p> : null}
      {(taskType || task.priority || task.is_blocked) ? (
        <div className="task-badges">
          {taskType ? <Badge label={taskType.name} variant="neutral" /> : null}
          {task.priority ? <Badge label={task.priority} variant={priorityVariant[task.priority]} /> : null}
          {task.is_blocked ? <Badge label="Blocked" variant="error" icon={<LockKeyhole size={12} />} /> : null}
        </div>
      ) : null}
      {(taskProfiles.length > 0 || dueLabel) ? (
        <div className="task-card-footer">
          <div className="avatar-stack" aria-label="Assignees">
            {taskProfiles.slice(0, 3).map((profile) => (
              <span className="mini-avatar" key={profile.id} title={profile.display_name || profile.email}>
                {(profile.display_name || profile.email).slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          {dueLabel ? <span className="task-due"><CalendarDays size={14} />{dueLabel}</span> : null}
        </div>
      ) : null}
    </>
  )
}

export function TaskCard({ task, taskType, assignees, profiles, isReadOnly, onOpen }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isReadOnly,
    data: { type: 'task', task },
  })

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'task-card dragging' : 'task-card'}
      onClick={() => { if (!isDragging) onOpen(task) }}
      {...attributes}
    >
      <div className="task-card-topline">
        <span className="task-reference">FL-{task.task_number}</span>
        {!isReadOnly ? (
          <button
            type="button"
            className="drag-handle-button"
            aria-label={`Move task ${task.title}`}
            onClick={(event) => event.stopPropagation()}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        ) : null}
      </div>
      <h3>{task.title}</h3>
      {task.context ? <p className="task-context">{task.context}</p> : null}
      {(taskType || task.priority || task.is_blocked) ? (
        <div className="task-badges">
          {taskType ? <Badge label={taskType.name} variant="neutral" /> : null}
          {task.priority ? <Badge label={task.priority} variant={priorityVariant[task.priority]} /> : null}
          {task.is_blocked ? <Badge label="Blocked" variant="error" icon={<LockKeyhole size={12} />} /> : null}
        </div>
      ) : null}
      {(taskProfiles(task, assignees, profiles).length > 0 || task.due_date) ? (
        <div className="task-card-footer">
          <div className="avatar-stack" aria-label="Assignees">
            {taskProfiles(task, assignees, profiles).slice(0, 3).map((profile) => (
              <span className="mini-avatar" key={profile.id} title={profile.display_name || profile.email}>
                {(profile.display_name || profile.email).slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          {task.due_date ? (
            <span className="task-due">
              <CalendarDays size={14} />
              {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(task.due_date))}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function taskProfiles(task: Task, assignees: TaskAssignee[], profiles: Profile[]) {
  return assignees
    .filter((entry) => entry.task_id === task.id)
    .map((entry) => profiles.find((profile) => profile.id === entry.user_id))
    .filter(Boolean) as Profile[]
}

interface TaskCardOverlayProps {
  task: Task
  taskType?: TaskType
  assignees: TaskAssignee[]
  profiles: Profile[]
}

export function TaskCardOverlay({ task, taskType, assignees, profiles }: TaskCardOverlayProps) {
  return (
    <article className="task-card task-card-overlay" aria-hidden="true">
      <TaskCardContent
        task={task}
        taskType={taskType}
        assignees={assignees}
        profiles={profiles}
        showDragHandle
      />
    </article>
  )
}
