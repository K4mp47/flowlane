import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization')
  if (!supabaseUrl || !serviceRoleKey || !authorization) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const userId = userData.user.id
  const storagePaths = new Set<string>()

  const { data: ownAttachments, error: ownAttachmentError } = await admin.from('attachments').select('storage_path').eq('uploaded_by', userId)
  if (ownAttachmentError) return new Response(JSON.stringify({ error: ownAttachmentError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  for (const row of ownAttachments ?? []) if (row.storage_path) storagePaths.add(row.storage_path)

  const { data: ownedTasks, error: ownedTasksError } = await admin.from('tasks').select('id').eq('creator_id', userId)
  if (ownedTasksError) return new Response(JSON.stringify({ error: ownedTasksError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  const ownedTaskIds = (ownedTasks ?? []).map((row) => row.id)
  if (ownedTaskIds.length) {
    const { data: ownedTaskAttachments, error } = await admin.from('attachments').select('storage_path').in('task_id', ownedTaskIds)
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    for (const row of ownedTaskAttachments ?? []) if (row.storage_path) storagePaths.add(row.storage_path)
  }

  const { data: memberships, error: membershipsError } = await admin.from('workspace_members').select('workspace_id').eq('user_id', userId)
  if (membershipsError) return new Response(JSON.stringify({ error: membershipsError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  for (const membership of memberships ?? []) {
    const { count, error: countError } = await admin.from('workspace_members').select('*', { count: 'exact', head: true }).eq('workspace_id', membership.workspace_id)
    if (countError) return new Response(JSON.stringify({ error: countError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    if (count !== 1) continue

    const { data: workspaceTasks, error: workspaceTasksError } = await admin.from('tasks').select('id').eq('workspace_id', membership.workspace_id)
    if (workspaceTasksError) return new Response(JSON.stringify({ error: workspaceTasksError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    const taskIds = (workspaceTasks ?? []).map((row) => row.id)
    if (!taskIds.length) continue
    const { data: workspaceAttachments, error: workspaceAttachmentsError } = await admin.from('attachments').select('storage_path').in('task_id', taskIds)
    if (workspaceAttachmentsError) return new Response(JSON.stringify({ error: workspaceAttachmentsError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    for (const row of workspaceAttachments ?? []) if (row.storage_path) storagePaths.add(row.storage_path)
  }

  const paths = [...storagePaths]
  if (paths.length) {
    const { error: storageError } = await admin.storage.from('task-attachments').remove(paths)
    if (storageError) {
      return new Response(JSON.stringify({ error: `Unable to remove stored attachments: ${storageError.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  const { data: cleanup, error: cleanupError } = await admin.rpc('delete_account_data', { _user_id: userId })
  if (cleanupError) return new Response(JSON.stringify({ error: cleanupError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId)
  if (deleteUserError) return new Response(JSON.stringify({ error: deleteUserError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  return new Response(JSON.stringify({ deleted: true, cleanup, removedStorageObjects: paths.length }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
