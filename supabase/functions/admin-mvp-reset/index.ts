import { createClient } from 'npm:@supabase/supabase-js@2'

const KEEPER_EMAIL = 'campagnoloalberto5@gmail.com'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization')
  if (!supabaseUrl || !serviceRoleKey || !authorization) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: callerData, error: callerError } = await admin.auth.getUser(token)
  const caller = callerData.user
  if (callerError || !caller || caller.email?.toLowerCase() !== KEEPER_EMAIL) {
    return json({ error: 'Only the retained MVP owner can run this reset' }, 403)
  }

  // Storage objects must be removed through the Storage API before deleting their
  // Auth owners. Deleting only attachment metadata can leave owned objects behind.
  const { data: attachmentRows, error: attachmentError } = await admin
    .from('attachments')
    .select('storage_path')
  if (attachmentError) return json({ error: attachmentError.message }, 500)

  const storagePaths = Array.from(new Set(
    (attachmentRows ?? [])
      .map((row) => row.storage_path as string | null)
      .filter((path): path is string => Boolean(path)),
  ))

  for (let offset = 0; offset < storagePaths.length; offset += 100) {
    const batch = storagePaths.slice(offset, offset + 100)
    const { error } = await admin.storage.from('task-attachments').remove(batch)
    if (error) return json({ error: `Unable to clear task attachments: ${error.message}` }, 500)
  }

  // Collect Auth users before deleting anything. Deleting while paginating can
  // shift page boundaries and accidentally skip accounts.
  const users: Array<{ id: string; email?: string }> = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return json({ error: error.message }, 500)
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email })))
    if (data.users.length < 1000) break
  }

  const keeper = users.find((user) => user.email?.toLowerCase() === KEEPER_EMAIL)
  if (!keeper || keeper.id !== caller.id) {
    return json({ error: 'Retained account could not be resolved safely' }, 409)
  }

  const { data: cleanup, error: cleanupError } = await admin.rpc('reset_mvp_data', {
    _keeper_id: keeper.id,
  })
  if (cleanupError) return json({ error: cleanupError.message }, 500)

  let deletedUsers = 0
  for (const user of users) {
    if (user.id === keeper.id) continue
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) return json({ error: `Unable to delete ${user.email ?? user.id}: ${error.message}` }, 500)
    deletedUsers += 1
  }

  return json({
    reset: true,
    keeperEmail: KEEPER_EMAIL,
    deletedUsers,
    removedStorageObjects: storagePaths.length,
    cleanup,
  })
})
