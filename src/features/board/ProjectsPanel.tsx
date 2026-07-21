import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Check, FolderKanban, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Board } from '../../types/domain'

interface ProjectsPanelProps {
  workspaceId: string
  boards: Board[]
  activeBoardId: string
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
    if (activeBoardId === boardId) {
      const next = boards.find((board) => board.id !== boardId)
      if (next) onSelectBoard(next.id)
    }
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
        <span className="project-count"><FolderKanban size={16} /> <strong>{boards.length}</strong> boards</span>
      </div>

      <form className="project-create-card" onSubmit={createBoard}>
        <div className="project-create-icon"><Plus size={18} /></div>
        <div className="project-create-copy">
          <strong>Create a project board</strong>
          <span>FlowLane creates Backlog, To Do, In Progress, Review and Done automatically.</span>
        </div>
        <TextInput label="Project name" isLabelHidden value={newName} onChange={setNewName} placeholder="e.g. MondoT mobile redesign" />
        <Button label="Create board" variant="primary" type="submit" isLoading={busyId === 'new'} isDisabled={!newName.trim()} />
      </form>

      {error ? <div className="inline-alert error-alert projects-error">{error}</div> : null}

      <div className="project-list">
        {sortedBoards.map((board) => {
          const isActive = board.id === activeBoardId
          const isEditing = editingId === board.id
          return (
            <article className={isActive ? 'project-row active' : 'project-row'} key={board.id}>
              <button className="project-open" type="button" onClick={() => onSelectBoard(board.id)}>
                <span className="project-board-icon"><FolderKanban size={18} /></span>
                <span className="project-row-copy">
                  {isEditing ? (
                    <input
                      className="project-name-input"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); void saveRename(board.id) }
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                    />
                  ) : <strong>{board.name}</strong>}
                  <span>{board.is_default ? 'Default project board' : isActive ? 'Currently open' : 'Project board'}</span>
                </span>
              </button>

              <div className="project-row-actions">
                {board.is_default ? <span className="default-board-pill"><Star size={13} /> Default</span> : (
                  <button className="project-action" type="button" disabled={busyId === board.id} onClick={() => void setDefault(board.id)} title="Make default"><Star size={16} /></button>
                )}
                {isEditing ? (
                  <button className="project-action" type="button" onClick={() => void saveRename(board.id)} title="Save name"><Check size={16} /></button>
                ) : (
                  <button className="project-action" type="button" onClick={() => { setEditingId(board.id); setEditingName(board.name) }} title="Rename board"><Pencil size={16} /></button>
                )}
                <button className="project-action danger" type="button" disabled={boards.length <= 1 || busyId === board.id} onClick={() => void deleteBoard(board.id, board.name)} title="Delete empty board"><Trash2 size={16} /></button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
