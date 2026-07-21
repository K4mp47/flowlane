import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Badge } from '@astryxdesign/core/Badge'
import { CircleCheckBig, CircleDotDashed, Clock3, LoaderCircle, ScanSearch } from 'lucide-react'
import type { BoardColumn, Profile, Task, TaskAssignee, TaskType } from '../../types/domain'
import { TaskCard } from './TaskCard'

interface KanbanColumnProps {
  column: BoardColumn
  tasks: Task[]
  taskTypes: TaskType[]
  assignees: TaskAssignee[]
  profiles: Profile[]
  isReadOnly: boolean
  onOpenTask: (task: Task) => void
}

const stageIcon = {
  BACKLOG: CircleDotDashed,
  TODO: Clock3,
  IN_PROGRESS: LoaderCircle,
  REVIEW: ScanSearch,
  DONE: CircleCheckBig,
} as const

export function KanbanColumn({ column, tasks, taskTypes, assignees, profiles, isReadOnly, onOpenTask }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column', columnId: column.id } })
  const StageIcon = stageIcon[column.workflow_stage]
  const stageClass = `stage-${column.workflow_stage.toLowerCase().replace('_', '-')}`

  return (
    <section className={isOver ? `kanban-column over ${stageClass}` : `kanban-column ${stageClass}`} data-stage={column.workflow_stage} ref={setNodeRef}>
      <header className="column-header">
        <span className="column-stage-icon" aria-hidden="true"><StageIcon size={15} /></span>
        <strong>{column.name}</strong>
        <Badge label={String(tasks.length)} variant="neutral" />
      </header>
      <div className="column-rule" />
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="column-tasks">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              taskType={taskTypes.find((type) => type.id === task.task_type_id)}
              assignees={assignees}
              profiles={profiles}
              isReadOnly={isReadOnly}
              onOpen={onOpenTask}
            />
          ))}
          {tasks.length === 0 ? (
            <div className="empty-column">
              <span className="empty-column-icon"><StageIcon size={18} /></span>
              <span>No tasks</span>
              <small>Drop work here to move it into {column.name}.</small>
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  )
}