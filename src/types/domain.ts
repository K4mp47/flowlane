export type WorkspaceRole = 'ADMIN' | 'MEMBER' | 'VIEWER'
export type WorkflowStage = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type NotificationType = 'ASSIGNMENT' | 'MENTION' | 'DUE_SOON' | 'OVERDUE' | 'STATUS_CHANGE' | 'COMMENT' | 'TASK_CREATED' | 'TASK_UPDATED'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
}

export interface Workspace {
  id: string
  name: string
  created_by: string
}

export interface WorkspaceMembership {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  workspace: Workspace
}

export interface Board {
  id: string
  workspace_id: string
  name: string
  is_default: boolean
}

export interface BoardColumn {
  id: string
  board_id: string
  name: string
  workflow_stage: WorkflowStage
  position: number
}

export interface TaskType {
  id: string
  workspace_id: string
  name: string
  description: string | null
}

export interface Label {
  id: string
  workspace_id: string
  name: string
  color: string | null
}

export interface Task {
  id: string
  task_number: number
  workspace_id: string
  board_id: string
  column_id: string
  title: string
  context: string | null
  expected_result: string | null
  additional_information: string | null
  task_type_id: string | null
  priority: TaskPriority | null
  creator_id: string
  due_date: string | null
  is_blocked: boolean
  blocked_reason: string | null
  blocked_by_task_id: string | null
  position: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface TaskAssignee {
  task_id: string
  user_id: string
  assigned_by: string | null
  assigned_at: string
}

export interface TaskLabel {
  task_id: string
  label_id: string
}

export interface Comment {
  id: string
  task_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: string
  task_id: string
  content: string
  is_completed: boolean
  position: number
  created_by: string
}

export interface Notification {
  id: string
  workspace_id: string
  user_id: string
  task_id: string | null
  type: NotificationType
  title: string
  message: string | null
  read_at: string | null
  created_at: string
}
