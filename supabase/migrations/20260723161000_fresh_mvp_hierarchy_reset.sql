-- Fresh MVP reset + strict Projects -> Boards -> Tasks hierarchy.
--
-- This migration intentionally does not delete auth.users directly. Auth identities
-- are deleted through the service-role-only admin-mvp-reset Edge Function so
-- Supabase Storage ownership is cleaned through the Storage API first.

create or replace function public.reset_mvp_data(_keeper_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_primary_workspace_id uuid;
  v_deleted_tasks integer := 0;
  v_deleted_projects integer := 0;
  v_deleted_profiles integer := 0;
  v_deleted_workspaces integer := 0;
begin
  if _keeper_id is null or not exists (select 1 from auth.users where id = _keeper_id) then
    raise exception 'Keeper account does not exist';
  end if;

  select wm.workspace_id
    into v_primary_workspace_id
  from public.workspace_members wm
  where wm.user_id = _keeper_id
  order by wm.joined_at, wm.workspace_id
  limit 1;

  if v_primary_workspace_id is null then
    raise exception 'Keeper account must belong to a workspace before the MVP reset';
  end if;

  -- Start from an empty work graph. Child task data is removed by the existing
  -- task cascades; projects then cascade their boards, statuses and memberships.
  delete from public.tasks;
  get diagnostics v_deleted_tasks = row_count;

  delete from public.projects;
  get diagnostics v_deleted_projects = row_count;

  -- Clear ephemeral collaboration data so the retained account sees a genuinely
  -- fresh product rather than notifications/activity from the old installation.
  delete from public.notifications;
  delete from public.activity_events;
  delete from public.notification_preferences where user_id <> _keeper_id;

  -- Keep one tenant shell only. Workspaces remain an internal tenant boundary,
  -- while the product-facing hierarchy begins at Project.
  delete from public.workspace_members
  where user_id = _keeper_id and workspace_id <> v_primary_workspace_id;

  delete from public.workspace_members where user_id <> _keeper_id;

  update public.workspace_members
  set role = 'ADMIN', added_by = null
  where workspace_id = v_primary_workspace_id and user_id = _keeper_id;

  update public.workspaces
  set created_by = _keeper_id
  where id = v_primary_workspace_id;

  delete from public.workspaces where id <> v_primary_workspace_id;
  get diagnostics v_deleted_workspaces = row_count;

  delete from public.profiles where id <> _keeper_id;
  get diagnostics v_deleted_profiles = row_count;

  return jsonb_build_object(
    'keeper_id', _keeper_id,
    'workspace_id', v_primary_workspace_id,
    'deleted_tasks', v_deleted_tasks,
    'deleted_projects', v_deleted_projects,
    'deleted_profiles', v_deleted_profiles,
    'deleted_workspaces', v_deleted_workspaces
  );
end;
$$;

revoke all on function public.reset_mvp_data(uuid) from public;
revoke all on function public.reset_mvp_data(uuid) from anon;
revoke all on function public.reset_mvp_data(uuid) from authenticated;
grant execute on function public.reset_mvp_data(uuid) to service_role;

-- A task stores project_id for convenient filtering, but board_id is the actual
-- work partition. The composite FK prevents a task from pointing at a board from
-- another project even if a trigger is bypassed.
alter table public.boards
  drop constraint if exists boards_id_project_id_key;
alter table public.boards
  add constraint boards_id_project_id_key unique (id, project_id);

alter table public.tasks
  drop constraint if exists tasks_board_project_fkey;
alter table public.tasks
  add constraint tasks_board_project_fkey
  foreign key (board_id, project_id)
  references public.boards(id, project_id)
  on delete restrict;

-- Board columns may only map statuses owned by the board's project.
create or replace function app_private.validate_board_column_domain()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
begin
  select b.project_id into v_project_id
  from public.boards b
  where b.id = new.board_id;

  if v_project_id is null then
    raise exception 'Board does not exist';
  end if;

  if not exists (
    select 1
    from public.workflow_statuses ws
    where ws.id = new.status_id
      and ws.project_id = v_project_id
  ) then
    raise exception 'Board column status must belong to the same project as the board';
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_board_column_domain() from public;

drop trigger if exists board_columns_validate_domain on public.board_columns;
create trigger board_columns_validate_domain
before insert or update of board_id, status_id on public.board_columns
for each row execute function app_private.validate_board_column_domain();

-- The compatibility fallback used during the previous rollout is intentionally
-- removed. In the fresh MVP every task write must explicitly identify its board.
create or replace function app_private.prepare_task_domain()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_board_project_id uuid;
begin
  if new.project_id is null or new.board_id is null or new.status_id is null then
    raise exception 'Task project, board and status are required';
  end if;

  select p.workspace_id into v_workspace_id
  from public.projects p
  where p.id = new.project_id
    and p.archived_at is null;
  if v_workspace_id is null then
    raise exception 'Invalid project';
  end if;

  select b.project_id into v_board_project_id
  from public.boards b
  where b.id = new.board_id;
  if v_board_project_id is distinct from new.project_id then
    raise exception 'Board must belong to the task project';
  end if;

  if not exists (
    select 1 from public.workflow_statuses ws
    where ws.id = new.status_id and ws.project_id = new.project_id
  ) then
    raise exception 'Status must belong to the task project';
  end if;

  if not exists (
    select 1 from public.board_columns bc
    where bc.board_id = new.board_id and bc.status_id = new.status_id
  ) then
    raise exception 'Status is not available on the selected board';
  end if;

  new.workspace_id := v_workspace_id;

  if tg_op = 'UPDATE' then
    new.creator_id := old.creator_id;
    if new.project_id is distinct from old.project_id then
      raise exception 'Tasks cannot move between projects';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.prepare_task_domain() from public;
