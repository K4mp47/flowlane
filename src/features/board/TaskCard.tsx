import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@astryxdesign/core/Badge'
import { CalendarDays, GripVertical, LockKeyhole } from 'lucide-react'
import type { Profile, Task, TaskAssignee, TaskPriority, TaskType } from '../../types/domain'

const priorityVariant: Record<TaskPriority, 'teal' | 'yellow' | 'orange' | 'red'> = {
  LOW: 'teal',
  MEDIUM: