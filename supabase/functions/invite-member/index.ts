import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedRoles = new Set(['ADMIN', 'MEMBER', 'VIEWER'])
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization')
  if (!supabaseUrl || !serviceRoleKey || !authorization) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)

  let payload: { workspaceId?: string; projectId?: string; boardId?: string | null; email?: string; role?: string; redirectTo?: string }
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const workspaceId = payload.workspaceId?.trim()
  const projectId = payload.projectId?.trim()
  const boardId = payload.boardId?.trim() || null
  const email = payload.email?.trim().toLowerCase()
  const role = payload.role?.toUpperCase()
  if (!workspaceId || !projectId || !email || !role || !allowedRoles.has(role)) return json({ error: 'workspaceId, projectId, email and a valid role are required' }, 400)

  const { data: project } = await admin.from('projects').select('id,workspace_id').eq('id', projectId).eq('workspace_id', workspaceId).maybeSingle()
  if (!project) return json({ error: 'Project not found' }, 404)

  if (boardId) {
    const { data: board } = await admin.from('boards').select('id').eq('id', boardId).eq('project_id', projectId).maybeSingle()
    if (!board) return json({ error: 'Board does not belong to this project' }, 400)
  }

  const actorId = userData.user.id
  const [{ data: workspaceMembership }, { data: projectMembership }] = await Promise.all([
    admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', actorId).maybeSingle(),
    admin.from('project_members').select('role').eq('project_id', projectId).eq('user_id', actorId).maybeSingle(),
  ])
  let authorized = workspaceMembership?.role === 'ADMIN' || projectMembership?.role === 'ADMIN'
  if (!authorized && boardId) {
    const { data: boardMembership } = await admin.from('board_members').select('role').eq('board_id', boardId).eq('user_id', actorId).maybeSingle()
    authorized = boardMembership?.role === 'ADMIN'
  }
  if (!authorized) return json({ error: 'You do not have permission to manage access to this resource' }, 403)

  const redirectBase = payload.redirectTo?.replace(/\/$/, '')
  const redirectTo = redirectBase ? `${redirectBase}?flowlane_invite=1` : undefined
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { onboarding_required: true } })
  if (inviteError || !inviteData.user) return json({ error: inviteError?.message ?? 'Unable to invite user' }, 400)

  const invitedUserId = inviteData.user.id
  const { data: existingWorkspaceMembership } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', invitedUserId).maybeSingle()
  if (!existingWorkspaceMembership) {
    const { error } = await admin.from('workspace_members').insert({ workspace_id: workspaceId, user_id: invitedUserId, role: 'VIEWER', added_by: actorId })
    if (error) return json({ error: error.message }, 500)
  }

  const targetTable = boardId ? 'board_members' : 'project_members'
  const targetKey = boardId ? 'board_id' : 'project_id'
  const targetId = boardId ?? projectId
  const { error: scopeError } = await admin.from(targetTable).upsert({ [targetKey]: targetId, user_id: invitedUserId, role, added_by: actorId }, { onConflict: `${targetKey},user_id` })
  if (scopeError) return json({ error: scopeError.message }, 500)

  return json({ userId: invitedUserId, email, role, scope: boardId ? 'board' : 'project', projectId, boardId })
})