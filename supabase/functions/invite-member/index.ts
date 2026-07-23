import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedRoles = new Set(['ADMIN', 'MEMBER', 'VIEWER'])

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization')
  if (!supabaseUrl || !serviceRoleKey || !authorization) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  let payload: { workspaceId?: string; projectId?: string; boardId?: string | null; email?: string; role?: string; redirectTo?: string }
  try { payload = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }

  const workspaceId = payload.workspaceId?.trim()
  const projectId = payload.projectId?.trim()
  const boardId = payload.boardId?.trim() || null
  const email = payload.email?.trim().toLowerCase()
  const role = payload.role?.toUpperCase()
  if (!workspaceId || !projectId || !email || !role || !allowedRoles.has(role)) {
    return new Response(JSON.stringify({ error: 'workspaceId, projectId, email and a valid role are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const { data: project } = await admin.from('projects').select('id,workspace_id').eq('id', projectId).eq('workspace_id', workspaceId).maybeSingle()
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

  if (boardId) {
    const { data: board } = await admin.from('boards').select('id').eq('id', boardId).eq('project_id', projectId).maybeSingle()
    if (!board) return new Response(JSON.stringify({ error: 'Board does not belong to this project' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
  if (!authorized) return new Response(JSON.stringify({ error: 'You do not have permission to manage access to this resource' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

  const redirectBase = payload.redirectTo?.replace(/\/$/, '')
  const redirectTo = redirectBase ? `${redirectBase}?flowlane_invite=1` : undefined
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { onboarding_required: true },
  })
  if (inviteError || !inviteData.user) return new Response(JSON.stringify({ error: inviteError?.message ?? 'Unable to invite user' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const invitedUserId = inviteData.user.id
  const { data: existingWorkspaceMembership } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', invitedUserId).maybeSingle()
  if (!existingWorkspaceMembership) {
    const { error } = await admin.from('workspace_members').insert({ workspace_id: workspaceId, user_id: invitedUserId, role: 'VIEWER', added_by: actorId })
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const targetTable = boardId ? 'board_members' : 'project_members'
  const targetKey = boardId ? 'board_id' : 'project_id'
  const targetId = boardId ?? projectId
  const { error: scopeError } = await admin.from(targetTable).upsert({ [targetKey]: targetId, user_id: invitedUserId, role, added_by: actorId }, { onConflict: `${targetKey},user_id` })
  if (scopeError) return new Response(JSON.stringify({ error: scopeError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  return new Response(JSON.stringify({ userId: invitedUserId, email, role, scope: boardId ? 'board' : 'project', projectId, boardId }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})