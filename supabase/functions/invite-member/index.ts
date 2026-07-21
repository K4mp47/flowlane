import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedRoles = new Set(['ADMIN', 'MEMBER', 'VIEWER'])

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization')
  if (!supabaseUrl || !serviceRoleKey || !authorization) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: { workspaceId?: string; email?: string; role?: string; redirectTo?: string }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const workspaceId = payload.workspaceId?.trim()
  const email = payload.email?.trim().toLowerCase()
  const role = payload.role?.toUpperCase()
  if (!workspaceId || !email || !role || !allowedRoles.has(role)) {
    return new Response(JSON.stringify({ error: 'workspaceId, email and a valid role are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: membership, error: membershipError } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (membershipError || membership?.role !== 'ADMIN') {
    return new Response(JSON.stringify({ error: 'Only workspace admins can invite members' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: payload.redirectTo,
  })

  if (inviteError || !inviteData.user) {
    return new Response(JSON.stringify({ error: inviteError?.message ?? 'Unable to invite user' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error: memberError } = await admin.from('workspace_members').upsert({
    workspace_id: workspaceId,
    user_id: inviteData.user.id,
    role,
    added_by: userData.user.id,
  }, { onConflict: 'workspace_id,user_id' })

  if (memberError) {
    return new Response(JSON.stringify({ error: memberError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ userId: inviteData.user.id, email, role }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
