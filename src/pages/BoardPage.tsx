import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { can } from '../auth/permissions'
import { AppSidebar } from '../components/AppSidebar'
import { supabase } from '../lib/supabase'
import type { Task, TaskPriority } from '../types/domain'
import { KanbanColumn } from '../features/board/KanbanColumn'
import { TaskFormModal } from '../features/tasks/TaskFormModal'
import { TaskDetailPanel } from '../features/tasks/TaskDetailPanel'
import { NotificationsPanel } from '../features/notifications/NotificationsPanel'
import { boardQueryKey, type BoardData, useBoardData } from '../features/board/useBoardData'

const priorityOptions: Array<TaskPriority | 'ALL'> = ['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW']

export function BoardPage() {
  const { membership, role, user } = useAuth()
  const workspaceId = membership!.workspace_id
  const boardQuery = useBoardData(workspaceId, role)
  const queryClient = useQueryClient()
  const [view, setView] = useState<'board' | 'mine'>('board')
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState<TaskPriority | 'ALL'>('ALL')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const isReadOnly = !can(role, 'task:move')

  useEffect(() => {
    const channel = supabase
      .channel(`flowlane-board-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        void queryClient.invalidateQueries({ queryKey: boardQueryKey(workspaceId) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, () => {
        void queryClient.invalidateQueries({ queryKey: boardQueryKey(workspaceId) })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, workspaceId])

  const filteredTasks = useMemo(() => {
    const data = boardQuery.data
    if (!data) return []
    const normalizedSearch = search.trim().toLowerCase()
    const myTaskIds = new Set(
      data.assignees.filter((entry) => entry.user_id === user?.id).map((entry) => entry.task_id),
    )

    return data.tasks.filter((task) => {
      if (view === 'mine' && !myTaskIds.has(task.id)) return false
      if (priority !== 'ALL' && task.priority !== priority) return false
      if (normalizedSearch && !`${task.title} ${task.context ?? ''} FL-${task.task_number}`.toLowerCase().includes(normalizedSearch)) return false
      return true
    })
  }, [boardQuery.data, priority, search, user?.id, view])

  async function handleDragEnd(event: DragEndEvent) {
    if (isReadOnly || !boardQuery.data || !event.over) return
    const activeId = String(event.active.id)
    const overId = String(event.over.id)
    if (activeId === overId) return

    const sourceTask = boardQuery.data.tasks.find((task) => task.id === activeId)
    if (!sourceTask) return

    const targetTask = boardQuery.data.tasks.find((task) => task.id === overId)
    const targetColumn = boardQuery.data.columns.find((column) => column.id === overId)
    const columnId = targetTask?.column_id ?? targetColumn?.id
    if (!columnId) return

    const targetTasks = boardQuery.data.tasks
      .filter((task) => task.column_id === columnId && task.id !== activeId)
      .sort((a, b) => a.position - b.position)

    let nextPosition = 1000
    if (targetTask) {
      const index = targetTasks.findIndex((task) => task.id === targetTask.id)
      const previous = index > 0 ? targetTasks[index - 1] : null
      nextPosition = previous ? (previous.position + targetTask.position) / 2 : targetTask.position / 2
    } else if (targetTasks.length > 0) {
      nextPosition = targetTasks[targetTasks.length - 1].position + 1000
    }

    const previousData = boardQuery.data
    const optimisticTasks = previousData.tasks.map((task) => task.id === activeId
      ? { ...task, column_id: columnId, position: nextPosition }
      : task)

    queryClient.setQueryData<BoardData>(boardQueryKey(workspaceId), { ...previousData, tasks: optimisticTasks })
    setBoardError(null)

    const { error } = await supabase
      .from('tasks')
      .update({ column_id: columnId, position: nextPosition })
      .eq('id', activeId)

    if (error) {
      queryClient.setQueryData(boardQueryKey(workspaceId), previousData)
      setBoardError(error.message)
      return
    }

    void queryClient.invalidateQueries({ queryKey: boardQueryKey(workspaceId) })
  }

  if (boardQuery.isLoading) return <main className="board-loading">Loading board…</main>
  if (boardQuery.error || !boardQuery.data) return <main className="board-loading">Unable to load the board.</main>

  useEffect(() => {
    if (role === 'VIEWER') return
    async function loadUnreadCount() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .is('read_at', null)
      setUnreadCount(count ?? 0)
    }
    void loadUnreadCount()
    const channel = supabase
      .channel(`notification-count-${user!.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user!.id}` }, () => void loadUnreadCount())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [role, user])

  function openTaskFromNotification(taskId: string) {
    const task = boardQuery.data?.tasks.find((entry) => entry.id === taskId) ?? null
    setSelectedTask(task)
    setIsNotificationsOpen(false)
  }

  return (
    <div className="app-frame">
      <AppSidebar view={view} onViewChange={setView} unreadCount={unreadCount} onOpenNotifications={() => setIsNotificationsOpen(true)} />
      <main className="board-main">
        <header className="board-toolbar">
          <div className="board-heading">
            <div className="board-title-line">
              <h1>{boardQuery.data.board.name}</h1>
              <Badge label={role ?? 'MEMBER'} variant={role === 'VIEWER' ? 'neutral' : 'blue'} />
            </div>
            <p>{view === 'mine' ? 'Tasks assigned to you' : 'Department workflow'}</p>
          </div>
          <div className="toolbar-actions">
            <div className="search-control">
              <TextInput
                label="Search tasks"
                isLabelHidden
                value={search}
                onChange={setSearch}
                placeholder="Search tasks…"
                startIcon={Search}
                hasClear
              />
            </div>
            <div className="select-shell">
              <SlidersHorizontal size={16} />
              <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority | 'ALL')}>
                {priorityOptions.map((option) => <option key={option} value={option}>{option === 'ALL' ? 'All priorities' : option}</option>)}
              </select>
            </div>
            {can(role, 'task:create') ? <Button label="New task" variant="primary" icon={<Plus size={17} />} onClick={() => { setEditingTask(null); setIsTaskFormOpen(true) }} /> : null}
          </div>
        </header>

        {role === 'VIEWER' ? (
          <div className="viewer-banner">Read-only Viewer mode · You can inspect the live Kanban board but cannot modify workflow data.</div>
        ) : null}
        {boardError ? <div className="board-error">{boardError}</div> : null}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="kanban-scroll">
            <div className="kanban-grid">
              {boardQuery.data.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  tasks={filteredTasks.filter((task) => task.column_id === column.id).sort((a, b) => a.position - b.position)}
                  taskTypes={boardQuery.data.taskTypes}
                  assignees={boardQuery.data.assignees}
                  profiles={boardQuery.data.profiles}
                  isReadOnly={isReadOnly}
                  onOpenTask={setSelectedTask}
                />
              ))}
            </div>
          </div>
        </DndContext>

        {selectedTask ? (
          <TaskDetailPanel
            task={selectedTask}
            role={role}
            currentUserId={user!.id}
            taskType={boardQuery.data.taskTypes.find((type) => type.id === selectedTask.task_type_id)}
            assignees={boardQuery.data.assignees}
            profiles={boardQuery.data.profiles}
            onClose={() => setSelectedTask(null)}
            onEdit={() => { setEditingTask(selectedTask); setSelectedTask(null); setIsTaskFormOpen(true) }}
            onChanged={async () => {
              await queryClient.invalidateQueries({ queryKey: boardQueryKey(workspaceId) })
              const fresh = queryClient.getQueryData<BoardData>(boardQueryKey(workspaceId))
              if (fresh) setSelectedTask(fresh.tasks.find((task) => task.id === selectedTask.id) ?? null)
            }}
          />
        ) : null}

        {isTaskFormOpen ? (
          <TaskFormModal
            workspaceId={workspaceId}
            boardId={boardQuery.data.board.id}
            creatorId={user!.id}
            backlogColumn={boardQuery.data.columns.find((column) => column.workflow_stage === 'BACKLOG')!}
            taskTypes={boardQuery.data.taskTypes}
            task={editingTask}
            onClose={() => { setIsTaskFormOpen(false); setEditingTask(null) }}
            onSaved={async () => { await queryClient.invalidateQueries({ queryKey: boardQueryKey(workspaceId) }) }}
          />
        ) : null}

        {isNotificationsOpen && role !== 'VIEWER' ? (
          <NotificationsPanel
            userId={user!.id}
            workspaceId={workspaceId}
            onClose={() => setIsNotificationsOpen(false)}
            onOpenTask={openTaskFromNotification}
            onUnreadCountChange={setUnreadCount}
          />
        ) : null}
      </main>
    </div>
  )
}
