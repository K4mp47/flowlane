import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type {
  Board,
  BoardColumn,
  ChecklistItem,
  Profile,
  Project,
  Task,
  TaskAssignee,
  TaskType,
  WorkflowStatus,
  WorkspaceRole,
} from '../../types/domain'

export interface BoardData {
  project: Project | null
  projects: Project[]
  board: Board | null
  boards: Board[]
  accessRole: WorkspaceRole | null
  columns: BoardColumn[]
  statuses: WorkflowStatus[]
  tasks: Task[]
  taskTypes: TaskType[]
  assignees: TaskAssignee[]
  checklistItems: ChecklistItem[]
  profiles: Profile[]
  members: Array<{ user_id: string; role: WorkspaceRole }>
}

export const boardQueryKey = (workspaceId: string, projectId?: string | null, boardId?: string | null) => ['boardData', workspaceId, projectId ?? 'default', boardId ?? 'default'] as const

async function fetchBoardData(workspaceId: string, workspaceRole: WorkspaceRole | null, userId: string | undefined, requestedProjectId?: string | null, requestedBoardId?: string | null): Promise<BoardData> {
  const { data: projectRows, error: projectsError } = await supabase
    .from('projects')
    .select('id,workspace_id,name,description,is_default,created_by,created_at,updated_at,archived_at')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (projectsError) throw projectsError
  const projects = (projectRows ?? []) as Project[]
  const project = projects.find((entry) => entry.id === requestedProjectId)
    ?? projects.find((entry) => entry.is_default)
    ?? projects[0]
    ?? null

  const [taskTypesResult, membersResult] = await Promise.all([
    supabase.from('task_types').select('id,workspace_id,name,description').eq('workspace_id', workspaceId).order('name', { ascending: true }),
    supabase.from('workspace_members').select('user_id,role').eq('workspace_id', workspaceId),
  ])
  if (taskTypesResult.error) throw taskTypesResult.error
  if (membersResult.error) throw membersResult.error

  const memberRows = membersResult.data ?? []
  const memberIds = memberRows.map((row) => row.user_id)
  let profiles: Profile[] = []
  if (memberIds.length > 0) {
    const { data, error } = await supabase.from('profiles').select('id,email,display_name,avatar_url').in('id', memberIds)
    if (error) throw error
    profiles = (data ?? []) as Profile[]
  }

  const base = {
    project,
    projects,
    taskTypes: (taskTypesResult.data ?? []) as TaskType[],
    profiles,
    members: memberRows.map((row) => ({ user_id: row.user_id, role: row.role as WorkspaceRole })),
  }
  if (!project) return { ...base, board: null, boards: [], accessRole: null, columns: [], statuses: [], tasks: [], assignees: [], checklistItems: [] }

  const [boardsResult, statusesResult, projectMembershipResult] = await Promise.all([
    supabase.from('boards').select('id,project_id,name,is_default').eq('project_id', project.id).order('created_at', { ascending: true }),
    supabase.from('workflow_statuses').select('id,project_id,name,category,position,color,is_terminal,notify_on_enter').eq('project_id', project.id).order('position', { ascending: true }),
    userId ? supabase.from('project_members').select('role').eq('project_id', project.id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  if (boardsResult.error) throw boardsResult.error
  if (statusesResult.error) throw statusesResult.error
  if (projectMembershipResult.error) throw projectMembershipResult.error

  const boards = (boardsResult.data ?? []) as Board[]
  const board = boards.find((entry) => entry.id === requestedBoardId) ?? boards.find((entry) => entry.is_default) ?? boards[0] ?? null
  const statuses = (statusesResult.data ?? []) as WorkflowStatus[]
  if (!board) return { ...base, board: null, boards, accessRole: workspaceRole === 'ADMIN' ? 'ADMIN' : (projectMembershipResult.data?.role as WorkspaceRole | undefined) ?? null, columns: [], statuses, tasks: [], assignees: [], checklistItems: [] }

  const [columnsResult, tasksResult, boardMembershipResult] = await Promise.all([
    supabase.from('board_columns').select('id,board_id,name,status_id,position').eq('board_id', board.id).order('position', { ascending: true }),
    supabase.from('tasks').select('id,task_number,project_id,board_id,status_id,title,context,expected_result,additional_information,task_type_id,priority,creator_id,start_date,due_date,is_blocked,blocked_reason,blocked_by_task_id,position,created_at,updated_at,completed_at').eq('board_id', board.id).order('position', { ascending: true }),
    userId ? supabase.from('board_members').select('role').eq('board_id', board.id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  if (columnsResult.error) throw columnsResult.error
  if (tasksResult.error) throw tasksResult.error
  if (boardMembershipResult.error) throw boardMembershipResult.error

  const accessRole = workspaceRole === 'ADMIN'
    ? 'ADMIN'
    : ((projectMembershipResult.data?.role ?? boardMembershipResult.data?.role ?? null) as WorkspaceRole | null)
  const tasks = (tasksResult.data ?? []) as Task[]
  const taskIds = tasks.map((task) => task.id)
  let assignees: TaskAssignee[] = []
  let checklistItems: ChecklistItem[] = []
  if (taskIds.length > 0) {
    const [assigneesResult, checklistResult] = await Promise.all([
      supabase.from('task_assignees').select('task_id,user_id,assigned_by,assigned_at').in('task_id', taskIds),
      supabase.from('checklist_items').select('id,task_id,content,is_completed,position,created_by').in('task_id', taskIds).order('position', { ascending: true }),
    ])
    if (assigneesResult.error) throw assigneesResult.error
    if (checklistResult.error) throw checklistResult.error
    assignees = (assigneesResult.data ?? []) as TaskAssignee[]
    checklistItems = (checklistResult.data ?? []) as ChecklistItem[]
  }

  return { ...base, board, boards, accessRole, columns: (columnsResult.data ?? []) as BoardColumn[], statuses, tasks, assignees, checklistItems }
}

export function useBoardData(workspaceId: string, role: WorkspaceRole | null, projectId?: string | null, boardId?: string | null, userId?: string) {
  return useQuery({
    queryKey: boardQueryKey(workspaceId, projectId, boardId),
    queryFn: () => fetchBoardData(workspaceId, role, userId, projectId, boardId),
    enabled: Boolean(workspaceId),
  })
}