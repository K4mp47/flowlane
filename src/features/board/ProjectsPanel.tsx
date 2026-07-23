import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { TextInput } from '@/components/ui/TextInput'
import { Check, FolderKanban, KanbanSquare, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
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
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)), [projects])
  const sortedBoards = useMemo(() => [...boards].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)), [boards])

  async function createProject(event: FormEvent) {
    event.preventDefault(); const name = newName.trim(); if (!name || !canCreateProject) return
    setError(null); setBusyId('new-project')
    const { data, error: createError } = await supabase.rpc('create_project', { _workspace_id: workspaceId, _name: name })
    setBusyId(null); if (createError) return setError(createError.message)
    setNewName(''); await onChanged(); if (typeof data === 'string') onSelectProject(data)
  }

  async function createBoard(event: FormEvent) {
    event.preventDefault(); const name = newBoardName.trim(); if (!name || !activeProjectId || !canManageProject) return
    setError(null); setBusyId('new-board')
    const { data, error: createError } = await supabase.rpc('create_board', { _project_id: activeProjectId, _name: name })
    setBusyId(null); if (createError) return setError(createError.message)
    setNewBoardName(''); await onChanged(); if (typeof data === 'string') onSelectBoard(data)
  }

  async function saveRename(projectId: string) { const name = editingName.trim(); if (!name || !canManageProject) return; setError(null); setBusyId(projectId); const { error: updateError } = await supabase.from('projects').update({ name }).eq('id', projectId); setBusyId(null); if (updateError) return setError(updateError.message); setEditingId(null); await onChanged() }
  async function setDefault(projectId: string) { if (!canSetWorkspaceDefault) return; setError(null); setBusyId(projectId); const { error: defaultError } = await supabase.rpc('set_default_project', { _workspace_id: workspaceId, _project_id: projectId }); setBusyId(null); if (defaultError) return setError(defaultError.message); await onChanged() }
  async function deleteProject(projectId: string, name: string) { if (!canManageProject || !window.confirm(`Delete “${name}” and all of its boards and tasks? This cannot be undone.`)) return; setError(null); setBusyId(projectId); const { error: deleteError } = await supabase.rpc('delete_project', { _workspace_id: workspaceId, _project_id: projectId }); setBusyId(null); if (deleteError) return setError(deleteError.message); await onChanged() }
  async function setDefaultBoard(boardId: string) { if (!activeProjectId || !canManageProject) return; setError(null); setBusyId(boardId); const { error } = await supabase.rpc('set_default_board', { _project_id: activeProjectId, _board_id: boardId }); setBusyId(null); if (error) return setError(error.message); await onChanged() }
  async function deleteBoard(boardId: string, name: string) { if (!activeProjectId || !canManageProject || !window.confirm(`Delete board “${name}”? It must be empty first.`)) return; setError(null); setBusyId(boardId); const { error } = await supabase.rpc('delete_board', { _project_id: activeProjectId, _board_id: boardId }); setBusyId(null); if (error) return setError(error.message); await onChanged() }

  return <section className="projects-page">
    <div className="projects-page-heading"><div><p className="eyebrow">Project hierarchy</p><h2>Projects & boards</h2><p className="muted">A project can contain multiple boards. Access can be granted to the whole project or to a single board.</p></div><div className="project-count"><FolderKanban size={17} /><strong>{projects.length}</strong><span>{projects.length === 1 ? 'project' : 'projects'}</span></div></div>
    {canCreateProject ? <form className="project-create-card" onSubmit={createProject}><div className="project-create-icon"><Plus size={18} /></div><div className="project-create-copy"><strong>Create a project</strong><span>Every member can create projects. You become the admin of projects you create.</span></div><TextInput label="Project name" isLabelHidden value={newName} onChange={setNewName} placeholder="e.g. MondoT mobile redesign" width="100%" /><Button label="Create project" variant="primary" type="submit" isLoading={busyId === 'new-project'} isDisabled={!newName.trim()} /></form> : null}
    {error ? <div className="inline-alert error-alert projects-error">{error}</div> : null}
    {!projects.length ? <div className="project-empty-state"><FolderKanban size={24} /><strong>No projects yet</strong><span>{canCreateProject ? 'Create your first project when you are ready.' : 'You have not been invited to a project yet.'}</span></div> : <div className="project-list">{sortedProjects.map((project) => { const isActive = project.id === activeProjectId; const isEditing = editingId === project.id; return <div className={`project-row${isActive ? ' active' : ''}`} key={project.id}><button className="project-open" type="button" onClick={() => onSelectProject(project.id)}><span className="project-board-icon"><FolderKanban size={17} /></span><span className="project-row-copy"><strong>{project.name}</strong><span>{isActive ? 'Currently open' : project.is_default ? 'Workspace default' : 'Project'}</span></span></button>{isActive && canManageProject ? <div className="project-row-actions">{project.is_default ? <span className="default-board-pill"><Check size={13} />Default</span> : canSetWorkspaceDefault ? <IconButton icon={<Star size={16} />} label="Make workspace default" onClick={() => void setDefault(project.id)} /> : null}{isEditing ? <><TextInput label="Project name" isLabelHidden value={editingName} onChange={setEditingName} width="100%" /><IconButton icon={<Check size={16} />} label="Save project name" onClick={() => void saveRename(project.id)} /><IconButton icon={<X size={16} />} label="Cancel rename" onClick={() => setEditingId(null)} /></> : <IconButton icon={<Pencil size={16} />} label="Rename project" onClick={() => { setEditingId(project.id); setEditingName(project.name) }} />}<IconButton icon={<Trash2 size={16} />} label="Delete project" onClick={() => void deleteProject(project.id, project.name)} isDisabled={busyId === project.id} /></div> : null}</div> })}</div>}
    {activeProjectId ? <div className="project-create-card" style={{ marginTop: 18 }}><div className="project-create-icon"><KanbanSquare size={18} /></div><div className="project-create-copy"><strong>Boards in this project</strong><span>Each board owns its own tasks while sharing the project workflow.</span></div>{canManageProject ? <form style={{ display: 'contents' }} onSubmit={createBoard}><TextInput label="Board name" isLabelHidden value={newBoardName} onChange={setNewBoardName} placeholder="e.g. Backend" width="100%" /><Button label="Add board" variant="secondary" type="submit" isLoading={busyId === 'new-board'} isDisabled={!newBoardName.trim()} /></form> : null}</div> : null}
    {activeProjectId ? <div className="project-list">{sortedBoards.map((board) => <div className={`project-row${board.id === activeBoardId ? ' active' : ''}`} key={board.id}><button className="project-open" type="button" onClick={() => onSelectBoard(board.id)}><span className="project-board-icon"><KanbanSquare size={17} /></span><span className="project-row-copy"><strong>{board.name}</strong><span>{board.is_default ? 'Default board' : 'Board'}</span></span></button>{canManageProject ? <div className="project-row-actions">{board.is_default ? <span className="default-board-pill"><Check size={13} />Default</span> : <IconButton icon={<Star size={16} />} label="Make default board" onClick={() => void setDefaultBoard(board.id)} />}<IconButton icon={<Trash2 size={16} />} label="Delete board" onClick={() => void deleteBoard(board.id, board.name)} isDisabled={busyId === board.id} /></div> : null}</div>)}</div> : null}
  </section>
}
