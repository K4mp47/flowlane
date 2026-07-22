import { useDndContext, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Badge } from '@astryxdesign/core/Badge'
import { Ban, CircleCheckBig, CircleDotDashed, Clock3, LoaderCircle } from 'lucide-react'
import type { BoardColumn, ChecklistItem, Profile, Task, TaskAssignee, TaskType, WorkflowStatus } from '../../types/domain'
import { TaskCard } from './TaskCard'

interface KanbanColumnProps {
  column: BoardColumn
  status: WorkflowStatus
  tasks: Task[]
  taskTypes: TaskType[]
  assignees: TaskAssignee[]
  checklistItems: ChecklistItem[]
  profiles: Profile[]
  isReadOnly: boolean
  onOpenTask: (task: Task) => void
}

const categoryIcon = {
  BACKLOG: CircleDotDashed,
  UNSTARTED: Clock3,
  STARTED: LoaderCircle,
  COMPLETED: CircleCheckBig,
  CANCELED: Ban,
} as const

export function KanbanColumn({ column, status, tasks, taskTypes, assignees, checklistItems, profiles, isReadOnly, onOpenTask }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column', columnId: column.id, statusId: status.id } })
  const { active, over } = useDndContext()
  const StatusIcon = categoryIcon[status.category]
  const stageClass = `stage-${status.category.toLowerCase()}`
  const overData = over?.data.current as { type?: string; statusId?: string; task?: Task } | undefined
  const overStatusId = overData?.type === 'task' ? overData.task?.status_id : overData?.statusId
  const highlighted = Boolean(active) && (isOver || overStatusId === status.id)

  return <section className={highlighted ? `kanban-column over ${stageClass}` : `kanban-column ${stageClass}`} data-stage={status.category} ref={setNodeRef}>
    <header className="column-header"><span className="column-stage-icon" aria-hidden="true"><StatusIcon size={15} /></span><strong>{status.name}</strong><Badge label={String(tasks.length)} variant="neutral" /></header>
    <div className="column-rule" />
    <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}><div className="column-tasks">
      {tasks.map((task) => <TaskCard key={task.id} task={task} taskType={taskTypes.find((type) => type.id === task.task_type_id)} assignees={assignees} checklistItems={checklistItems} profiles={profiles} isReadOnly={isReadOnly} onOpen={onOpenTask} />)}
      {!tasks.length ? <div className="empty-column"><span className="empty-column-icon"><StatusIcon size={18} /></span><span>No tasks</span><small>Drop work here to move it into {status.name}.</small></div> : null}
    </div></SortableContext>
  </section>
}
