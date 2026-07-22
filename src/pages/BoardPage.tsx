import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, FolderKanban, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { can } from '../auth/permissions'
import { AppSidebar } from '../components/AppSidebar'
import { supabase } from '../lib/supabase'
import type { Task, TaskPriority } from '../types/domain'
import { KanbanColumn } from '../features/board/KanbanColumn'
import { TaskCardOverlay } from '../features/board/TaskCard'
import { TaskFormModal } from '../features/tasks/TaskFormModal'
import { TaskDetailPanel } from '../features/tasks/TaskDetailPanel'
import { NotificationsPanel } from '../features/notifications/NotificationsPanel'
import { TeamPanel } from '../features/tasks/TeamPanel'
import { ProjectsPanel } from '../features/board/ProjectsPanel'
import { boardQueryKey, type BoardData, useBoardData } from '../features/board/useBoardData'

const priorityOptions = [
  { value: 'ALL', label: 'All priorities' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
]

export function BoardPage() {
  const { membership, memberships, selectWorkspace, role, user } = useAuth()
  const workspaceId = membership!.workspace_id
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(() => window.localStorage.getItem(`flowlane-board-${workspaceId}`))
  const boardQuery = useBoardData(workspaceId, role, selectedBoardId)
  const queryClient = useQueryClient()
  const [view, setView] = useState<'board' | 'mine' | 'projects' | 'team'>('board')
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState<TaskPriority | 'ALL'>('ALL')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [dragTasks, setDragTasks] = useState<Task[] | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 10 } }),
  )
  const isReadOnly = !can(role, 'task:move')

  useEffect(() => {
    setSelectedBoardId(window.localStorage.getItem(`flowlane-board-${workspaceId}`))
    setSelectedTask(null)
    setEditingTask(null)
    setIsTaskFormOpen(false)
  }, [workspaceId])

  useEffect(() => {
    const boardId = boardQuery.data?.board?.id
    if (!boardId) return
    window.localStorage.setItem(`flowlane-board-${workspaceId}`, boardId)
    if (selectedBoardId !== boardId) setSelectedBoardId(boardId)
  }, [boardQuery.data?.board?.id, selectedBoardId, workspaceId])

  useEffect(() => {
    const channel = supabase
      .channel(`flowlane-board-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_members' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] })
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [queryClient, workspaceId])

  const visibleTasks = useMemo(() => {
    const data = boardQuery.data
    if (!data) return []
    const tasks = dragTasks ?? data.tasks
    const normalizedSearch = search.trim().toLowerCase()
    const myTaskIds = new Set(data.assignees.filter((entry) => entry.user_id === user?.id).map((entry) => entry.task_id))

    return tasks.filter((task) => {
      if (view === 'mine' && !myTaskIds.has(task.id)) return false
      if (priority !== 'ALL' && task.priority !== priority) return false
      if (normalizedSearch && !`${task.title} ${task.context ?? ''} FL-${task.task_number}`.toLowerCase().includes(normalizedSearch)) return false
      return true
    })
  }, [boardQuery.data, dragTasks, priority, search, user?.id, view])

  useEffect(() => {
    if (role === 'VIEWER') return
    async function loadUnreadCount() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('workspace_id', workspaceId)
        .is('read_at', null)
      setUnreadCount(count ?? 0)
    }
    void loadUnreadCount()
    const channel = supabase
      .channel(`notification-count-${user!.id}-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user!.id}` }, () => void loadUnreadCount())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [role, user, workspaceId])

  function resolvePreviewPosition(tasks: Task[], activeId: string, overId: string, activeTop?: number, overTop?: number, overHeight?: number) {
    if (!boardQuery.data?.board) return null
    const targetTask = tasks.find((task) => task.id === overId)
    const targetColumn = boardQuery.data.columns.find((column) => column.id === overId)
    const columnId = targetTask?.column_id ?? targetColumn?.id
    if (!columnId) return null

    const columnTasks = tasks
      .filter((task) => task.column_id === columnId && task.id !== activeId)
      .sort((a, b) => a.position - b.position)

    if (!targetTask) {
      return { columnId, position: columnTasks.length ? columnTasks[columnTasks.length - 1].position + 1000 : 1000 }
    }

    const targetIndex = columnTasks.findIndex((task) => task.id === targetTask.id)
    const isAfter = activeTop !== undefined && overTop !== undefined && overHeight !== undefined
      ? activeTop > overTop + overHeight / 2
      : false
    const previous = isAfter ? targetTask : targetIndex > 0 ? columnTasks[targetIndex - 1] : null
    const next = isAfter ? columnTasks[targetIndex + 1] ?? null : targetTask

    if (previous && next) return { columnId, position: (previous.position + next.position) / 2 }
    if (previous) return { columnId, position: previous.position + 1000 }
    if (next) return { columnId, position: next.position / 2 }
    return { columnId, position: 1000 }
  }

  function handleDragStart(event: DragStartEvent) {
    if (isReadOnly || !boardQuery.data?.board) return
    setActiveTaskId(String(event.active.id))
    setDragTasks(boardQuery.data.tasks)
    setBoardError(null)
  }

  function handleDragOver(event: DragOverEvent) {
    if (isReadOnly || !event.over) return
    const activeId = String(event.active.id)
    const overId = String(event.over.id)
    if (activeId === overId) return

    setDragTasks((current) => {
      if (!current) return current
      const activeTop = event.active.rect.current.translated?.top
      const resolved = resolvePreviewPosition(current, activeId, overId, activeTop, event.over?.rect.top, event.over?.rect.height)
      if (!resolved) return current
      return current.map((task) => task.id === activeId ? { ...task, column_id: resolved.columnId, position: resolved.position } : task)
    })
  }

  function resetDrag() {
    setActiveTaskId(null)
    setDragTasks(null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (isReadOnly || !boardQuery.data?.board || !event.over) {
      resetDrag()
      return
    }

    const activeId = String(event.active.id)
    const originalTask = boardQuery.data.tasks.find((task) => task.id === activeId)
    const previewTask = dragTasks?.find((task) => task.id === activeId)
    if (!originalTask || !previewTask) {
      resetDrag()
      return
    }

    const previousData = boardQuery.data
    const boardId = previousData.board.id
    const nextTasks = previousData.tasks.map((task) => task.id === activeId ? previewTask : task)
    queryClient.setQueryData<BoardData>(boardQueryKey(workspaceId, boardId), { ...previousData, tasks: nextTasks })
    resetDrag()

    if (originalTask.column_id === previewTask.column_id && originalTask.position === previewTask.position) return

    const { error } = await supabase.from('tasks').update({ column_id: previewTask.column_id, position: previewTask.position }).eq('id', activeId)
    if (error) {
      queryClient.setQueryData(boardQueryKey(workspaceId, boardId), previousData)
      setBoardError(error.message)
      return
    }

    void queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] })
  }

  if (boardQuery.isLoading) return <main className="board-loading">Loading workspace…</main>
  if (boardQuery.error || !boardQuery.data) return <main className="board-loading">Unable to load the workspace.</main>

  function openTaskFromNotification(taskId: string) {
    const task = boardQuery.data?.tasks.find((entry) => entry.id === taskId) ?? null
    setSelectedTask(task)
    setIsNotificationsOpen(false)
  }

  const activeBoard = boardQuery.data.board
  const activeTask = activeTaskId ? (dragTasks ?? boardQuery.data.tasks).find((task) => task.id === activeTaskId) ?? null : null
  const boardOptions = boardQuery.data.boards.map((board) => ({ value: board.id, label: board.name }))
  const workspaceOptions = memberships.map((entry) => ({ value: entry.workspace_id, label: entry.workspace.name }))
  const hasBoard = Boolean(activeBoard)

  return (
    <div className="app-frame">
      <AppSidebar view={view} onViewChange={setView} unreadCount={unreadCount} onOpenNotifications={() => setIsNotificationsOpen(true)} />
      <main className="board-main">
        <header className="board-toolbar">
          <div className="board-heading">
            <div className="board-title-line">
              <h1>{activeBoard?.name ?? membership!.workspace.name}</h1>
              <Badge label={role ?? 'MEMBER'} variant={role === 'VIEWER' ? 'neutral' : 'blue'} />
            </div>
            <p>{view === 'mine' ? 'Tasks assigned to you' : view === 'projects' ? 'Project boards and workflow spaces' : view === 'team' ? 'Workspace members and access' : hasBoard ? 'Department workflow' : 'Workspace ready · no project required'}</p>
          </div>

          <div className="toolbar-actions">
            {memberships.length > 1 ? (
              <div className="workspace-switcher astryx-toolbar-control">
                <Selector
                  label="Workspace"
                  isLabelHidden
                  options={workspaceOptions}
                  value={workspaceId}
                  onChange={(value) => { selectWorkspace(value); setView('board') }}
                  startIcon={<Building2 size={15} />}
                  width="100%"
                />
              </div>
            ) : null}

            {view !== 'team' && view !== 'projects' && hasBoard ? (
              <>
                {boardQuery.data.boards.length > 1 ? (
                  <div className="board-switcher astryx-toolbar-control">
                    <Selector
                      label="Project board"
                      isLabelHidden
                      options={boardOptions}
                      value={activeBoard!.id}
                      onChange={(value) => { setSelectedBoardId(value); setView('board') }}
                      startIcon={<FolderKanban size={15} />}
                      width="100%"
                    />
                  </div>
                ) : null}
                <div className="search-control">
                  <TextInput label="Search tasks" isLabelHidden value={search} onChange={setSearch} placeholder="Search tasks…" startIcon={Search} hasClear />
                </div>
                <div className="priority-selector astryx-toolbar-control">
                  <Selector label="Priority" isLabelHidden options={priorityOptions} value={priority} onChange={(value) => setPriority(value as TaskPriority | 'ALL')} startIcon={<SlidersHorizontal size={15} />} width="100%" />
                </div>
                {can(role, 'task:create') ? <Button label="New task" variant="primary" icon={<Plus size={17} />} onClick={() => { setEditingTask(null); setIsTaskFormOpen(true) }} /> : null}
              </>
            ) : null}
          </div>
        </header>

        {role === 'VIEWER' && hasBoard ? <div className="viewer-banner">Read-only Viewer mode · You can inspect the live Kanban board but cannot modify workflow data.</div> : null}
        {boardError ? <div className="board-error">{boardError}</div> : null}

        {view === 'team' && role === 'ADMIN' ? (
          <div className="kanban-scroll">
            <TeamPanel workspaceId={workspaceId} profiles={boardQuery.data.profiles} members={boardQuery.data.members} onInvited={async () => { await queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] }) }} />
          </div>
        ) : view === 'projects' && role === 'ADMIN' ? (
          <div className="kanban-scroll">
            <ProjectsPanel
              workspaceId={workspaceId}
              boards={boardQuery.data.boards}
              activeBoardId={activeBoard?.id}
              onSelectBoard={(boardId) => { setSelectedBoardId(boardId); setView('board') }}
              onChanged={async () => { await queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] }) }}
            />
          </div>
        ) : !hasBoard ? (
          <div className="workspace-empty-shell">
            <div className="workspace-empty-card">
              <span className="workspace-empty-icon"><FolderKanban size={24} /></span>
              <div>
                <p className="eyebrow">Workspace ready</p>
                <h2>No projects yet</h2>
                <p>Your account and team are fully usable without a project. Create a Kanban project only when you need one.</p>
              </div>
              {role === 'ADMIN' ? <Button label="Create first project" variant="primary" icon={<Plus size={17} />} onClick={() => setView('projects')} /> : <span className="muted">An admin can create the first shared project whenever the team is ready.</span>}
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragCancel={resetDrag} onDragEnd={handleDragEnd}>
            <div className="kanban-scroll">
              <div className="kanban-grid">
                {boardQuery.data.columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    tasks={visibleTasks.filter((task) => task.column_id === column.id).sort((a, b) => a.position - b.position)}
                    taskTypes={boardQuery.data.taskTypes}
                    assignees={boardQuery.data.assignees}
                    profiles={boardQuery.data.profiles}
                    isReadOnly={isReadOnly}
                    onOpenTask={setSelectedTask}
                  />
                ))}
              </div>
            </div>
            <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
              {activeTask ? <TaskCardOverlay task={activeTask} taskType={boardQuery.data.taskTypes.find((type) => type.id === activeTask.task_type_id)} assignees={boardQuery.data.assignees} profiles={boardQuery.data.profiles} /> : null}
            </DragOverlay>
          </DndContext>
        )}

        {selectedTask ? (
          <TaskDetailPanel
            task={selectedTask}
            role={role}
            currentUserId={user!.id}
            taskType={boardQuery.data.taskTypes.find((type) => type.id === selectedTask.task_type_id)}
            assignees={boardQuery.data.assignees}
            profiles={boardQuery.data.profiles}
            members={boardQuery.data.members}
            onClose={() => setSelectedTask(null)}
            onEdit={() => { setEditingTask(selectedTask); setSelectedTask(null); setIsTaskFormOpen(true) }}
            onChanged={async () => {
              await queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] })
              const fresh = queryClient.getQueryData<BoardData>(boardQueryKey(workspaceId, activeBoard?.id))
              if (fresh) setSelectedTask(fresh.tasks.find((task) => task.id === selectedTask.id) ?? null)
            }}
          />
        ) : null}

        {isTaskFormOpen && activeBoard ? (
          <TaskFormModal
            workspaceId={workspaceId}
            boardId={activeBoard.id}
            creatorId={user!.id}
            backlogColumn={boardQuery.data.columns.find((column) => column.workflow_stage === 'BACKLOG')!}
            taskTypes={boardQuery.data.taskTypes}
            task={editingTask}
            onClose={() => { setIsTaskFormOpen(false); setEditingTask(null) }}
            onSaved={async () => { await queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] }) }}
          />
        ) : null}

        {isNotificationsOpen && role !== 'VIEWER' ? (
          <NotificationsPanel userId={user!.id} workspaceId={workspaceId} onClose={() => setIsNotificationsOpen(false)} onOpenTask={openTaskFromNotification} onUnreadCountChange={setUnreadCount} />
        ) : null}
      </main>
    </div>
  )
}
