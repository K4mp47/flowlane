import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Profile, Project, Task, TaskAssignee, WorkflowStatus } from '../../types/domain'

export interface WorkspaceTasksData {
  projects: Project[]
  statuses: WorkflowStatus[]
  tasks: Task[]
  assignees: TaskAssignee[]
  profiles: Profile[]
}

export const workspaceTasksQueryKey = (workspaceId: string) => ['workspaceTasks', workspaceId] as const

async function fetchWorkspaceTasks(workspaceId: string): Promise<WorkspaceTasksData> {
  const [projectsResult, membersResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id,workspace_id,name,description,is_default,created_by,created_at,updated_at,archived_at')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
    supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId),
  ])
  if (projectsResult.error) throw projectsResult.error
  if (membersResult.error) throw membersResult.error

  const projects = (projectsResult.data ?? []) as Project[]
  const projectIds = projects.map((project) => project.id)
  const memberIds = (membersResult.data ?? []).map((member) => member.user_id)

  const [statusesResult, tasksResult, profilesResult] = await Promise.all([
    projectIds.length
      ? supabase.from('workflow_statuses').select('id,project_id,name,category,position,color,is_terminal,notify_on_enter').in('project_id', projectIds).order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase.from('tasks').select('id,task_number,project_id,board_id,status_id,title,context,expected_result,additional_information,task_type_id,priority,creator_id,start_date,due_date,is_blocked,blocked_reason,blocked_by_task_id,position,created_at,updated_at,completed_at').in('project_id', projectIds).order('updated_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    memberIds.length
      ? supabase.from('profiles').select('id,email,display_name,avatar_url').in('id', memberIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (statusesResult.error) throw statusesResult.error
  if (tasksResult.error) throw tasksResult.error
  if (profilesResult.error) throw profilesResult.error

  const tasks = (tasksResult.data ?? []) as Task[]
  const taskIds = tasks.map((task) => task.id)
  let assignees: TaskAssignee[] = []
  if (taskIds.length) {
    const result = await supabase.from('task_assignees').select('task_id,user_id,assigned_by,assigned_at').in('task_id', taskIds)
    if (result.error) throw result.error
    assignees = (result.data ?? []) as TaskAssignee[]
  }

  return {
    projects,
    statuses: (statusesResult.data ?? []) as WorkflowStatus[],
    tasks,
    assignees,
    profiles: (profilesResult.data ?? []) as Profile[],
  }
}

export function useWorkspaceTasks(workspaceId: string) {
  return useQuery({
    queryKey: workspaceTasksQueryKey(workspaceId),
    queryFn: () => fetchWorkspaceTasks(workspaceId),
    enabled: Boolean(workspaceId),
  })
}