import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, KanbanSquare, ListChecks, Users, BarChart3, Bell, FolderKanban, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Board, Profile, Task } from '../../types/domain'

type ViewName = 'board' | 'mine' | 'projects' | 'team' | 'analytics'

interface CommandPaletteProps {
  isOpen: boolean
  workspaceId: string
  onClose: () => void
  onOpenTask: (task: Task) => void
  onSelectBoard: (boardId: string) => void
  onChangeView: (view: ViewName) => void
  onOpenNotifications: () => void
}

interface SearchData {
  tasks: Task[]
  boards: Board[]
  profiles: Profile[]
}

export function CommandPalette({ isOpen, workspaceId, onClose, onOpenTask, onSelectBoard, onChangeView, onOpenNotifications }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [data, setData] = useState<SearchData>({ tasks: [], boards: [], profiles: [] })
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    queueMicrotask(() => inputRef.current?.focus())
    let active = true
    async function load() {
      setIsLoading(true)
      const [tasksResult, boardsResult, membersResult] = await Promise.all([
        supabase.from('tasks').select('*').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(200),
        supabase.from('boards').select('id,workspace_id,name,is_default').eq('workspace_id', workspaceId).order('name'),
        supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId),
      ])
      if (!active) return
      const memberIds = (membersResult.data ?? []).map((row) => row.user_id)
      let profiles: Profile[] = []
      if (memberIds.length) {
        const profilesResult = await supabase.from('profiles').select('id,email,display_name,avatar_url').in('id', memberIds)
        profiles = (profilesResult.data ?? []) as Profile[]
      }
      setData({
        tasks: (tasksResult.data ?? []) as Task[],
        boards: (boardsResult.data ?? []) as Board[],
        profiles,
      })
      setIsLoading(false)
    }
    void load()
    return () => { active = false }
  }, [isOpen, workspaceId])

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const normalized = query.trim().toLowerCase()
  const taskResults = useMemo(() => data.tasks.filter((task) => !normalized || `${task.title} ${task.context ?? ''} FL-${task.task_number}`.toLowerCase().includes(normalized)).slice(0, 8), [data.tasks, normalized])
  const boardResults = useMemo(() => data.boards.filter((board) => !normalized || board.name.toLowerCase().includes(normalized)).slice(0, 4), [data.boards, normalized])
  const peopleResults = useMemo(() => data.profiles.filter((profile) => !normalized || `${profile.display_name ?? ''} ${profile.email}`.toLowerCase().includes(normalized)).slice(0, 4), [data.profiles, normalized])

  if (!isOpen) return null

  const commands = [
    { label: 'Go to board', icon: <KanbanSquare size={16} />, action: () => onChangeView('board') },
    { label: 'Open my tasks', icon: <ListChecks size={16} />, action: () => onChangeView('mine') },
    { label: 'Open analytics', icon: <BarChart3 size={16} />, action: () => onChangeView('analytics') },
    { label: 'Open notifications', icon: <Bell size={16} />, action: onOpenNotifications },
    { label: 'Manage projects', icon: <FolderKanban size={16} />, action: () => onChangeView('projects') },
    { label: 'Manage team', icon: <Users size={16} />, action: () => onChangeView('team') },
  ].filter((command) => !normalized || command.label.toLowerCase().includes(normalized))

  return (
    <div className="command-palette-backdrop" onMouseDown={onClose}>
      <section className="command-palette" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Global search and commands">
        <div className="command-search-row">
          <Search size={18} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, projects, people or commands…" />
          <kbd>Esc</kbd>
        </div>
        <div className="command-results">
          {commands.length ? <CommandSection title="Commands">{commands.map((command) => <CommandRow key={command.label} icon={command.icon} title={command.label} onClick={() => { command.action(); onClose() }} />)}</CommandSection> : null}
          {taskResults.length ? <CommandSection title="Tasks">{taskResults.map((task) => <CommandRow key={task.id} icon={<ListChecks size={16} />} title={task.title} meta={`FL-${task.task_number}`} onClick={() => { onOpenTask(task); onClose() }} />)}</CommandSection> : null}
          {boardResults.length ? <CommandSection title="Projects">{boardResults.map((board) => <CommandRow key={board.id} icon={<FolderKanban size={16} />} title={board.name} onClick={() => { onSelectBoard(board.id); onClose() }} />)}</CommandSection> : null}
          {peopleResults.length ? <CommandSection title="People">{peopleResults.map((profile) => <CommandRow key={profile.id} icon={<Users size={16} />} title={profile.display_name || profile.email} meta={profile.display_name ? profile.email : undefined} onClick={() => { setQuery(profile.display_name || profile.email) }} />)}</CommandSection> : null}
          {!isLoading && !commands.length && !taskResults.length && !boardResults.length && !peopleResults.length ? <div className="command-empty">No matching tasks, projects, people or commands.</div> : null}
          {isLoading ? <div className="command-empty">Searching workspace…</div> : null}
        </div>
        <footer className="command-footer"><span>Ctrl/⌘ K to open</span><span>Searches the current workspace</span></footer>
      </section>
    </div>
  )
}

function CommandSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="command-section"><span className="command-section-title">{title}</span><div>{children}</div></div>
}

function CommandRow({ icon, title, meta, onClick }: { icon: React.ReactNode; title: string; meta?: string; onClick: () => void }) {
  return <button className="command-row" type="button" onClick={onClick}><span className="command-row-icon">{icon}</span><span className="command-row-copy"><strong>{title}</strong>{meta ? <small>{meta}</small> : null}</span><ArrowRight size={14} /></button>
}
