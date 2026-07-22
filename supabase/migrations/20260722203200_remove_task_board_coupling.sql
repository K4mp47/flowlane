-- Finalize the v2 domain model: a task belongs to a project and a configurable status.
-- workspace_id remains intentionally denormalized as the tenant/RLS partition key.

create or replace function app_private.prepare_task_domain()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_workspace_id uuid;
begin
  if new.project_id is null or new.status_id is null then raise exception 'Task project and status are required'; end if;
  select p.workspace_id into v_workspace_id from public.projects p where p.id=new.project_id and p.archived_at is null;
  if v_workspace_id is null then raise exception 'Invalid project'; end if;
  if not exists (select 1 from public.workflow_statuses ws where ws.id=new.status_id and ws.project_id=new.project_id) then raise exception 'Status must belong to the task project'; end if;
  new.workspace_id := v_workspace_id;
  if tg_op='UPDATE' then new.creator_id := old.creator_id; end if;
  return new;
end;
$$;
revoke all on function app_private.prepare_task_domain() from public;

drop trigger if exists tasks_01_sync_domain_fields on public.tasks;
drop trigger if exists tasks_01_prepare_domain on public.tasks;
create trigger tasks_01_prepare_domain before insert or update on public.tasks for each row execute function app_private.prepare_task_domain();
drop function if exists app_private.sync_task_domain_fields();
drop function if exists app_private.validate_task_transition();

-- Rewrite project creation so board columns are only visual mappings to workflow statuses.
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
  insert into public.projects(workspace_id,name,created_by) values(_workspace_id,trim(_name),auth.uid()) returning id into v_project_id;
  if not exists (select 1 from public.projects where workspace_id=_workspace_id and id<>v_project_id and is_default and archived_at is null) then update public.projects set is_default=true where id=v_project_id; end if;
  insert into public.workflow_statuses(project_id,name,category,position,is_terminal,notify_on_enter) values
    (v_project_id,'Backlog','BACKLOG',1000,false,false),
    (v_project_id,'To Do','UNSTARTED',2000,false,false),
    (v_project_id,'In Progress','STARTED',3000,false,false),
    (v_project_id,'Review','STARTED',4000,false,true),
    (v_project_id,'Done','COMPLETED',5000,true,false);
  insert into public.boards(workspace_id,project_id,name,is_default) values(_workspace_id,v_project_id,'Board',true) returning id into v_board_id;
  for v_status in select id,name,position from public.workflow_statuses where project_id=v_project_id order by position loop
    insert into public.board_columns(board_id,name,status_id,position) values(v_board_id,v_status.name,v_status.id,v_status.position);
  end loop;
  return v_project_id;
end;
$$;
revoke all on function public.create_project(uuid,text) from public;
grant execute on function public.create_project(uuid,text) to authenticated;

-- Remove superseded RPCs whose names encoded the old Project=Board model.
drop function if exists public.create_project_board(uuid,text);
drop function if exists public.set_default_project_board(uuid,uuid);
drop function if exists public.delete_project_board(uuid,uuid);

-- Tasks no longer own board presentation state.
alter table public.tasks drop column board_id;
alter table public.tasks drop column column_id;

-- Board columns map to workflow statuses; status semantics are no longer hard-coded on the board.
alter table public.board_columns drop column workflow_stage;
alter table public.board_columns add constraint board_columns_board_status_key unique(board_id,status_id);

drop type if exists public.workflow_stage_type;

create index if not exists tasks_workspace_project_updated_idx on public.tasks(workspace_id,project_id,updated_at desc);
