import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { TextInput } from '@/components/ui/TextInput'
import { ArrowRight, Check, FolderKanban, KanbanSquare, ListChecks, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Board, Project, WorkspaceRole } from '../../types/domain'

interface ProjectsPanelProps {
  workspaceId: string
  projects: Project[]
  boards: Board[]
  activeProjectId?: string | null
  activeBoardId?: string | null
  workspaceRole: WorkspaceRole | null
  accessRole: WorkspaceRole | null
  onSelectProject: (projectId: string) => void
  onSelectBoard: (boardId: string) => void
  onChanged: () => Promise<void> | void
}

export function ProjectsPanel({ workspaceId, projects, boards, activeProjectId, activeBoardId, workspaceRole, accessRole, onSelectProject, onSelectBoard, onChanged }: ProjectsPanelProps) {
  const [newName, setNewName] = useState('')
  const [newBoardName, setNewBoardName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const canCreateProject = Boolean(workspaceRole)
  const canSetWorkspaceDefault = workspaceRole === 'ADMIN'
  const canManageProject = accessRole === 'ADMIN'
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)), [projects])
  const sortedBoards = useMemo(() => [...boards].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)), [boards])

  async function createProject(event: FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name || !canCreateProject) return
    setError(null)
    setBusyId('new-project')
    const { data, error: createError } = await supabase.rpc('create_project', { _workspace_id: workspaceId, _name: name })
    setBusyId(null)
    if (createError) return setError(createError.message)
    setNewName('')
    await onChanged()
    if (typeof data === 'string') onSelectProject(data)
  }

  async function createBoard(event: FormEvent) {
    event.preventDefault()
    const name = newBoardName.trim()
    if (!name || !activeProjectId || !canManageProject) return
    setError(null)
    setBusyId('new-board')
    const { data, error: createError } = await supabase.rpc('create_board', { _project_id: activeProjectId, _name: name })
    setBusyId(null)
    if (createError) return setError(createError.message)
    setNewBoardName('')
    await onChanged()
    if (typeof data === 'string') onSelectBoard(data)
  }

  async function saveRename(projectId: string) {
    const name = editingName.trim()
    if (!name || !canManageProject) return
    setError(null)
    setBusyId(projectId)
    const { error: updateError } = await supabase.from('projects').update({ name }).eq('id', projectId)
    setBusyId(null)
    if (updateError) return setError(updateError.message)
    setEditingId(null)
    await onChanged()
  }

  async function setDefault(projectId: string) {
    if (!canSetWorkspaceDefault) return
    setError(null)
    setBusyId(projectId)
    const { error: defaultError } = await supabase.rpc('set_default_project', { _workspace_id: workspaceId, _project_id: projectId })
    setBusyId(null)
    if (defaultError) return setError(defaultError.message)
    await onChanged()
  }

  async function deleteProject(projectId: string, name: string) {
    if (!canManageProject || !window.confirm(`Delete “${name}” and every board and task inside it? This cannot be undone.`)) return
    setError(null)
    setBusyId(projectId)
    const { error: deleteError } = await supabase.rpc('delete_project', { _workspace_id: workspaceId, _project_id: projectId })
    setBusyId(null)
    if (deleteError) return setError(deleteError.message)
    await onChanged()
  }

  async function setDefaultBoard(boardId: string) {
    if (!activeProjectId || !canManageProject) return
    setError(null)
    setBusyId(boardId)
    const { error: defaultError } = await supabase.rpc('set_default_board', { _project_id: activeProjectId, _board_id: boardId })
    setBusyId(null)
    if (defaultError) return setError(defaultError.message)
    await onChanged()
  }

  async function deleteBoard(boardId: string, name: string) {
    if (!activeProjectId || !canManageProject || !window.confirm(`Delete board “${name}”? The board must be empty first.`)) return
    setError(null)
    setBusyId(boardId)
    const { error: deleteError } = await supabase.rpc('delete_board', { _project_id: activeProjectId, _board_id: boardId })
    setBusyId(null)
    if (deleteError) return setError(deleteError.message)
    await onChanged()
  }

  return <section className="projects-page mvp-projects-page">
    <div className="projects-page-heading mvp-hierarchy-heading">
      <div>
        <p className="eyebrow">Work structure</p>
        <h2>Projects, boards, tasks</h2>
        <p className="muted">Keep the structure predictable: projects contain boards, and every task belongs to exactly one board.</p>
      </div>
      <div className="project-count"><FolderKanban size={17} /><strong>{projects.length}</strong><span>{projects.length === 1 ? 'project' : 'projects'}</span></div>
    </div>

    <div className="mvp-hierarchy-map" aria-label="FlowLane hierarchy">
      <div className="mvp-hierarchy-step"><span><FolderKanban size={18} /></span><div><small>Level 1</small><strong>Project</strong><p>Top-level container for one initiative or client.</p></div></div>
      <ArrowRight className="mvp-hierarchy-arrow" size={18} />
      <div className="mvp-hierarchy-step"><span><KanbanSquare size={18} /></span><div><small>Level 2</small><strong>Board</strong><p>A focused workflow inside a project.</p></div></div>
      <ArrowRight className="mvp-hierarchy-arrow" size={18} />
      <div className="mvp-hierarchy-step"><span><ListChecks size={18} /></span><div><small>Level 3</small><strong>Task</strong><p>The actual unit of work, owned by one board.</p></div></div>
    </div>

    {canCreateProject ? <form className="project-create-card mvp-create-card" onSubmit={createProject}>
      <div className="project-create-icon"><Plus size={18} /></div>
      <div className="project-create-copy"><strong>Create a project</strong><span>A new project starts with one Main Board and an empty task list.</span></div>
      <TextInput label="Project name" isLabelHidden value={newName} onChange={setNewName} placeholder="Project name" width="100%" />
      <Button label="Create project" variant="primary" type="submit" isLoading={busyId === 'new-project'} isDisabled={!newName.trim()} />
    </form> : null}

    {error ? <div className="inline-alert error-alert projects-error">{error}</div> : null}

    {!projects.length ? <div className="project-empty-state mvp-empty-projects">
      <span className="workspace-empty-icon"><FolderKanban size={24} /></span>
      <div><strong>No projects yet</strong><span>Start clean by creating the first project. Its Main Board will be ready immediately.</span></div>
    </div> : <div className="mvp-project-browser">
      <div className="mvp-project-list" aria-label="Projects">
        <div className="mvp-section-label"><span>Projects</span><small>{projects.length}</small></div>
        {sortedProjects.map((project) => {
          const isActive = project.id === activeProjectId
          const isEditing = editingId === project.id
          return <div className={`project-row mvp-project-row${isActive ? ' active' : ''}`} key={project.id}>
            <button className="project-open" type="button" onClick={() => onSelectProject(project.id)}>
              <span className="project-board-icon"><FolderKanban size={17} /></span>
              <span className="project-row-copy"><strong>{project.name}</strong><span>{isActive ? 'Selected project' : project.is_default ? 'Default project' : 'Project'}</span></span>
            </button>
            {isActive && canManageProject ? <div className="project-row-actions">
              {project.is_default ? <span className="default-board-pill"><Check size={13} />Default</span> : canSetWorkspaceDefault ? <IconButton icon={<Star size={16} />} label="Make default project" onClick={() => void setDefault(project.id)} /> : null}
              {isEditing ? <>
                <TextInput label="Project name" isLabelHidden value={editingName} onChange={setEditingName} width="100%" />
                <IconButton icon={<Check size={16} />} label="Save project name" onClick={() => void saveRename(project.id)} />
                <IconButton icon={<X size={16} />} label="Cancel rename" onClick={() => setEditingId(null)} />
              </> : <IconButton icon={<Pencil size={16} />} label="Rename project" onClick={() => { setEditingId(project.id); setEditingName(project.name) }} />}
              <IconButton icon={<Trash2 size={16} />} label="Delete project" onClick={() => void deleteProject(project.id, project.name)} isDisabled={busyId === project.id} />
            </div> : null}
          </div>
        })}
      </div>

      <div className="mvp-board-panel">
        <div className="mvp-board-panel-heading">
          <div><span className="mvp-section-label-text">Boards</span><h3>{activeProject?.name ?? 'Select a project'}</h3><p>{activeProject ? 'Choose the board whose tasks you want to work with.' : 'Select a project to see its boards.'}</p></div>
          {activeProject ? <span className="mvp-path-chip"><FolderKanban size={13} />{activeProject.name}<ArrowRight size={12} /><KanbanSquare size={13} />Boards</span> : null}
        </div>

        {activeProjectId && canManageProject ? <form className="mvp-board-create" onSubmit={createBoard}>
          <TextInput label="Board name" isLabelHidden value={newBoardName} onChange={setNewBoardName} placeholder="New board name" width="100%" />
          <Button label="Add board" variant="secondary" type="submit" icon={<Plus size={15} />} isLoading={busyId === 'new-board'} isDisabled={!newBoardName.trim()} />
        </form> : null}

        {activeProjectId ? <div className="mvp-board-list">
          {sortedBoards.map((board) => <div className={`project-row mvp-board-row${board.id === activeBoardId ? ' active' : ''}`} key={board.id}>
            <button className="project-open" type="button" onClick={() => onSelectBoard(board.id)}>
              <span className="project-board-icon"><KanbanSquare size={17} /></span>
              <span className="project-row-copy"><strong>{board.name}</strong><span>{board.id === activeBoardId ? 'Open board' : board.is_default ? 'Default board' : 'Board'}</span></span>
            </button>
            {canManageProject ? <div className="project-row-actions">
              {board.is_default ? <span className="default-board-pill"><Check size={13} />Default</span> : <IconButton icon={<Star size={16} />} label="Make default board" onClick={() => void setDefaultBoard(board.id)} />}
              <IconButton icon={<Trash2 size={16} />} label="Delete board" onClick={() => void deleteBoard(board.id, board.name)} isDisabled={busyId === board.id} />
            </div> : null}
          </div>)}
          {!sortedBoards.length ? <div className="mvp-board-empty"><KanbanSquare size={20} /><strong>No boards</strong><span>Create a board before adding tasks.</span></div> : null}
        </div> : null}
      </div>
    </div>}
  </section>
}
