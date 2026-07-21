import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type {
  Board,
  BoardColumn,
  Profile,
  Task,
  TaskAssignee,
  TaskType,
  WorkspaceRole,
} from '../../types/domain'

export interface BoardData {
  board: Board
  columns: BoardColumn[]
  tasks: Task[]
  taskTypes: TaskType[]
  assignees: TaskAssignee[]
  profiles: Profile[]
  members: Array<{ user_id: string; role: WorkspaceRole }>
}

export const boardQueryKey = (workspaceId: string) => ['boardData', workspaceId] as const

async function fetchBoardData(workspaceId: string): Promise<BoardData> {
  const { data: boardData, error: boardError } = await supabase
    .from('boards')
    .select('id,workspace_id,name,is_default')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .single()

  if (boardError) throw boardError
  const board = boardData as Board

  const [columnsResult, tasksResult, taskTypesResult] = await Promise.all([
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
    supabase
      .from('task_types')
      .select('id,workspace_id,name,description')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true }),
  ])

  if (columnsResult.error) throw columnsResult.error
  if (tasksResult.error) throw tasksResult.error
  if (taskTypesResult.error) throw taskTypesResult.error

  const tasks = (tasksResult.data ?? []) as Task[]
  const taskIds = tasks.map((task) => task.id)

  let assignees: TaskAssignee[] = []
  if (taskIds.length > 0) {
    const { data, error } = await supabase
      .from('task_assignees')
      .select('task_id,user_id,assigned_by,assigned_at')
      .in('task_id', taskIds)
    if (error) throw error
    assignees = (data ?? []) as TaskAssignee[]
  }

  const { data: memberRows, error: membersError } = await supabase
    .from('workspace_members')
    .select('user_id,role')
    .eq('workspace_id', workspaceId)

  if (membersError) throw membersError

  const memberIds = (memberRows ?? []).map((row) => row.user_id)
  let profiles: Profile[] = []
  if (memberIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,display_name,avatar_url')
      .in('id', memberIds)
    if (error) throw error
    profiles = (data ?? []) as Profile[]
  }

  return {
    board,
    columns: (columnsResult.data ?? []) as BoardColumn[],
    tasks,
    taskTypes: (taskTypesResult.data ?? []) as TaskType[],
    assignees,
    profiles,
    members: (memberRows ?? []).map((row) => ({ user_id: row.user_id, role: row.role as WorkspaceRole })),
  }
}

export function useBoardData(workspaceId: string, _role: WorkspaceRole | null) {
  return useQuery({
    queryKey: boardQueryKey(workspaceId),
    queryFn: () => fetchBoardData(workspaceId),
    enabled: Boolean(workspaceId),
  })
}
