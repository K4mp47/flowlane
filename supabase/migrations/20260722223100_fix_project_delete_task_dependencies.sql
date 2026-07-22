create or replace function public.delete_project(_workspace_id uuid, _project_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_was_default boolean;
  v_replacement uuid;
begin
  if not app_private.is_workspace_admin(_workspace_id) then
    raise exception 'Only workspace admins can delete projects';
  end if;

  select is_default into v_was_default
  from public.projects
  where id = _project_id and workspace_id = _workspace_id;

  if not found then raise exception 'Project not found'; end if;

  -- status_id intentionally uses RESTRICT during normal workflow editing. Remove
  -- project-owned tasks first so the subsequent project/status cascade is valid.
  delete from public.tasks
  where project_id = _project_id and workspace_id = _workspace_id;

  delete from public.projects
  where id = _project_id and workspace_id = _workspace_id;

  if v_was_default then
    select id into v_replacement
    from public.projects
    where workspace_id = _workspace_id and archived_at is null
    order by created_at
    limit 1;
    if v_replacement is not null then
      update public.projects set is_default = true where id = v_replacement;
    end if;
  end if;
end;
$$;

revoke all on function public.delete_project(uuid, uuid) from public;
grant execute on function public.delete_project(uuid, uuid) to authenticated;
