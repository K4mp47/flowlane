export type WorkspaceRole = 'ADMIN' | 'MEMBER' | 'VIEWER'
export type WorkflowStatusCategory = 'BACKLOG' | 'UNSTARTED' | 'STARTED' | 'COMPLETED' | 'CANCELED'
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

export interface Project {
  id: string
  workspace_id: string
  name: string
  description: string | null
  is_default: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface ProjectMembership {
  project_id: string
  user_id: string
  role: WorkspaceRole
  added_by: string | null
  joined_at: string
}

export interface WorkflowStatus {
  id: string
  project_id: string
  name: string
  category: WorkflowStatusCategory
  position: number
  color: string | null
  is_terminal: boolean
  notify_on_enter: boolean
}

export interface Board {
  id: string
  project_id: string
  name: string
  is_default: boolean
}

export interface BoardMembership {
  board_id: string
  user_id: string
  role: WorkspaceRole
  added_by: string | null
  joined_at: string
}

export interface BoardColumn {
  id: string
  board_id: string
  name: string
  status_id: string
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
  project_id: string
  board_id: string
  status_id: string
  title: string
  context: string | null
  expected_result: string | null
  additional_information: string | null
  task_type_id: string | null
  priority: TaskPriority | null
  creator_id: string
  start_date: string | null
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