-- Switching the default project/board must clear the previous default before
-- promoting the new row. A single UPDATE using `is_default = (id = target)` can
-- violate the partial unique index while PostgreSQL is updating rows, depending
-- on row/update order.

create or replace function public.set_default_project(_workspace_id uuid, _project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not app_private.is_workspace_admin(_workspace_id) then
    raise exception 'Only workspace admins can change the default project';
  end if;

  if not exists (
    select 1
    from public.projects
    where id = _project_id
      and workspace_id = _workspace_id
      and archived_at is null
  ) then
    raise exception 'Project not found';
  end if;

  -- Keep the two writes ordered so the unique partial index can never observe
  -- two defaults for the same workspace, even transiently.
  update public.projects
  set is_default = false
  where workspace_id = _workspace_id
    and is_default
    and archived_at is null
    and id <> _project_id;

  update public.projects
  set is_default = true
  where id = _project_id
    and workspace_id = _workspace_id
    and archived_at is null;
end;
$$;

revoke all on function public.set_default_project(uuid, uuid) from public;
grant execute on function public.set_default_project(uuid, uuid) to authenticated;

create or replace function public.set_default_board(_project_id uuid, _board_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not app_private.can_admin_project(_project_id, v_actor) then
    raise exception 'Only project admins can change the default board';
  end if;

  if not exists (
    select 1
    from public.boards
    where id = _board_id
      and project_id = _project_id
  ) then
    raise exception 'Board not found';
  end if;

  -- Same ordering guarantee as projects: demote first, promote second.
  update public.boards
  set is_default = false
  where project_id = _project_id
    and is_default
    and id <> _board_id;

  update public.boards
  set is_default = true
  where id = _board_id
    and project_id = _project_id;
end;
$$;

revoke all on function public.set_default_board(uuid, uuid) from public;
grant execute on function public.set_default_board(uuid, uuid) to authenticated;
