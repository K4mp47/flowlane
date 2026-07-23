create or replace function public.delete_account_data(_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace record;
  v_replacement uuid;
  v_replacement_role public.workspace_role_type;
  v_deleted_workspaces integer := 0;
  v_deleted_tasks integer := 0;
  v_deleted_comments integer := 0;
  v_deleted_checklist integer := 0;
  v_deleted_attachments integer := 0;
  v_deleted_notifications integer := 0;
begin
  -- This function is only granted to service_role and is called by the
  -- authenticated delete-account Edge Function after verifying the JWT.

  -- Preserve shared workspaces. If the departing user is the only member,
  -- delete the entire workspace to reclaim database/storage footprint.
  for v_workspace in
    select wm.workspace_id, wm.role, w.created_by
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = _user_id
  loop
    select wm.user_id, wm.role
      into v_replacement, v_replacement_role
    from public.workspace_members wm
    where wm.workspace_id = v_workspace.workspace_id
      and wm.user_id <> _user_id
    order by
      case wm.role when 'ADMIN' then 0 when 'MEMBER' then 1 else 2 end,
      wm.joined_at
    limit 1;

    if v_replacement is null then
      delete from public.workspaces where id = v_workspace.workspace_id;
      v_deleted_workspaces := v_deleted_workspaces + 1;
      continue;
    end if;

    -- Never leave a workspace without an administrator after an admin exits.
    if v_workspace.role = 'ADMIN'
      and not exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = v_workspace.workspace_id
          and wm.user_id <> _user_id
          and wm.role = 'ADMIN'
      ) then
      update public.workspace_members
      set role = 'ADMIN'
      where workspace_id = v_workspace.workspace_id
        and user_id = v_replacement;
    end if;

    if v_workspace.created_by = _user_id then
      update public.workspaces
      set created_by = v_replacement
      where id = v_workspace.workspace_id;
    end if;
  end loop;

  -- Delete user-owned collaborative content rather than leaving anonymous data.
  delete from public.comments where author_id = _user_id;
  get diagnostics v_deleted_comments = row_count;

  delete from public.checklist_items where created_by = _user_id;
  get diagnostics v_deleted_checklist = row_count;

  delete from public.attachments where uploaded_by = _user_id;
  get diagnostics v_deleted_attachments = row_count;

  delete from public.notifications where user_id = _user_id;
  get diagnostics v_deleted_notifications = row_count;

  delete from public.notification_preferences where user_id = _user_id;
  delete from public.task_assignees where user_id = _user_id;
  delete from public.activity_events where actor_id = _user_id;

  -- Tasks created by the user are treated as user-owned content for account
  -- deletion. Cascades clean assignments, labels, comments, checklist rows,
  -- attachment metadata, activity and task-bound notifications.
  delete from public.tasks where creator_id = _user_id;
  get diagnostics v_deleted_tasks = row_count;

  -- Remove authorship/administrative references that should not block auth deletion.
  update public.projects set created_by = null where created_by = _user_id;
  update public.task_assignees set assigned_by = null where assigned_by = _user_id;
  update public.workspace_members set added_by = null where added_by = _user_id;

  delete from public.workspace_members where user_id = _user_id;
  delete from public.profiles where id = _user_id;

  return jsonb_build_object(
    'deleted_workspaces', v_deleted_workspaces,
    'deleted_tasks', v_deleted_tasks,
    'deleted_comments', v_deleted_comments,
    'deleted_checklist_items', v_deleted_checklist,
    'deleted_attachment_rows', v_deleted_attachments,
    'deleted_notifications', v_deleted_notifications
  );
end;
$$;

revoke all on function public.delete_account_data(uuid) from public;
revoke all on function public.delete_account_data(uuid) from anon;
revoke all on function public.delete_account_data(uuid) from authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
