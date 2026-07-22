import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Check, FolderKanban, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Board } from '../../types/domain'

interface ProjectsPanelProps {
  workspaceId: string
  boards: Board[]
  activeBoardId?: string | null
  onSelectBoard: (boardId: string) => void
  onChanged: () => Promise<void> | void
}

export function ProjectsPanel({ workspaceId, boards, activeBoardId, onSelectBoard, onChanged }: ProjectsPanelProps) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const sortedBoards = useMemo(() => [...boards].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)), [boards])

  async function createBoard(event: FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError(null)
    setBusyId('new')
    const { data, error: createError } = await supabase.rpc('create_project_board', {
      _workspace_id: workspaceId,
      _name: name,
    })
    setBusyId(null)
    if (createError) return setError(createError.message)
    setNewName('')
    await onChanged()
    if (typeof data === 'string') onSelectBoard(data)
  }

  async function saveRename(boardId: string) {
    const name = editingName.trim()
    if (!name) return
    setError(null)
    setBusyId(boardId)
    const { error: updateError } = await supabase
      .from('boards')
      .update({ name })
      .eq('id', boardId)
      .eq('workspace_id', workspaceId)
    setBusyId(null)
    if (updateError) return setError(updateError.message)
    setEditingId(null)
    await onChanged()
  }

  async function setDefault(boardId: string) {
    setError(null)
    setBusyId(boardId)
    const { error: defaultError } = await supabase.rpc('set_default_project_board', {
      _workspace_id: workspaceId,
      _board_id: boardId,
    })
    setBusyId(null)
    if (defaultError) return setError(defaultError.message)
    await onChanged()
  }

  async function deleteBoard(boardId: string, name: string) {
    if (!window.confirm(`Delete “${name}”? Only empty project boards can be deleted.`)) return
    setError(null)
    setBusyId(boardId)
    const { error: deleteError } = await supabase.rpc('delete_project_board', {
      _workspace_id: workspaceId,
      _board_id: boardId,
    })
    setBusyId(null)
    if (deleteError) return setError(deleteError.message)
    await onChanged()
  }

  return (
    <section className="projects-page">
      <div className="projects-page-heading">
        <div>
          <p className="eyebrow">Project boards</p>
          <h2>Projects</h2>
          <p className="muted">Keep each project on its own Kanban board while sharing the same FlowLane team.</p>
        </div>
        <div className="project-count"><FolderKanban size={17} /><strong>{boards.length}</strong><span>{boards.length === 1 ? 'board' : 'boards'}</span></div>
      </div>

      <form className="project-create-card" onSubmit={createBoard}>
        <div className="project-create-icon"><Plus size={18} /></div>
        <div className="project-create-copy">
          <strong>Create a project board</strong>
          <span>Projects are optional. Create one when you are ready to start tracking work.</span>
        </div>
        <TextInput label="Project name" isLabelHidden value={newName} onChange={setNewName} placeholder="e.g. MondoT mobile redesign" width="100%" />
        <Button label="Create board" variant="primary" type="submit" isLoading={busyId === 'new'} isDisabled={!newName.trim()} />
      </form>

      {error ? <div className="inline-alert error-alert projects-error">{error}</div> : null}

      {boards.length === 0 ? (
        <div className="project-empty-state">
          <FolderKanban size={24} />
          <strong>No projects yet</strong>
          <span>Your workspace and team are already usable. Create a project only when you need a Kanban board.</span>
        </div>
      ) : (
        <div className="project-list">
          {sortedBoards.map((board) => {
            const isActive = board.id === activeBoardId
            const isEditing = editingId === board.id
            return (
              <div className={`project-row${isActive ? ' active' : ''}`} key={board.id}>
                <button className="project-open" type="button" onClick={() => onSelectBoard(board.id)}>
                  <span className="project-board-icon"><FolderKanban size={17} /></span>
                  <span className="project-row-copy">
                    <strong>{board.name}</strong>
                    <span>{isActive ? 'Currently open' : board.is_default ? 'Default project board' : 'Project board'}</span>
                  </span>
                </button>
                <div className="project-row-actions">
                  {board.is_default ? <span className="default-board-pill"><Check size={13} />Default</span> : <IconButton icon={<Star size={16} />} label="Make default" onClick={() => void setDefault(board.id)} />}
                  {isEditing ? (
                    <>
                      <TextInput label="Project name" isLabelHidden value={editingName} onChange={setEditingName} width="100%" />
                      <IconButton icon={<Check size={16} />} label="Save project name" onClick={() => void saveRename(board.id)} />
                      <IconButton icon={<X size={16} />} label="Cancel rename" onClick={() => setEditingId(null)} />
                    </>
                  ) : (
                    <IconButton icon={<Pencil size={16} />} label="Rename project" onClick={() => { setEditingId(board.id); setEditingName(board.name) }} />
                  )}
                  <IconButton icon={<Trash2 size={16} />} label="Delete project" onClick={() => void deleteBoard(board.id, board.name)} isDisabled={busyId === board.id} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
