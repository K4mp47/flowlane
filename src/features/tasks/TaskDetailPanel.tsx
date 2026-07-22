import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CheckboxInput } from '@/components/ui/CheckboxInput'
import { IconButton } from '@/components/ui/IconButton'
import { Selector } from '@/components/ui/Selector'
import { TextArea } from '@/components/ui/TextArea'
import { TextInput } from '@/components/ui/TextInput'
import { CheckSquare2, Edit3, LockKeyhole, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { can } from '../../auth/permissions'
import { supabase } from '../../lib/supabase'
import type { ChecklistItem, Comment, Profile, Task, TaskAssignee, TaskType, WorkspaceRole } from '../../types/domain'

interface TaskDetailPanelProps { task: Task; role: WorkspaceRole | null; currentUserId: string; taskType?: TaskType; assignees: TaskAssignee[]; profiles: Profile[]; members: Array<{ user_id: string; role: WorkspaceRole }>; onClose: () => void; onEdit: () => void; onChanged: () => Promise<void> | void }

export function TaskDetailPanel({ task, role, currentUserId, taskType, assignees, profiles, members, onClose, onEdit, onChanged }: TaskDetailPanelProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [commentText, setCommentText] = useState('')
  const [checklistText, setChecklistText] = useState('')
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const isReadOnly = role === 'VIEWER'

  const assignedProfiles = useMemo(() => assignees.filter((item) => item.task_id === task.id).map((item) => profiles.find((profile) => profile.id === item.user_id)).filter(Boolean) as Profile[], [assignees, profiles, task.id])
  const assignableUserIds = useMemo(() => new Set(members.filter((member) => member.role !== 'VIEWER').map((member) => member.user_id)), [members])
  const availableProfiles = useMemo(() => profiles.filter((profile) => assignableUserIds.has(profile.id) && !assignedProfiles.some((assigned) => assigned.id === profile.id)), [assignableUserIds, assignedProfiles, profiles])
  const assigneeOptions = useMemo(() => availableProfiles.map((profile) => ({ value: profile.id, label: profile.display_name || profile.email })), [availableProfiles])
  const checklistCompleted = checklist.filter((item) => item.is_completed).length
  const checklistPercent = checklist.length ? Math.round((checklistCompleted / checklist.length) * 100) : 0

  const loadDetails = useCallback(async () => { const [commentsResult, checklistResult] = await Promise.all([supabase.from('comments').select('*').eq('task_id', task.id).order('created_at', { ascending: true }), supabase.from('checklist_items').select('*').eq('task_id', task.id).order('position', { ascending: true })]); if (commentsResult.error) setError(commentsResult.error.message); else setComments((commentsResult.data ?? []) as Comment[]); if (checklistResult.error) setError(checklistResult.error.message); else setChecklist((checklistResult.data ?? []) as ChecklistItem[]) }, [task.id])

  useEffect(() => { void loadDetails(); const channel = supabase.channel(`task-detail-${task.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `task_id=eq.${task.id}` }, () => void loadDetails()).on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items', filter: `task_id=eq.${task.id}` }, () => void loadDetails()).subscribe(); return () => { void supabase.removeChannel(channel) } }, [loadDetails, task.id])

  function closeAnimated(callback: () => void = onClose) { if (isClosing) return; setIsClosing(true); window.setTimeout(callback, 190) }
  async function addComment() { if (!commentText.trim()) return; setError(null); const { error: insertError } = await supabase.from('comments').insert({ task_id: task.id, author_id: currentUserId, content: commentText.trim() }); if (insertError) return setError(insertError.message); setCommentText(''); await loadDetails() }
  async function addChecklistItem() { if (!checklistText.trim()) return; const nextPosition = checklist.length ? Math.max(...checklist.map((item) => item.position)) + 1000 : 1000; const { error: insertError } = await supabase.from('checklist_items').insert({ task_id: task.id, content: checklistText.trim(), created_by: currentUserId, position: nextPosition }); if (insertError) return setError(insertError.message); setChecklistText(''); await loadDetails(); await onChanged() }
  async function toggleChecklist(item: ChecklistItem) { const { error: updateError } = await supabase.from('checklist_items').update({ is_completed: !item.is_completed }).eq('id', item.id); if (updateError) return setError(updateError.message); await loadDetails(); await onChanged() }
  async function deleteChecklistItem(itemId: string) { const { error: deleteError } = await supabase.from('checklist_items').delete().eq('id', itemId); if (deleteError) return setError(deleteError.message); await loadDetails(); await onChanged() }
  async function addAssignee() { if (!selectedAssigneeId) return; const { error: insertError } = await supabase.from('task_assignees').insert({ task_id: task.id, user_id: selectedAssigneeId, assigned_by: currentUserId }); if (insertError) return setError(insertError.message); setSelectedAssigneeId(''); await onChanged() }
  async function removeAssignee(userId: string) { const { error: deleteError } = await supabase.from('task_assignees').delete().eq('task_id', task.id).eq('user_id', userId); if (deleteError) return setError(deleteError.message); await onChanged() }
  async function deleteTask() { if (!can(role, 'task:delete') || !window.confirm(`Delete FL-${task.task_number} “${task.title}”? This cannot be undone.`)) return; setError(null); setIsDeleting(true); const { error: deleteError } = await supabase.from('tasks').delete().eq('id', task.id); if (deleteError) { setError(deleteError.message); setIsDeleting(false); return } await onChanged(); closeAnimated() }

  return <motion.div className="task-peek-backdrop" onMouseDown={() => closeAnimated()} initial={{ opacity: 0 }} animate={{ opacity: isClosing ? 0 : 1 }} transition={{ duration: .18 }}>
    <motion.aside className="task-peek task-detail-panel" onMouseDown={(event) => event.stopPropagation()} initial={{ x: '100%', opacity: .85 }} animate={{ x: isClosing ? '100%' : 0, opacity: isClosing ? .82 : 1 }} transition={{ type: 'spring', stiffness: 420, damping: 38, mass: .75 }}>
      <div className="task-detail-close"><IconButton label="Close task details" icon={<X size={18} />} variant="ghost" size="sm" onClick={() => closeAnimated()} /></div>
      <div className="task-detail-kicker"><span className="task-reference">FL-{task.task_number}</span>{taskType ? <Badge label={taskType.name} variant="neutral" /> : null}{task.priority ? <Badge label={task.priority} variant={task.priority === 'URGENT' ? 'red' : task.priority === 'HIGH' ? 'orange' : 'neutral'} /> : null}</div>
      <div className="task-detail-heading-row"><h2>{task.title}</h2><div className="task-detail-heading-actions">{can(role, 'task:edit') ? <Button label="Edit" variant="secondary" size="sm" icon={<Edit3 size={14} />} onClick={() => closeAnimated(onEdit)} /> : null}{can(role, 'task:delete') ? <Button label="Delete" variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => void deleteTask()} isLoading={isDeleting} /> : null}</div></div>
      {task.is_blocked ? <div className="blocked-callout"><strong><LockKeyhole size={14} /> Blocked</strong><p>{task.blocked_reason}</p></div> : null}
      <div className="peek-section"><span>Context</span><p>{task.context || 'No context added yet.'}</p></div><div className="peek-section"><span>Expected result</span><p>{task.expected_result || 'No expected result added yet.'}</p></div><div className="peek-section"><span>Additional information</span><p>{task.additional_information || 'No additional information.'}</p></div>
      <div className="peek-section"><span>Assignees</span><div className="assignee-row">{assignedProfiles.length ? assignedProfiles.map((profile) => <div className="assignee-chip" key={profile.id}><span className="mini-avatar">{(profile.display_name || profile.email).slice(0, 1).toUpperCase()}</span><span>{profile.display_name || profile.email}</span>{can(role, 'task:assign') ? <IconButton label={`Remove ${profile.display_name || profile.email}`} icon={<X size={12} />} variant="ghost" size="sm" onClick={() => void removeAssignee(profile.id)} /> : null}</div>) : <p className="muted small-copy">No assignees.</p>}</div>{can(role, 'task:assign') && availableProfiles.length ? <div className="inline-editor-row ui-inline-editor"><Selector label="Add assignee" isLabelHidden options={assigneeOptions} value={selectedAssigneeId} onChange={setSelectedAssigneeId} placeholder="Choose member…" width="100%" /><Button label="Assign" size="sm" variant="secondary" icon={<UserPlus size={14} />} onClick={() => void addAssignee()} isDisabled={!selectedAssigneeId} /></div> : null}</div>
      <div className="peek-section"><div className="checklist-section-heading"><span>Checklist</span>{checklist.length ? <strong><CheckSquare2 size={13} /> {checklistCompleted}/{checklist.length} · {checklistPercent}%</strong> : null}</div>{checklist.length ? <div className="checklist-progress-track"><span style={{ width: `${checklistPercent}%` }} /></div> : null}<div className="checklist-list ui-checklist-list">{checklist.map((item) => <div className={item.is_completed ? 'ui-checklist-item completed' : 'ui-checklist-item'} key={item.id}><CheckboxInput label={item.content} value={item.is_completed} isReadOnly={isReadOnly} size="sm" width="100%" onChange={() => void toggleChecklist(item)} />{can(role, 'checklist:edit') ? <IconButton label="Delete checklist item" icon={<Trash2 size={13} />} variant="ghost" size="sm" onClick={() => void deleteChecklistItem(item.id)} /> : null}</div>)}</div>{can(role, 'checklist:edit') ? <div className="inline-editor-row ui-inline-editor"><TextInput label="Checklist item" isLabelHidden value={checklistText} onChange={setChecklistText} placeholder="Add checklist item…" /><Button label="Add" size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => void addChecklistItem()} isDisabled={!checklistText.trim()} /></div> : null}</div>
      <div className="peek-section"><span>Comments</span><div className="comment-list">{comments.map((comment) => { const author = profiles.find((profile) => profile.id === comment.author_id); return <div className="comment-card" key={comment.id}><div className="comment-meta"><strong>{author?.display_name || author?.email || 'Team member'}</strong><span>{new Date(comment.created_at).toLocaleString()}</span></div><p>{comment.content}</p></div> })}{!comments.length ? <p className="muted small-copy">No comments yet.</p> : null}</div>{can(role, 'comment:create') ? <div className="comment-composer"><TextArea label="Comment" isLabelHidden value={commentText} onChange={setCommentText} rows={3} placeholder="Share an update, decision or test result…" /><Button label="Add comment" variant="secondary" size="sm" onClick={() => void addComment()} isDisabled={!commentText.trim()} /></div> : null}</div>
      {error ? <div className="inline-alert error-alert">{error}</div> : null}{isReadOnly ? <p className="read-only-note">Viewer access is read-only.</p> : null}
    </motion.aside>
  </motion.div>
}
