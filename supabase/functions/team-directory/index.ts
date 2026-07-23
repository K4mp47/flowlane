import { createClient } from 'npm:@supabase/supabase-js@2'

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
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401)

  let payload: { action?: 'search'; workspaceId?: string; projectId?: string; boardId?: string | null; query?: string }
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const workspaceId = payload.workspaceId?.trim()
  const projectId = payload.projectId?.trim() || null
  const boardId = payload.boardId?.trim() || null
  if (!workspaceId) return json({ error: 'workspaceId is required' }, 400)

  if (projectId) {
    const { data: project } = await admin.from('projects').select('id').eq('id', projectId).eq('workspace_id', workspaceId).maybeSingle()
    if (!project) return json({ error: 'Project not found' }, 404)
  }
  if (boardId) {
    if (!projectId) return json({ error: 'projectId is required for board-scoped access' }, 400)
    const { data: board } = await admin.from('boards').select('id').eq('id', boardId).eq('project_id', projectId).maybeSingle()
    if (!board) return json({ error: 'Board does not belong to this project' }, 400)
  }

  const actorId = authData.user.id
  const { data: workspaceMembership } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', actorId).maybeSingle()
  let authorized = workspaceMembership?.role === 'ADMIN'
  if (!authorized && projectId) {
    const { data: projectMembership } = await admin.from('project_members').select('role').eq('project_id', projectId).eq('user_id', actorId).maybeSingle()
    authorized = projectMembership?.role === 'ADMIN'
  }
  if (!authorized && boardId) {
    const { data: boardMembership } = await admin.from('board_members').select('role').eq('board_id', boardId).eq('user_id', actorId).maybeSingle()
    authorized = boardMembership?.role === 'ADMIN'
  }
  if (!authorized) return json({ error: 'You do not have permission to manage this resource' }, 403)

  if (payload.action !== 'search') return json({ error: 'Unknown action' }, 400)
  const query = payload.query?.trim().toLowerCase() ?? ''
  if (query.length < 2) return json({ results: [] })

  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id,email,display_name,avatar_url')
    .ilike('email', `%${query}%`)
    .order('email', { ascending: true })
    .limit(8)
  if (profileError) return json({ error: profileError.message }, 500)

  return json({
    results: (profiles ?? [])
      .filter((profile) => profile.id !== actorId)
      .map((profile) => ({ id: profile.id, email: profile.email, displayName: profile.display_name, avatarUrl: profile.avatar_url })),
  })
})
