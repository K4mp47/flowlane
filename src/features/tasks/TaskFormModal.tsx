import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { BoardColumn, Task, TaskPriority, TaskType } from '../../types/domain'

interface TaskFormModalProps {
  workspaceId: string
  boardId: string
  creatorId: string
  backlogColumn: BoardColumn
  taskTypes: TaskType[]
  task?: Task | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}

const priorities: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

export function TaskFormModal({ workspaceId, boardId, creatorId, backlogColumn, taskTypes, task, onClose, onSaved }: TaskFormModalProps) {
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [expectedResult, setExpectedResult] = useState('')
  const [additionalInformation, setAdditionalInformation] = useState('')
  const [taskTypeId, setTaskTypeId] = useState('')
  const [priority, setPriority] = useState<TaskPriority | ''>('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setTitle(task?.title ?? '')
    setContext(task?.context ?? '')
    setExpectedResult(task?.expected_result ?? '')
    setAdditionalInformation(task?.additional_information ?? '')
    setTaskTypeId(task?.task_type_id ?? '')
    setPriority(task?.priority ?? '')
    setDueDate(task?.due_date ? task.due_date.slice(0, 10) : '')
  }, [task])

  const isEditing = Boolean(task)
  const canSave = useMemo(() => title.trim().length > 0, [title])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    setError(null)
    setIsSaving(true)

    const payload = {
      title: title.trim(),
      context: context.trim() || null,
      expected_result: expectedResult.trim() || null,
      additional_information: additionalInformation.trim() || null,
      task_type_id: taskTypeId || null,
      priority: priority || null,
      due_date: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
    }

    const result = isEditing && task
      ? await supabase.from('tasks').update(payload).eq('id', task.id)
      : await supabase.from('tasks').insert({
          ...payload,
          workspace_id: workspaceId,
          board_id: boardId,
          column_id: backlogColumn.id,
          creator_id: creatorId,
          position: Date.now(),
        })

    if (result.error) {
      setError(result.error.message)
      setIsSaving(false)
      return
    }

    await onSaved()
    setIsSaving(false)
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="task-form-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{isEditing ? `FL-${task?.task_number}` : 'New task'}</p>
            <h2>{isEditing ? 'Edit task' : 'Create a standardized task'}</h2>
          </div>
          <button className="icon-plain" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <TextInput
          label="Title"
          description="Use an action-oriented title: Fix, Add, Update, Investigate, Test…"
          value={title}
          onChange={setTitle}
          placeholder="Fix WebSocket synchronization on MondoT"
          isRequired
        />
        <TextArea
          label="Context"
          description="What is happening now?"
          value={context}
          onChange={setContext}
          rows={4}
          isOptional
        />
        <TextArea
          label="Expected result"
          description="What should be true when this task is complete?"
          value={expectedResult}
          onChange={setExpectedResult}
          rows={4}
          isOptional
        />
        <TextArea
          label="Additional information"
          description="Logs, links, devices, versions or other useful details."
          value={additionalInformation}
          onChange={setAdditionalInformation}
          rows={3}
          isOptional
        />

        <div className="form-grid-3">
          <label className="native-field">
            <span>Type</span>
            <select value={taskTypeId} onChange={(event) => setTaskTypeId(event.target.value)}>
              <option value="">Not set</option>
              {taskTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
          <label className="native-field">
            <span>Priority</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority | '')}>
              <option value="">Not set</option>
              {priorities.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="native-field">
            <span>Due date</span>
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
        </div>

        <div className="definition-callout">
          <strong>Definition of Ready</strong>
          <p>Backlog tasks can be incomplete. Before moving outside Backlog, FlowLane requires Context, Expected result, Type, Priority and at least one assignee.</p>
        </div>

        {error ? <div className="inline-alert error-alert">{error}</div> : null}
        <div className="modal-actions">
          <Button label="Cancel" variant="secondary" type="button" onClick={onClose} />
          <Button label={isEditing ? 'Save changes' : 'Create task'} variant="primary" type="submit" isLoading={isSaving} isDisabled={!canSave} />
        </div>
      </form>
    </div>
  )
}
