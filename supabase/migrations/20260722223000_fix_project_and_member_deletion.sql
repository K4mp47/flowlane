-- Fix project lifecycle after the project/status domain split.
-- Boards are views inside a project, so each project may have one default board.
drop index if exists public.boards_one_default_per_workspace_idx;
create unique index if not exists boards_one_default_per_project_idx
  on public.boards(project_id)
  where is_default;

-- Columns are presentation mappings for statuses. Deleting a project/status must
-- remove its board mapping rather than block the project cascade.
alter table public.board_columns
  drop constraint if exists board_columns_status_id_fkey;
alter table public.board_columns
  add constraint board_columns_status_id_fkey
  foreign key (status_id) references public.workflow_statuses(id) on delete cascade;

-- Deleting a project is an explicitly destructive admin operation. Tasks and the
-- board/status children already belong exclusively to the project and cascade.
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

-- Workspace collaboration currently defines access to all projects in a workspace.
-- This RPC removes the member and their task assignments in that workspace in one
-- transaction. Self-removal is intentionally blocked for admins in this UI flow.
create or replace function public.remove_workspace_member(_workspace_id uuid, _user_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not app_private.is_workspace_admin(_workspace_id) then
    raise exception 'Only workspace admins can remove members';
  end if;
  if _user_id = auth.uid() then
    raise exception 'You cannot remove yourself from the workspace';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = _workspace_id and user_id = _user_id
  ) then
    raise exception 'Workspace member not found';
  end if;

  delete from public.task_assignees ta
  using public.tasks t
  where ta.task_id = t.id
    and ta.user_id = _user_id
    and t.workspace_id = _workspace_id;

  delete from public.workspace_members
  where workspace_id = _workspace_id and user_id = _user_id;
end;
$$;

revoke all on function public.remove_workspace_member(uuid, uuid) from public;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
