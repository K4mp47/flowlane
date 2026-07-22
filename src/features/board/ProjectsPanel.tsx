import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { TextInput } from '@/components/ui/TextInput'
import { Check, FolderKanban, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Project, WorkspaceRole } from '../../types/domain'

interface ProjectsPanelProps {
  workspaceId: string
  projects: Project[]
  activeProjectId?: string | null
  role: WorkspaceRole | null
  onSelectProject: (projectId: string) => void
  onChanged: () => Promise<void> | void
}

export function ProjectsPanel({ workspaceId, projects, activeProjectId, role, onSelectProject, onChanged }: ProjectsPanelProps) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const isAdmin = role === 'ADMIN'
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)), [projects])

  async function createProject(event: FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name || !isAdmin) return
    setError(null); setBusyId('new')
    const { data, error: createError } = await supabase.rpc('create_project', { _workspace_id: workspaceId, _name: name })
    setBusyId(null)
    if (createError) return setError(createError.message)
    setNewName('')
    await onChanged()
    if (typeof data === 'string') onSelectProject(data)
  }

  async function saveRename(projectId: string) {
    const name = editingName.trim()
    if (!name || !isAdmin) return
    setError(null); setBusyId(projectId)
    const { error: updateError } = await supabase.from('projects').update({ name }).eq('id', projectId).eq('workspace_id', workspaceId)
    setBusyId(null)
    if (updateError) return setError(updateError.message)
    setEditingId(null); await onChanged()
  }

  async function setDefault(projectId: string) {
    if (!isAdmin) return
    setError(null); setBusyId(projectId)
    const { error: defaultError } = await supabase.rpc('set_default_project', { _workspace_id: workspaceId, _project_id: projectId })
    setBusyId(null)
    if (defaultError) return setError(defaultError.message)
    await onChanged()
  }

  async function deleteProject(projectId: string, name: string) {
    if (!isAdmin || !window.confirm(`Delete “${name}”? Projects containing tasks cannot be deleted.`)) return
    setError(null); setBusyId(projectId)
    const { error: deleteError } = await supabase.rpc('delete_project', { _workspace_id: workspaceId, _project_id: projectId })
    setBusyId(null)
    if (deleteError) return setError(deleteError.message)
    await onChanged()
  }

  return <section className="projects-page">
    <div className="projects-page-heading"><div><p className="eyebrow">Workspace projects</p><h2>Projects</h2><p className="muted">Projects own tasks and workflows. Boards are now views inside a project, not the project itself.</p></div><div className="project-count"><FolderKanban size={17} /><strong>{projects.length}</strong><span>{projects.length === 1 ? 'project' : 'projects'}</span></div></div>
    {isAdmin ? <form className="project-create-card" onSubmit={createProject}><div className="project-create-icon"><Plus size={18} /></div><div className="project-create-copy"><strong>Create a project</strong><span>A configurable workflow and default board view are created automatically.</span></div><TextInput label="Project name" isLabelHidden value={newName} onChange={setNewName} placeholder="e.g. MondoT mobile redesign" width="100%" /><Button label="Create project" variant="primary" type="submit" isLoading={busyId === 'new'} isDisabled={!newName.trim()} /></form> : null}
    {error ? <div className="inline-alert error-alert projects-error">{error}</div> : null}
    {!projects.length ? <div className="project-empty-state"><FolderKanban size={24} /><strong>No projects yet</strong><span>{isAdmin ? 'Create a project to start organizing work.' : 'An administrator can create the first project.'}</span></div> : <div className="project-list">{sortedProjects.map((project) => {
      const isActive = project.id === activeProjectId
      const isEditing = editingId === project.id
      return <div className={`project-row${isActive ? ' active' : ''}`} key={project.id}>
        <button className="project-open" type="button" onClick={() => onSelectProject(project.id)}><span className="project-board-icon"><FolderKanban size={17} /></span><span className="project-row-copy"><strong>{project.name}</strong><span>{isActive ? 'Currently open' : project.is_default ? 'Default project' : 'Project'}</span></span></button>
        {isAdmin ? <div className="project-row-actions">{project.is_default ? <span className="default-board-pill"><Check size={13} />Default</span> : <IconButton icon={<Star size={16} />} label="Make default" onClick={() => void setDefault(project.id)} />}{isEditing ? <><TextInput label="Project name" isLabelHidden value={editingName} onChange={setEditingName} width="100%" /><IconButton icon={<Check size={16} />} label="Save project name" onClick={() => void saveRename(project.id)} /><IconButton icon={<X size={16} />} label="Cancel rename" onClick={() => setEditingId(null)} /></> : <IconButton icon={<Pencil size={16} />} label="Rename project" onClick={() => { setEditingId(project.id); setEditingName(project.name) }} />}<IconButton icon={<Trash2 size={16} />} label="Delete project" onClick={() => void deleteProject(project.id, project.name)} isDisabled={busyId === project.id} /></div> : null}
      </div>
    })}</div>}
  </section>
}
