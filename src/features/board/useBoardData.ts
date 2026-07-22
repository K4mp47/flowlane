import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type {
  Board,
  BoardColumn,
  ChecklistItem,
  Profile,
  Task,
  TaskAssignee,
  TaskType,
  WorkspaceRole,
} from '../../types/domain'

export interface BoardData {
  board: Board | null
  boards: Board[]
  columns: BoardColumn[]
  tasks: Task[]
  taskTypes: TaskType[]
  assignees: TaskAssignee[]
  checklistItems: ChecklistItem[]
  profiles: Profile[]
  members: Array<{ user_id: string; role: WorkspaceRole }>
}

export const boardQueryKey = (workspaceId: string, boardId?: string | null) => ['boardData', workspaceId, boardId ?? 'default'] as const

async function fetchBoardData(workspaceId: string, requestedBoardId?: string | null): Promise<BoardData> {
  const { data: boardRows, error: boardsError } = await supabase
    .from('boards')
    .select('id,workspace_id,name,is_default')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (boardsError) throw boardsError
  const boards = (boardRows ?? []) as Board[]
  const board = boards.find((entry) => entry.id === requestedBoardId)
    ?? boards.find((entry) => entry.is_default)
    ?? boards[0]
    ?? null

  const [taskTypesResult, membersResult] = await Promise.all([
    supabase
      .from('task_types')
      .select('id,workspace_id,name,description')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true }),
    supabase
      .from('workspace_members')
      .select('user_id,role')
      .eq('workspace_id', workspaceId),
  ])

  if (taskTypesResult.error) throw taskTypesResult.error
  if (membersResult.error) throw membersResult.error

  const memberRows = membersResult.data ?? []
  const memberIds = memberRows.map((row) => row.user_id)
  let profiles: Profile[] = []
  if (memberIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,display_name,avatar_url')
      .in('id', memberIds)
    if (error) throw error
    profiles = (data ?? []) as Profile[]
  }

  if (!board) {
    return {
      board: null,
      boards,
      columns: [],
      tasks: [],
      taskTypes: (taskTypesResult.data ?? []) as TaskType[],
      assignees: [],
      checklistItems: [],
      profiles,
      members: memberRows.map((row) => ({ user_id: row.user_id, role: row.role as WorkspaceRole })),
    }
  }

  const [columnsResult, tasksResult] = await Promise.all([
    supabase
      .from('board_columns')
      .select('id,board_id,name,workflow_stage,position')
      .eq('board_id', board.id)
      .order('position', { ascending: true }),
    supabase
      .from('tasks')
      .select('*')
      .eq('board_id', board.id)
      .order('position', { ascending: true }),
  ])

  if (columnsResult.error) throw columnsResult.error
  if (tasksResult.error) throw tasksResult.error

  const tasks = (tasksResult.data ?? []) as Task[]
  const taskIds = tasks.map((task) => task.id)
  let assignees: TaskAssignee[] = []
  let checklistItems: ChecklistItem[] = []
  if (taskIds.length > 0) {
    const [assigneesResult, checklistResult] = await Promise.all([
      supabase
        .from('task_assignees')
        .select('task_id,user_id,assigned_by,assigned_at')
        .in('task_id', taskIds),
      supabase
        .from('checklist_items')
        .select('id,task_id,content,is_completed,position,created_by')
        .in('task_id', taskIds)
        .order('position', { ascending: true }),
    ])
    if (assigneesResult.error) throw assigneesResult.error
    if (checklistResult.error) throw checklistResult.error
    assignees = (assigneesResult.data ?? []) as TaskAssignee[]
    checklistItems = (checklistResult.data ?? []) as ChecklistItem[]
  }

  return {
    board,
    boards,
    columns: (columnsResult.data ?? []) as BoardColumn[],
    tasks,
    taskTypes: (taskTypesResult.data ?? []) as TaskType[],
    assignees,
    checklistItems,
    profiles,
    members: memberRows.map((row) => ({ user_id: row.user_id, role: row.role as WorkspaceRole })),
  }
}

export function useBoardData(workspaceId: string, _role: WorkspaceRole | null, boardId?: string | null) {
  return useQuery({
    queryKey: boardQueryKey(workspaceId, boardId),
    queryFn: () => fetchBoardData(workspaceId, boardId),
    enabled: Boolean(workspaceId),
  })
}
