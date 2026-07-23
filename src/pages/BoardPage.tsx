import { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, closestCorners, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Selector } from '@/components/ui/Selector'
import { TextInput } from '@/components/ui/TextInput'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, FolderKanban, Plus, Search, SlidersHorizontal, UsersRound } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { can } from '../auth/permissions'
import { AppSidebar, type AppView } from '../components/AppSidebar'
import { supabase } from '../lib/supabase'
import type { Task, TaskPriority } from '../types/domain'
import { KanbanColumn } from '../features/board/KanbanColumn'
import { TaskCardOverlay } from '../features/board/TaskCard'
import { TaskFormModal } from '../features/tasks/TaskFormModal'
import { TaskDetailPanel } from '../features/tasks/TaskDetailPanel'
import { WorkspaceTaskList } from '../features/tasks/WorkspaceTaskList'
import { workspaceTasksQueryKey } from '../features/tasks/useWorkspaceTasks'
import { CalendarView } from '../features/calendar/CalendarView'
import { NotificationsPanel } from '../features/notifications/NotificationsPanel'
import { TeamPanel } from '../features/tasks/TeamPanel'
import { ProjectsPanel } from '../features/board/ProjectsPanel'
import { ProjectAnalytics } from '../features/analytics/ProjectAnalytics'
import { CommandPalette } from '../features/search/CommandPalette'
import { boardQueryKey, type BoardData, useBoardData } from '../features/board/useBoardData'

const priorityOptions = [
  { value: 'ALL', label: 'All priorities' }, { value: 'URGENT', label: 'Urgent' }, { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' },
]

export function BoardPage() {
  const { membership, memberships, selectWorkspace, role, user, profile } = useAuth()
  const workspaceId = membership!.workspace_id
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => window.localStorage.getItem(`flowlane-project-${workspaceId}`))
  const boardQuery = useBoardData(workspaceId, role, selectedProjectId)
  const queryClient = useQueryClient()
  const boardRealtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [view, setView] = useState<AppView>('board')
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState<TaskPriority | 'ALL'>('ALL')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [dragTasks, setDragTasks] = useState<Task[] | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 10 } }))
  const isReadOnly = !can(role, 'task:move')

  useEffect(() => {
    setSelectedProjectId(window.localStorage.getItem(`flowlane-project-${workspaceId}`))
    setSelectedTask(null); setEditingTask(null); setIsTaskFormOpen(false); setView('board')
  }, [workspaceId])

  useEffect(() => {
    const projectId = boardQuery.data?.project?.id
    if (!projectId) return
    window.localStorage.setItem(`flowlane-project-${workspaceId}`, projectId)
    if (selectedProjectId !== projectId) setSelectedProjectId(projectId)
  }, [boardQuery.data?.project?.id, selectedProjectId, workspaceId])

  useEffect(() => {
    const invalidateWorkspace = () => {
      void queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] })
      void queryClient.invalidateQueries({ queryKey: workspaceTasksQueryKey(workspaceId) })
    }
    const channel = supabase.channel(`flowlane-workspace-${workspaceId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'board_changed' }, invalidateWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${workspaceId}` }, invalidateWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, invalidateWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, invalidateWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `workspace_id=eq.${workspaceId}` }, invalidateWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_statuses' }, invalidateWorkspace)
      .subscribe((status) => { if (status === 'SUBSCRIBED') boardRealtimeChannelRef.current = channel })
    return () => { if (boardRealtimeChannelRef.current === channel) boardRealtimeChannelRef.current = null; void supabase.removeChannel(channel) }
  }, [queryClient, workspaceId])

  useEffect(() => {
    if (!user) return
    const channel = supabase.channel(`flowlane-presence-${workspaceId}`, { config: { presence: { key: user.id } } })
    channel.on('presence', { event: 'sync' }, () => { const state = channel.presenceState() as Record<string, Array<{ user_id?: string }>>; setOnlineUserIds(Array.from(new Set(Object.values(state).flat().map((entry) => entry.user_id).filter((id): id is string => Boolean(id))))) })
      .subscribe((status) => { if (status === 'SUBSCRIBED') void channel.track({ user_id: user.id, display_name: profile?.display_name || profile?.email || 'User', online_at: new Date().toISOString() }) })
    return () => { void supabase.removeChannel(channel) }
  }, [profile?.display_name, profile?.email, user, workspaceId])

  useEffect(() => { function handleShortcut(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setIsCommandPaletteOpen(true) } } window.addEventListener('keydown', handleShortcut); return () => window.removeEventListener('keydown', handleShortcut) }, [])

  useEffect(() => {
    const userId = user?.id
    if (role === 'VIEWER' || !userId) { setUnreadCount(0); return }
    async function loadUnreadCount() { const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId!).eq('workspace_id', workspaceId).is('read_at', null); setUnreadCount(count ?? 0) }
    void loadUnreadCount()
    const channel = supabase.channel(`notification-count-${userId}-${workspaceId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => void loadUnreadCount()).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [role, user?.id, workspaceId])

  const visibleTasks = useMemo(() => {
    const data = boardQuery.data
    if (!data) return []
    const tasks = dragTasks ?? data.tasks
    const normalizedSearch = search.trim().toLowerCase()
    return tasks.filter((task) => (priority === 'ALL' || task.priority === priority) && (!normalizedSearch || `${task.title} ${task.context ?? ''} FL-${task.task_number}`.toLowerCase().includes(normalizedSearch)))
  }, [boardQuery.data, dragTasks, priority, search])

  async function broadcastChanged(projectId?: string | null) {
    const channel = boardRealtimeChannelRef.current
    if (!channel) return
    await channel.send({ type: 'broadcast', event: 'board_changed', payload: { project_id: projectId ?? null, sent_at: new Date().toISOString() } })
  }

  function resolvePreviewPosition(tasks: Task[], activeId: string, overId: string, activeTop?: number, overTop?: number, overHeight?: number) {
    const targetTask = tasks.find((task) => task.id === overId)
    const targetColumn = boardQuery.data?.columns.find((column) => column.id === overId)
    const statusId = targetTask?.status_id ?? targetColumn?.status_id
    if (!statusId) return null
    const statusTasks = tasks.filter((task) => task.status_id === statusId && task.id !== activeId).sort((a, b) => a.position - b.position)
    if (!targetTask) return { statusId, position: statusTasks.length ? statusTasks[statusTasks.length - 1].position + 1000 : 1000 }
    const targetIndex = statusTasks.findIndex((task) => task.id === targetTask.id)
    const isAfter = activeTop !== undefined && overTop !== undefined && overHeight !== undefined ? activeTop > overTop + overHeight / 2 : false
    const previous = isAfter ? targetTask : targetIndex > 0 ? statusTasks[targetIndex - 1] : null
    const next = isAfter ? statusTasks[targetIndex + 1] ?? null : targetTask
    if (previous && next) return { statusId, position: (previous.position + next.position) / 2 }
    if (previous) return { statusId, position: previous.position + 1000 }
    if (next) return { statusId, position: next.position / 2 }
    return { statusId, position: 1000 }
  }

  function handleDragStart(event: DragStartEvent) { if (isReadOnly || !boardQuery.data?.project) return; setActiveTaskId(String(event.active.id)); setDragTasks(boardQuery.data.tasks); setBoardError(null) }
  function handleDragOver(event: DragOverEvent) {
    if (isReadOnly || !event.over) return
    const activeId = String(event.active.id), overId = String(event.over.id)
    if (activeId === overId) return
    setDragTasks((current) => {
      if (!current) return current
      const resolved = resolvePreviewPosition(current, activeId, overId, event.active.rect.current.translated?.top, event.over?.rect.top, event.over?.rect.height)
      if (!resolved) return current
      return current.map((task) => task.id === activeId ? { ...task, status_id: resolved.statusId, position: resolved.position } : task)
    })
  }
  function resetDrag() { setActiveTaskId(null); setDragTasks(null) }
  async function handleDragEnd(event: DragEndEvent) {
    const data = boardQuery.data, project = data?.project
    if (isReadOnly || !data || !project || !event.over) { resetDrag(); return }
    const activeId = String(event.active.id), originalTask = data.tasks.find((task) => task.id === activeId), previewTask = dragTasks?.find((task) => task.id === activeId)
    if (!originalTask || !previewTask) { resetDrag(); return }
    const previousData = data, nextTasks = data.tasks.map((task) => task.id === activeId ? previewTask : task)
    queryClient.setQueryData<BoardData>(boardQueryKey(workspaceId, project.id), { ...previousData, tasks: nextTasks }); resetDrag()
    if (originalTask.status_id === previewTask.status_id && originalTask.position === previewTask.position) return
    const { error } = await supabase.from('tasks').update({ status_id: previewTask.status_id, position: previewTask.position }).eq('id', activeId)
    if (error) { queryClient.setQueryData(boardQueryKey(workspaceId, project.id), previousData); setBoardError(error.message); return }
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] }), queryClient.invalidateQueries({ queryKey: workspaceTasksQueryKey(workspaceId) })]); await broadcastChanged(project.id)
  }

  function openTask(task: Task) { setSelectedProjectId(task.project_id); setView('board'); setSelectedTask(task); setIsNotificationsOpen(false) }
  function openTaskInCurrentView(task: Task) { setSelectedProjectId(task.project_id); setSelectedTask(task); setIsNotificationsOpen(false) }
  async function openTaskById(taskId: string) { const result = await supabase.from('tasks').select('id,task_number,project_id,status_id,title,context,expected_result,additional_information,task_type_id,priority,creator_id,start_date,due_date,is_blocked,blocked_reason,blocked_by_task_id,position,created_at,updated_at,completed_at').eq('id', taskId).single(); if (result.data) openTask(result.data as Task) }

  if (boardQuery.isLoading) return <main className="board-loading">Loading workspace…</main>
  if (boardQuery.error || !boardQuery.data) return <main className="board-loading">Unable to load the workspace.</main>

  const activeProject = boardQuery.data.project
  const activeTask = activeTaskId ? (dragTasks ?? boardQuery.data.tasks).find((task) => task.id === activeTaskId) ?? null : null
  const projectOptions = boardQuery.data.projects.map((project) => ({ value: project.id, label: project.name }))
  const workspaceOptions = memberships.map((entry) => ({ value: entry.workspace_id, label: entry.workspace.name }))
  const hasProject = Boolean(activeProject && boardQuery.data.board)
  const headings: Record<AppView, [string, string]> = {
    mine: ['My tasks', 'Tasks assigned to you'], calendar: ['Calendar', 'Deadlines across your workspace'],
    projects: ['Projects', 'Project containers and workflow configuration'], all: ['All tasks', 'Every task across this workspace'], board: [activeProject?.name ?? membership!.workspace.name, 'Project board'],
    analytics: ['Project analytics', 'Live delivery health across the workspace'], team: ['Team', 'Workspace members and access'],
  }
  const [heading, subtitle] = headings[view]
  const initialStatus = boardQuery.data.statuses.find((status) => status.category === 'BACKLOG') ?? boardQuery.data.statuses[0]

  return <div className="app-frame">
    <AppSidebar view={view} onViewChange={setView} unreadCount={unreadCount} onOpenNotifications={() => setIsNotificationsOpen(true)} />
    <main className="board-main"><header className="board-toolbar"><div className="board-heading"><div className="board-title-line"><h1>{heading}</h1><Badge label={role ?? 'MEMBER'} variant={role === 'VIEWER' ? 'neutral' : 'blue'} /></div><p>{subtitle}</p></div><div className="toolbar-actions"><button type="button" className="presence-pill" title={`${onlineUserIds.length} online`}><UsersRound size={15} /><span className="presence-count">{onlineUserIds.length}</span><span className="presence-label">online</span></button><Button label="Search" variant="secondary" icon={<Search size={16} />} onClick={() => setIsCommandPaletteOpen(true)} />{memberships.length > 1 ? <div className="workspace-switcher ui-toolbar-control"><Selector label="Workspace" isLabelHidden options={workspaceOptions} value={workspaceId} onChange={(value) => { selectWorkspace(value); setView('board') }} startIcon={<Building2 size={15} />} width="100%" /></div> : null}{view === 'board' && hasProject ? <>{boardQuery.data.projects.length > 1 ? <div className="board-switcher ui-toolbar-control"><Selector label="Project" isLabelHidden options={projectOptions} value={activeProject!.id} onChange={(value) => { setSelectedProjectId(value); setView('board') }} startIcon={<FolderKanban size={15} />} width="100%" /></div> : null}<div className="search-control"><TextInput label="Filter current project" isLabelHidden value={search} onChange={setSearch} placeholder="Filter this project…" startIcon={Search} hasClear /></div><div className="priority-selector ui-toolbar-control"><Selector label="Priority" isLabelHidden options={priorityOptions} value={priority} onChange={(value) => setPriority(value as TaskPriority | 'ALL')} startIcon={<SlidersHorizontal size={15} />} width="100%" /></div>{can(role, 'task:create') && initialStatus ? <Button label="New task" variant="primary" icon={<Plus size={17} />} onClick={() => { setEditingTask(null); setIsTaskFormOpen(true) }} /> : null}</> : null}</div></header>

      {boardError ? <div className="board-error">{boardError}</div> : null}
      {view === 'mine' ? <div className="kanban-scroll"><WorkspaceTaskList workspaceId={workspaceId} userId={user!.id} mode="mine" onOpenTask={openTask} /></div>
      : view === 'all' ? <div className="kanban-scroll"><WorkspaceTaskList workspaceId={workspaceId} userId={user!.id} mode="all" onOpenTask={openTask} /></div>
      : view === 'calendar' ? <div className="kanban-scroll"><CalendarView workspaceId={workspaceId} userId={user!.id} role={role} onOpenTask={openTaskInCurrentView} /></div>
      : view === 'analytics' ? <div className="kanban-scroll"><ProjectAnalytics workspaceId={workspaceId} /></div>
      : view === 'team' && role === 'ADMIN' ? <div className="kanban-scroll"><TeamPanel workspaceId={workspaceId} profiles={boardQuery.data.profiles} members={boardQuery.data.members} onInvited={async () => { await queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] }) }} /></div>
      : view === 'projects' ? <div className="kanban-scroll"><ProjectsPanel workspaceId={workspaceId} projects={boardQuery.data.projects} activeProjectId={activeProject?.id} role={role} onSelectProject={(projectId) => { setSelectedProjectId(projectId); setView('board') }} onChanged={async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] }), queryClient.invalidateQueries({ queryKey: workspaceTasksQueryKey(workspaceId) })]); await broadcastChanged(null) }} /></div>
      : !hasProject ? <div className="workspace-empty-shell"><div className="workspace-empty-card"><span className="workspace-empty-icon"><FolderKanban size={24} /></span><div><p className="eyebrow">Workspace ready</p><h2>No projects yet</h2><p>Create a project before opening a board.</p></div>{role === 'ADMIN' ? <Button label="Create first project" variant="primary" icon={<Plus size={17} />} onClick={() => setView('projects')} /> : <span className="muted">An admin can create the first project.</span>}</div></div>
      : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragCancel={resetDrag} onDragEnd={handleDragEnd}><div className="kanban-scroll"><div className="kanban-grid">{boardQuery.data.columns.map((column) => { const status = boardQuery.data.statuses.find((entry) => entry.id === column.status_id); return status ? <KanbanColumn key={column.id} column={column} status={status} tasks={visibleTasks.filter((task) => task.status_id === status.id).sort((a, b) => a.position - b.position)} taskTypes={boardQuery.data.taskTypes} assignees={boardQuery.data.assignees} checklistItems={boardQuery.data.checklistItems} profiles={boardQuery.data.profiles} isReadOnly={isReadOnly} onOpenTask={setSelectedTask} /> : null })}</div></div><DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>{activeTask ? <TaskCardOverlay task={activeTask} taskType={boardQuery.data.taskTypes.find((type) => type.id === activeTask.task_type_id)} assignees={boardQuery.data.assignees} checklistItems={boardQuery.data.checklistItems} profiles={boardQuery.data.profiles} /> : null}</DragOverlay></DndContext>}

      {selectedTask ? <TaskDetailPanel task={selectedTask} role={role} currentUserId={user!.id} taskType={boardQuery.data.taskTypes.find((type) => type.id === selectedTask.task_type_id)} assignees={boardQuery.data.assignees} profiles={boardQuery.data.profiles} members={boardQuery.data.members} onClose={() => setSelectedTask(null)} onEdit={() => { setEditingTask(selectedTask); setSelectedTask(null); setIsTaskFormOpen(true) }} onChanged={async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] }), queryClient.invalidateQueries({ queryKey: workspaceTasksQueryKey(workspaceId) })]); await broadcastChanged(selectedTask.project_id) }} /> : null}
      {isTaskFormOpen && activeProject && initialStatus ? <TaskFormModal projectId={activeProject.id} creatorId={user!.id} initialStatus={initialStatus} statuses={boardQuery.data.statuses} taskTypes={boardQuery.data.taskTypes} task={editingTask} onClose={() => { setIsTaskFormOpen(false); setEditingTask(null) }} onSaved={async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['boardData', workspaceId] }), queryClient.invalidateQueries({ queryKey: workspaceTasksQueryKey(workspaceId) })]); await broadcastChanged(activeProject.id) }} /> : null}
      {isNotificationsOpen && role !== 'VIEWER' ? <NotificationsPanel userId={user!.id} workspaceId={workspaceId} onClose={() => setIsNotificationsOpen(false)} onOpenTask={(taskId) => void openTaskById(taskId)} onUnreadCountChange={setUnreadCount} /> : null}
      <CommandPalette isOpen={isCommandPaletteOpen} workspaceId={workspaceId} role={role} onClose={() => setIsCommandPaletteOpen(false)} onOpenTask={openTask} onSelectProject={(projectId) => { setSelectedProjectId(projectId); setView('board') }} onChangeView={setView} onOpenNotifications={() => setIsNotificationsOpen(true)} />
    </main>
  </div>
}
