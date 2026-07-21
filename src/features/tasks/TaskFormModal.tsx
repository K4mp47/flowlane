import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { DateInput } from '@astryxdesign/core/DateInput'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import type { ISODateString } from '@astryxdesign/core/Calendar'
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
  const [dueDate, setDueDate] = useState<ISODateString | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setTitle(task?.title ?? '')
    setContext(task?.context ?? '')
    setExpectedResult(task?.expected_result ?? '')
    setAdditionalInformation(task?.additional_information ?? '')
    setTaskTypeId(task?.task_type_id ?? '')
    setPriority(task?.priority ?? '')
    setDueDate(task?.due_date ? task.due_date.slice(0, 10) as ISODateString : undefined)
  }, [task])

  const isEditing = Boolean(task)
  const canSave = useMemo(() => title.trim().length > 0, [title])
  const typeOptions = useMemo(() => [
    { value: '', label: 'Not set' },
    ...taskTypes.map((type) => ({ value: type.id, label: type.name })),
  ], [taskTypes])
  const priorityOptions = useMemo(() => [
    { value: '', label: 'Not set' },
    ...priorities.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() })),
  ], [])

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
            <h2>{isEditing ? 'Edit task' : 'Create task'}</h2>
          </div>
          <IconButton label="Close task form" icon={<X size={18} />} variant="ghost" size="sm" onClick={onClose} />
        </div>

        <TextInput
          label="Title"
          description="A title is the only required field. Everything else can be added later."
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

        <div className="form-grid-3 astryx-form-grid">
          <Selector
            label="Type"
            options={typeOptions}
            value={taskTypeId}
            onChange={(value) => setTaskTypeId(value)}
            size="md"
            width="100%"
          />
          <Selector
            label="Priority"
            options={priorityOptions}
            value={priority}
            onChange={(value) => setPriority(value as TaskPriority | '')}
            size="md"
            width="100%"
          />
          <DateInput
            label="Due date"
            value={dueDate}
            onChange={setDueDate}
            hasClear
            width="100%"
          />
        </div>

        <div className="definition-callout">
          <strong>Flexible workflow</strong>
          <p>Tasks can move between columns even when optional fields are empty. Add details only when they are useful to your team.</p>
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
