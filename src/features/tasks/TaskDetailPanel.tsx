import { useEffect, useMemo, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Check, Edit3, LockKeyhole, Plus, UserPlus, X } from 'lucide-react'
import { can } from '../../auth/permissions'
import { supabase } from '../../lib/supabase'
import type { ChecklistItem, Comment, Profile, Task, TaskAssignee, TaskType, WorkspaceRole } from '../../types/domain'

interface TaskDetailPanelProps {
  task: Task
  role: WorkspaceRole | null
  currentUserId: string
  taskType?: TaskType
  assignees: TaskAssignee[]
  profiles: Profile[]
  onClose: () => void
  onEdit: () => void
  onChanged: () => Promise<void> | void
}

export function TaskDetailPanel({ task, role, currentUserId, taskType, assignees, profiles, onClose, onEdit, onChanged }: TaskDetailPanelProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [commentText, setCommentText] = useState('')
  const [checklistText, setChecklistText] = useState('')
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isReadOnly = role === 'VIEWER'

  const assignedProfiles = useMemo(() => assignees
    .filter((item) => item.task_id === task.id)
    .map((item) => profiles.find((profile) => profile.id === item.user_id))
    .filter(Boolean) as Profile[], [assignees, profiles, task.id])

  const availableProfiles = useMemo(() => profiles.filter((profile) => !assignedProfiles.some((assigned) => assigned.id === profile.id)), [assignedProfiles, profiles])

  useEffect(() => {
    let active = true
    async function loadDetails() {
      const [commentsResult, checklistResult] = await Promise.all([
        supabase.from('comments').select('*').eq('task_id', task.id).order('created_at', { ascending: true }),
        supabase.from('checklist_items').select('*').eq('task_id', task.id).order('position', { ascending: true }),
      ])
      if (!active) return
      if (commentsResult.error) setError(commentsResult.error.message)
      else setComments((commentsResult.data ?? []) as Comment[])
      if (checklistResult.error) setError(checklistResult.error.message)
      else setChecklist((checklistResult.data ?? []) as ChecklistItem[])
    }
    void loadDetails()
    return () => { active = false }
  }, [task.id])

  async function addComment() {
    if (!commentText.trim()) return
    setError(null)
    const { data, error: insertError } = await supabase.from('comments').insert({
      task_id: task.id,
      author_id: currentUserId,
      content: commentText.trim(),
    }).select().single()
    if (insertError) return setError(insertError.message)
    setComments((current) => [...current, data as Comment])
    setCommentText('')
  }

  async function addChecklistItem() {
    if (!checklistText.trim()) return
    const { data, error: insertError } = await supabase.from('checklist_items').insert({
      task_id: task.id,
      content: checklistText.trim(),
      created_by: currentUserId,
      position: Date.now(),
    }).select().single()
    if (insertError) return setError(insertError.message)
    setChecklist((current) => [...current, data as ChecklistItem])
    setChecklistText('')
  }

  async function toggleChecklist(item: ChecklistItem) {
    const { error: updateError } = await supabase.from('checklist_items').update({ is_completed: !item.is_completed }).eq('id', item.id)
    if (updateError) return setError(updateError.message)
    setChecklist((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_completed: !entry.is_completed } : entry))
  }

  async function addAssignee() {
    if (!selectedAssigneeId) return
    const { error: insertError } = await supabase.from('task_assignees').insert({
      task_id: task.id,
      user_id: selectedAssigneeId,
      assigned_by: currentUserId,
    })
    if (insertError) return setError(insertError.message)
    setSelectedAssigneeId('')
    await onChanged()
  }

  async function removeAssignee(userId: string) {
    const { error: deleteError } = await supabase.from('task_assignees').delete().eq('task_id', task.id).eq('user_id', userId)
    if (deleteError) return setError(deleteError.message)
    await onChanged()
  }

  return (
    <div className="task-peek-backdrop" onMouseDown={onClose}>
      <aside className="task-peek task-detail-panel" onMouseDown={(event) => event.stopPropagation()}>
        <button className="peek-close" onClick={onClose}>×</button>
        <div className="task-detail-kicker">
          <span className="task-reference">FL-{task.task_number}</span>
          {taskType ? <Badge label={taskType.name} variant="neutral" /> : null}
          {task.priority ? <Badge label={task.priority} variant={task.priority === 'URGENT' ? 'red' : task.priority === 'HIGH' ? 'orange' : 'neutral'} /> : null}
        </div>
        <div className="task-detail-heading-row">
          <h2>{task.title}</h2>
          {can(role, 'task:edit') ? <Button label="Edit" variant="secondary" size="sm" icon={<Edit3 size={14} />} onClick={onEdit} /> : null}
        </div>

        {task.is_blocked ? <div className="blocked-callout"><strong><LockKeyhole size={14} /> Blocked</strong><p>{task.blocked_reason}</p></div> : null}

        <div className="peek-section"><span>Context</span><p>{task.context || 'No context added yet.'}</p></div>
        <div className="peek-section"><span>Expected result</span><p>{task.expected_result || 'No expected result added yet.'}</p></div>
        <div className="peek-section"><span>Additional information</span><p>{task.additional_information || 'No additional information.'}</p></div>

        <div className="peek-section">
          <span>Assignees</span>
          <div className="assignee-row">
            {assignedProfiles.length ? assignedProfiles.map((profile) => (
              <div className="assignee-chip" key={profile.id}>
                <span className="mini-avatar">{(profile.display_name || profile.email).slice(0, 1).toUpperCase()}</span>
                <span>{profile.display_name || profile.email}</span>
                {can(role, 'task:assign') ? <button type="button" onClick={() => void removeAssignee(profile.id)}><X size={12} /></button> : null}
              </div>
            )) : <p className="muted small-copy">No assignees.</p>}
          </div>
          {can(role, 'task:assign') && availableProfiles.length ? (
            <div className="inline-editor-row">
              <select value={selectedAssigneeId} onChange={(event) => setSelectedAssigneeId(event.target.value)}>
                <option value="">Choose member…</option>
                {availableProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name || profile.email}</option>)}
              </select>
              <Button label="Assign" size="sm" variant="secondary" icon={<UserPlus size={14} />} onClick={() => void addAssignee()} />
            </div>
          ) : null}
        </div>

        <div className="peek-section">
          <span>Checklist</span>
          <div className="checklist-list">
            {checklist.map((item) => (
              <button className={item.is_completed ? 'checklist-item completed' : 'checklist-item'} key={item.id} disabled={isReadOnly} onClick={() => void toggleChecklist(item)}>
                <span className="check-box">{item.is_completed ? <Check size={13} /> : null}</span>
                <span>{item.content}</span>
              </button>
            ))}
          </div>
          {can(role, 'checklist:edit') ? (
            <div className="inline-editor-row">
              <input value={checklistText} onChange={(event) => setChecklistText(event.target.value)} placeholder="Add checklist item…" />
              <Button label="Add" size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => void addChecklistItem()} />
            </div>
          ) : null}
        </div>

        <div className="peek-section">
          <span>Comments</span>
          <div className="comment-list">
            {comments.map((comment) => {
              const author = profiles.find((profile) => profile.id === comment.author_id)
              return (
                <div className="comment-card" key={comment.id}>
                  <div className="comment-meta"><strong>{author?.display_name || author?.email || 'Team member'}</strong><span>{new Date(comment.created_at).toLocaleString()}</span></div>
                  <p>{comment.content}</p>
                </div>
              )
            })}
            {!comments.length ? <p className="muted small-copy">No comments yet.</p> : null}
          </div>
          {can(role, 'comment:create') ? (
            <div className="comment-composer">
              <TextArea label="Comment" isLabelHidden value={commentText} onChange={setCommentText} rows={3} placeholder="Share an update, decision or test result…" />
              <Button label="Add comment" variant="secondary" size="sm" onClick={() => void addComment()} />
            </div>
          ) : null}
        </div>

        {error ? <div className="inline-alert error-alert">{error}</div> : null}
        {isReadOnly ? <p className="read-only-note">Viewer access is read-only.</p> : null}
      </aside>
    </div>
  )
}
