create type public.workflow_status_category as enum ('BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, workspace_id)
);

create unique index projects_one_default_per_workspace_idx on public.projects(workspace_id) where is_default and archived_at is null;
create index projects_workspace_idx on public.projects(workspace_id, created_at);

create table public.workflow_statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  category public.workflow_status_category not null,
  position numeric(20,6) not null,
  color text,
  is_terminal boolean not null default false,
  notify_on_enter boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  unique (project_id, name)
);

create index workflow_statuses_project_position_idx on public.workflow_statuses(project_id, position);

alter table public.boards add column project_id uuid references public.projects(id) on delete cascade;
alter table public.board_columns add column status_id uuid references public.workflow_statuses(id) on delete restrict;
alter table public.tasks add column project_id uuid references public.projects(id) on delete cascade;
alter table public.tasks add column status_id uuid references public.workflow_statuses(id) on delete restrict;
alter table public.tasks add column start_date timestamptz;

-- Existing board records represented projects in the MVP. Preserve their IDs as project IDs so links remain stable.
insert into public.projects(id, workspace_id, name, is_default, created_at, updated_at)
select b.id, b.workspace_id, b.name, b.is_default, b.created_at, b.updated_at
from public.boards b
on conflict (id) do nothing;

update public.boards b set project_id = b.id where b.project_id is null;

insert into public.workflow_statuses(project_id, name, category, position, is_terminal, notify_on_enter, created_at, updated_at)
select
  b.project_id,
  bc.name,
  case bc.workflow_stage
    when 'BACKLOG' then 'BACKLOG'::public.workflow_status_category
    when 'TODO' then 'UNSTARTED'::public.workflow_status_category
    when 'IN_PROGRESS' then 'STARTED'::public.workflow_status_category
    when 'REVIEW' then 'STARTED'::public.workflow_status_category
    when 'DONE' then 'COMPLETED'::public.workflow_status_category
  end,
  bc.position,
  bc.workflow_stage = 'DONE',
  bc.workflow_stage = 'REVIEW',
  bc.created_at,
  bc.updated_at
from public.board_columns bc
join public.boards b on b.id = bc.board_id
on conflict (project_id, name) do nothing;

update public.board_columns bc
set status_id = ws.id
from public.boards b, public.workflow_statuses ws
where bc.board_id = b.id
  and ws.project_id = b.project_id
  and ws.name = bc.name
  and bc.status_id is null;

update public.tasks t
set project_id = b.project_id,
    status_id = bc.status_id
from public.boards b, public.board_columns bc
where t.board_id = b.id
  and t.column_id = bc.id
  and t.project_id is null;

alter table public.boards alter column project_id set not null;
alter table public.board_columns alter column status_id set not null;
alter table public.tasks alter column project_id set not null;
alter table public.tasks alter column status_id set not null;

create index boards_project_idx on public.boards(project_id, created_at);
create index board_columns_status_idx on public.board_columns(status_id);
create index tasks_project_status_position_idx on public.tasks(project_id, status_id, position);
create index tasks_project_due_date_idx on public.tasks(project_id, due_date) where due_date is not null;

alter table public.projects enable row level security;
alter table public.workflow_statuses enable row level security;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.workflow_statuses to authenticated;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
using (app_private.is_workspace_member(workspace_id));
drop policy if exists projects_insert_admin on public.projects;
create policy projects_insert_admin on public.projects for insert to authenticated
with check (app_private.is_workspace_admin(workspace_id));
drop policy if exists projects_update_admin on public.projects;
create policy projects_update_admin on public.projects for update to authenticated
using (app_private.is_workspace_admin(workspace_id))
with check (app_private.is_workspace_admin(workspace_id));
drop policy if exists projects_delete_admin on public.projects;
create policy projects_delete_admin on public.projects for delete to authenticated
using (app_private.is_workspace_admin(workspace_id));

drop policy if exists workflow_statuses_select on public.workflow_statuses;
create policy workflow_statuses_select on public.workflow_statuses for select to authenticated
using (exists (select 1 from public.projects p where p.id = workflow_statuses.project_id and app_private.is_workspace_member(p.workspace_id)));
drop policy if exists workflow_statuses_insert_admin on public.workflow_statuses;
create policy workflow_statuses_insert_admin on public.workflow_statuses for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = workflow_statuses.project_id and app_private.is_workspace_admin(p.workspace_id)));
drop policy if exists workflow_statuses_update_admin on public.workflow_statuses;
create policy workflow_statuses_update_admin on public.workflow_statuses for update to authenticated
using (exists (select 1 from public.projects p where p.id = workflow_statuses.project_id and app_private.is_workspace_admin(p.workspace_id)))
with check (exists (select 1 from public.projects p where p.id = workflow_statuses.project_id and app_private.is_workspace_admin(p.workspace_id)));
drop policy if exists workflow_statuses_delete_admin on public.workflow_statuses;
create policy workflow_statuses_delete_admin on public.workflow_statuses for delete to authenticated
using (exists (select 1 from public.projects p where p.id = workflow_statuses.project_id and app_private.is_workspace_admin(p.workspace_id)));

create trigger projects_touch_updated_at before update on public.projects for each row execute function app_private.touch_updated_at();
create trigger workflow_statuses_touch_updated_at before update on public.workflow_statuses for each row execute function app_private.touch_updated_at();

create or replace function app_private.sync_task_domain_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_workspace_id uuid;
  v_board_id uuid;
  v_column_id uuid;
begin
  -- New clients write project/status. Legacy clients may still write board/column during rollout.
  if new.project_id is null and new.board_id is not null then
    select b.project_id into v_project_id from public.boards b where b.id = new.board_id;
    new.project_id := v_project_id;
  end if;

  if new.status_id is null and new.column_id is not null then
    select bc.status_id into new.status_id from public.board_columns bc where bc.id = new.column_id;
  end if;

  if new.project_id is null or new.status_id is null then
    raise exception 'Task project and status are required';
  end if;

  select p.workspace_id into v_workspace_id from public.projects p where p.id = new.project_id;
  if v_workspace_id is null then raise exception 'Invalid project'; end if;

  if not exists (select 1 from public.workflow_statuses ws where ws.id = new.status_id and ws.project_id = new.project_id) then
    raise exception 'Status must belong to the task project';
  end if;

  select b.id into v_board_id
  from public.boards b
  where b.project_id = new.project_id
  order by b.is_default desc, b.created_at
  limit 1;

  select bc.id into v_column_id
  from public.board_columns bc
  where bc.board_id = v_board_id and bc.status_id = new.status_id
  order by bc.position
  limit 1;

  if v_board_id is null or v_column_id is null then
    raise exception 'Project board is missing a column for the selected status';
  end if;

  new.workspace_id := v_workspace_id;
  new.board_id := v_board_id;
  new.column_id := v_column_id;
  if tg_op = 'UPDATE' then new.creator_id := old.creator_id; end if;
  return new;
end;
$$;
revoke all on function app_private.sync_task_domain_fields() from public;

drop trigger if exists tasks_validate_transition on public.tasks;
drop trigger if exists tasks_sync_domain_fields on public.tasks;
create trigger tasks_sync_domain_fields before insert or update on public.tasks for each row execute function app_private.sync_task_domain_fields();

create or replace function app_private.set_task_completion_from_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_terminal boolean;
begin
  select ws.is_terminal into v_terminal from public.workflow_statuses ws where ws.id = new.status_id;
  if coalesce(v_terminal, false) then new.completed_at := coalesce(new.completed_at, now());
  else new.completed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function app_private.set_task_completion_from_status() from public;
drop trigger if exists tasks_set_completion_from_status on public.tasks;
create trigger tasks_set_completion_from_status before insert or update on public.tasks for each row execute function app_private.set_task_completion_from_status();

create or replace function public.create_project(_workspace_id uuid, _name text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_board_id uuid;
  v_status record;
begin
  if not app_private.is_workspace_admin(_workspace_id) then raise exception 'Only workspace admins can create projects'; end if;
  if length(trim(_name)) < 1 or length(trim(_name)) > 120 then raise exception 'Project name must be between 1 and 120 characters'; end if;

  insert into public.projects(workspace_id, name, created_by)
  values (_workspace_id, trim(_name), auth.uid()) returning id into v_project_id;

  if not exists (select 1 from public.projects where workspace_id = _workspace_id and id <> v_project_id and is_default and archived_at is null) then
    update public.projects set is_default = true where id = v_project_id;
  end if;

  insert into public.workflow_statuses(project_id, name, category, position, is_terminal, notify_on_enter) values
    (v_project_id, 'Backlog', 'BACKLOG', 1000, false, false),
    (v_project_id, 'To Do', 'UNSTARTED', 2000, false, false),
    (v_project_id, 'In Progress', 'STARTED', 3000, false, false),
    (v_project_id, 'Review', 'STARTED', 4000, false, true),
    (v_project_id, 'Done', 'COMPLETED', 5000, true, false);

  insert into public.boards(workspace_id, project_id, name, is_default)
  values (_workspace_id, v_project_id, 'Board', true) returning id into v_board_id;

  for v_status in select id, name, position from public.workflow_statuses where project_id = v_project_id order by position loop
    insert into public.board_columns(board_id, name, workflow_stage, status_id, position)
    values (
      v_board_id,
      v_status.name,
      case v_status.name when 'Backlog' then 'BACKLOG'::public.workflow_stage_type when 'To Do' then 'TODO'::public.workflow_stage_type when 'In Progress' then 'IN_PROGRESS'::public.workflow_stage_type when 'Review' then 'REVIEW'::public.workflow_stage_type else 'DONE'::public.workflow_stage_type end,
      v_status.id,
      v_status.position
    );
  end loop;

  return v_project_id;
end;
$$;
revoke all on function public.create_project(uuid, text) from public;
grant execute on function public.create_project(uuid, text) to authenticated;

create or replace function public.set_default_project(_workspace_id uuid, _project_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not app_private.is_workspace_admin(_workspace_id) then raise exception 'Only workspace admins can change the default project'; end if;
  if not exists (select 1 from public.projects where id = _project_id and workspace_id = _workspace_id and archived_at is null) then raise exception 'Project not found'; end if;
  update public.projects set is_default = (id = _project_id) where workspace_id = _workspace_id and archived_at is null;
end;
$$;
revoke all on function public.set_default_project(uuid, uuid) from public;
grant execute on function public.set_default_project(uuid, uuid) to authenticated;

create or replace function public.delete_project(_workspace_id uuid, _project_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_was_default boolean; v_replacement uuid;
begin
  if not app_private.is_workspace_admin(_workspace_id) then raise exception 'Only workspace admins can delete projects'; end if;
  select is_default into v_was_default from public.projects where id = _project_id and workspace_id = _workspace_id;
  if not found then raise exception 'Project not found'; end if;
  if exists (select 1 from public.tasks where project_id = _project_id) then raise exception 'Move or delete all tasks from this project before deleting it'; end if;
  delete from public.projects where id = _project_id;
  if v_was_default then
    select id into v_replacement from public.projects where workspace_id = _workspace_id and archived_at is null order by created_at limit 1;
    if v_replacement is not null then update public.projects set is_default = true where id = v_replacement; end if;
  end if;
end;
$$;
revoke all on function public.delete_project(uuid, uuid) from public;
grant execute on function public.delete_project(uuid, uuid) to authenticated;
