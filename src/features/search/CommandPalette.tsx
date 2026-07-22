import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Search, KanbanSquare, ListChecks, Users, BarChart3, Bell, FolderKanban, ArrowRight, CalendarDays } from 'lucide-react'
import type { Task, WorkspaceRole } from '../../types/domain'
import type { AppView } from '../../components/AppSidebar'
import { useWorkspaceTasks } from '../tasks/useWorkspaceTasks'

interface CommandPaletteProps {
  isOpen: boolean
  workspaceId: string
  role: WorkspaceRole | null
  onClose: () => void
  onOpenTask: (task: Task) => void
  onSelectProject: (projectId: string) => void
  onChangeView: (view: AppView) => void
  onOpenNotifications: () => void
}

export function CommandPalette({ isOpen, workspaceId, role, onClose, onOpenTask, onSelectProject, onChangeView, onOpenNotifications }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const dataQuery = useWorkspaceTasks(workspaceId)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!isOpen) return; setQuery(''); queueMicrotask(() => inputRef.current?.focus()) }, [isOpen])
  useEffect(() => { if (!isOpen) return; function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose() } window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) }, [isOpen, onClose])

  const normalized = query.trim().toLowerCase()
  const data = dataQuery.data
  const taskResults = useMemo(() => (data?.tasks ?? []).filter((task) => !normalized || `${task.title} ${task.context ?? ''} FL-${task.task_number}`.toLowerCase().includes(normalized)).slice(0, 8), [data?.tasks, normalized])
  const projectResults = useMemo(() => (data?.projects ?? []).filter((project) => !normalized || project.name.toLowerCase().includes(normalized)).slice(0, 4), [data?.projects, normalized])
  const peopleResults = useMemo(() => (data?.profiles ?? []).filter((profile) => !normalized || `${profile.display_name ?? ''} ${profile.email}`.toLowerCase().includes(normalized)).slice(0, 4), [data?.profiles, normalized])
  if (!isOpen) return null

  const commands = [
    { label: 'Open today', icon: <ListChecks size={16} />, action: () => onChangeView('today'), visible: true },
    { label: 'Open my tasks', icon: <ListChecks size={16} />, action: () => onChangeView('mine'), visible: role !== 'VIEWER' },
    { label: 'Open calendar', icon: <CalendarDays size={16} />, action: () => onChangeView('calendar'), visible: true },
    { label: 'Browse projects', icon: <FolderKanban size={16} />, action: () => onChangeView('projects'), visible: true },
    { label: 'Open all tasks', icon: <KanbanSquare size={16} />, action: () => onChangeView('all'), visible: true },
    { label: 'Open analytics', icon: <BarChart3 size={16} />, action: () => onChangeView('analytics'), visible: true },
    { label: 'Open notifications', icon: <Bell size={16} />, action: onOpenNotifications, visible: role !== 'VIEWER' },
    { label: 'Manage team', icon: <Users size={16} />, action: () => onChangeView('team'), visible: role === 'ADMIN' },
  ].filter((command) => command.visible && (!normalized || command.label.toLowerCase().includes(normalized)))

  return <div className="command-palette-backdrop" onMouseDown={onClose}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Global search and commands">
    <div className="command-search-row"><Search size={18} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, projects, people or commands…" /><kbd>Esc</kbd></div>
    <div className="command-results">{commands.length ? <CommandSection title="Commands">{commands.map((command) => <CommandRow key={command.label} icon={command.icon} title={command.label} onClick={() => { command.action(); onClose() }} />)}</CommandSection> : null}{taskResults.length ? <CommandSection title="Tasks">{taskResults.map((task) => <CommandRow key={task.id} icon={<ListChecks size={16} />} title={task.title} meta={`FL-${task.task_number}`} onClick={() => { onOpenTask(task); onClose() }} />)}</CommandSection> : null}{projectResults.length ? <CommandSection title="Projects">{projectResults.map((project) => <CommandRow key={project.id} icon={<FolderKanban size={16} />} title={project.name} onClick={() => { onSelectProject(project.id); onClose() }} />)}</CommandSection> : null}{peopleResults.length ? <CommandSection title="People">{peopleResults.map((profile) => <CommandRow key={profile.id} icon={<Users size={16} />} title={profile.display_name || profile.email} meta={profile.display_name ? profile.email : undefined} onClick={() => setQuery(profile.display_name || profile.email)} />)}</CommandSection> : null}{!dataQuery.isLoading && !commands.length && !taskResults.length && !projectResults.length && !peopleResults.length ? <div className="command-empty">No matching tasks, projects, people or commands.</div> : null}{dataQuery.isLoading ? <div className="command-empty">Searching workspace…</div> : null}</div>
    <footer className="command-footer"><span>Ctrl/⌘ K to open</span><span>Searches the current workspace</span></footer>
  </section></div>
}

function CommandSection({ title, children }: { title: string; children: ReactNode }) { return <div className="command-section"><span className="command-section-title">{title}</span><div>{children}</div></div> }
function CommandRow({ icon, title, meta, onClick }: { icon: ReactNode; title: string; meta?: string; onClick: () => void }) { return <button className="command-row" type="button" onClick={onClick}><span className="command-row-icon">{icon}</span><span className="command-row-copy"><strong>{title}</strong>{meta ? <small>{meta}</small> : null}</span><ArrowRight size={14} /></button> }
