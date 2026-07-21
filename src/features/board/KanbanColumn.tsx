import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Badge } from '@astryxdesign/core/Badge'
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

export function KanbanColumn({ column, tasks, taskTypes, assignees, profiles, isReadOnly, onOpenTask }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column', columnId: column.id } })

  return (
    <section className={isOver ? 'kanban-column over' : 'kanban-column'} ref={setNodeRef}>
      <header className="column-header">
        <div className={`column-status-dot stage-${column.workflow_stage.toLowerCase()}`} />
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
              <span>No tasks</span>
              <small>Work moved here will appear in this column.</small>
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  )
}
