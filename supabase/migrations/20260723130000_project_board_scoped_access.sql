-- Project/board hierarchy and scoped collaboration.
-- Workspaces remain the tenant boundary, but membership no longer grants visibility
-- to every project. A user can receive project-wide access or access to one board.

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role_type not null default 'MEMBER',
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role_type not null default 'MEMBER',
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists board_members_user_idx on public.board_members(user_id);

alter table public.project_members enable row level security;
alter table public.board_members enable row level security;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.board_members to authenticated;

-- Preserve existing behavior for current installations: current workspace members
-- receive the same role on every existing project. New access is scoped from here on.
insert into public.project_members(project_id, user_id, role, added_by)
select p.id, wm.user_id, wm.role, wm.added_by
from public.projects p
join public.workspace_members wm on wm.workspace_id = p.workspace_id
on conflict (project_id, user_id) do nothing;

create or replace function app_private.project_role_for(_project_id uuid, _user_id uuid default auth.uid())
returns public.workspace_role_type
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1 from public.projects p
      join public.workspace_members wm on wm.workspace_id = p.workspace_id
      where p.id = _project_id and wm.user_id = _user_id and wm.role = 'ADMIN'
    ) then 'ADMIN'::public.workspace_role_type
    else (
      select pm.role from public.project_members pm
      where pm.project_id = _project_id and pm.user_id = _user_id
      limit 1
    )
  end;
$$;

create or replace function app_private.board_role_for(_board_id uuid, _user_id uuid default auth.uid())
returns public.workspace_role_type
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    app_private.project_role_for((select b.project_id from public.boards b where b.id = _board_id), _user_id),
    (select bm.role from public.board_members bm where bm.board_id = _board_id and bm.user_id = _user_id limit 1)
  );
$$;

create or replace function app_private.can_view_project(_project_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select _user_id is not null and (
    app_private.project_role_for(_project_id, _user_id) is not null
    or exists (
      select 1 from public.boards b join public.board_members bm on bm.board_id = b.id
      where b.project_id = _project_id and bm.user_id = _user_id
    )
  );
$$;

create or replace function app_private.can_admin_project(_project_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app_private.project_role_for(_project_id, _user_id) = 'ADMIN', false);
$$;

create or replace function app_private.can_view_board(_board_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select app_private.board_role_for(_board_id, _user_id) is not null;
$$;

create or replace function app_private.can_write_board(_board_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app_private.board_role_for(_board_id, _user_id) in ('ADMIN','MEMBER'), false);
$$;

create or replace function app_private.can_admin_board(_board_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app_private.board_role_for(_board_id, _user_id) = 'ADMIN', false);
$$;

revoke all on function app_private.project_role_for(uuid,uuid) from public;
revoke all on function app_private.board_role_for(uuid,uuid) from public;
revoke all on function app_private.can_view_project(uuid,uuid) from public;
revoke all on function app_private.can_admin_project(uuid,uuid) from public;
revoke all on function app_private.can_view_board(uuid,uuid) from public;
revoke all on function app_private.can_write_board(uuid,uuid) from public;
revoke all on function app_private.can_admin_board(uuid,uuid) from public;
grant execute on function app_private.project_role_for(uuid,uuid) to authenticated;
grant execute on function app_private.board_role_for(uuid,uuid) to authenticated;
grant execute on function app_private.can_view_project(uuid,uuid) to authenticated;
grant execute on function app_private.can_admin_project(uuid,uuid) to authenticated;
grant execute on function app_private.can_view_board(uuid,uuid) to authenticated;
grant execute on function app_private.can_write_board(uuid,uuid) to authenticated;
grant execute on function app_private.can_admin_board(uuid,uuid) to authenticated;

-- A board is now a real work partition, not only a presentation of the project.
alter table public.tasks add column if not exists board_id uuid;

-- Ensure every existing project has a board before the task backfill.
insert into public.boards(workspace_id, project_id, name, is_default)
select p.workspace_id, p.id, 'Board', true
from public.projects p
where not exists (select 1 from public.boards b where b.project_id = p.id);

insert into public.board_columns(board_id, name, status_id, position)
select b.id, ws.name, ws.id, ws.position
from public.boards b
join public.workflow_statuses ws on ws.project_id = b.project_id
where not exists (
  select 1 from public.board_columns bc where bc.board_id = b.id and bc.status_id = ws.id
);

update public.tasks t
set board_id = b.id
from lateral (
  select b1.id from public.boards b1
  where b1.project_id = t.project_id
  order by b1.is_default desc, b1.created_at
  limit 1
) b
where t.board_id is null;

alter table public.tasks alter column board_id set not null;
alter table public.tasks drop constraint if exists tasks_board_id_fkey;
alter table public.tasks add constraint tasks_board_id_fkey foreign key (board_id) references public.boards(id) on delete restrict;
create index if not exists tasks_board_status_position_idx on public.tasks(board_id, status_id, position);

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
  where p.id = new.project_id and p.archived_at is null;
  if v_workspace_id is null then raise exception 'Invalid project'; end if;

  select b.project_id into v_board_project_id from public.boards b where b.id = new.board_id;
  if v_board_project_id is distinct from new.project_id then raise exception 'Board must belong to the task project'; end if;

  if not exists (
    select 1 from public.workflow_statuses ws
    where ws.id = new.status_id and ws.project_id = new.project_id
  ) then raise exception 'Status must belong to the task project'; end if;

  if not exists (
    select 1 from public.board_columns bc
    where bc.board_id = new.board_id and bc.status_id = new.status_id
  ) then raise exception 'Status is not available on the selected board'; end if;

  new.workspace_id := v_workspace_id;
  if tg_op = 'UPDATE' then
    new.creator_id := old.creator_id;
    if new.project_id is distinct from old.project_id then raise exception 'Move tasks between projects by recreating them in the target project'; end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.prepare_task_domain() from public;

-- Scoped access policies.
drop policy if exists projects_select on public.projects;
drop policy if exists projects_insert_admin on public.projects;
drop policy if exists projects_update_admin on public.projects;
drop policy if exists projects_delete_admin on public.projects;
create policy projects_select on public.projects for select to authenticated using (app_private.can_view_project(id));
create policy projects_insert_admin on public.projects for insert to authenticated with check (app_private.is_workspace_admin(workspace_id));
create policy projects_update_admin on public.projects for update to authenticated using (app_private.can_admin_project(id)) with check (app_private.can_admin_project(id));
create policy projects_delete_admin on public.projects for delete to authenticated using (app_private.can_admin_project(id));

drop policy if exists boards_select on public.boards;
drop policy if exists boards_insert_admin on public.boards;
drop policy if exists boards_update_admin on public.boards;
drop policy if exists boards_delete_admin on public.boards;
create policy boards_select on public.boards for select to authenticated using (app_private.can_view_board(id));
create policy boards_insert_admin on public.boards for insert to authenticated with check (app_private.can_admin_project(project_id));
create policy boards_update_admin on public.boards for update to authenticated using (app_private.can_admin_board(id)) with check (app_private.can_admin_board(id));
create policy boards_delete_admin on public.boards for delete to authenticated using (app_private.can_admin_board(id));

drop policy if exists columns_select on public.board_columns;
drop policy if exists columns_insert_admin on public.board_columns;
drop policy if exists columns_update_admin on public.board_columns;
drop policy if exists columns_delete_admin on public.board_columns;
create policy columns_select on public.board_columns for select to authenticated using (app_private.can_view_board(board_id));
create policy columns_insert_admin on public.board_columns for insert to authenticated with check (app_private.can_admin_board(board_id));
create policy columns_update_admin on public.board_columns for update to authenticated using (app_private.can_admin_board(board_id)) with check (app_private.can_admin_board(board_id));
create policy columns_delete_admin on public.board_columns for delete to authenticated using (app_private.can_admin_board(board_id));

drop policy if exists workflow_statuses_select on public.workflow_statuses;
drop policy if exists workflow_statuses_insert_admin on public.workflow_statuses;
drop policy if exists workflow_statuses_update_admin on public.workflow_statuses;
drop policy if exists workflow_statuses_delete_admin on public.workflow_statuses;
create policy workflow_statuses_select on public.workflow_statuses for select to authenticated using (app_private.can_view_project(project_id));
create policy workflow_statuses_insert_admin on public.workflow_statuses for insert to authenticated with check (app_private.can_admin_project(project_id));
create policy workflow_statuses_update_admin on public.workflow_statuses for update to authenticated using (app_private.can_admin_project(project_id)) with check (app_private.can_admin_project(project_id));
create policy workflow_statuses_delete_admin on public.workflow_statuses for delete to authenticated using (app_private.can_admin_project(project_id));

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert_writer on public.tasks;
drop policy if exists tasks_update_writer on public.tasks;
drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (app_private.can_view_board(board_id));
create policy tasks_insert_writer on public.tasks for insert to authenticated with check (app_private.can_write_board(board_id) and creator_id = auth.uid());
create policy tasks_update_writer on public.tasks for update to authenticated using (app_private.can_write_board(board_id)) with check (app_private.can_write_board(board_id));
create policy tasks_delete_admin on public.tasks for delete to authenticated using (app_private.can_admin_board(board_id));

-- Membership policies use SECURITY DEFINER helpers to avoid RLS recursion.
drop policy if exists project_members_select on public.project_members;
drop policy if exists project_members_insert on public.project_members;
drop policy if exists project_members_update on public.project_members;
drop policy if exists project_members_delete on public.project_members;
create policy project_members_select on public.project_members for select to authenticated using (user_id = auth.uid() or app_private.can_admin_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated with check (app_private.can_admin_project(project_id));
create policy project_members_update on public.project_members for update to authenticated using (app_private.can_admin_project(project_id)) with check (app_private.can_admin_project(project_id));
create policy project_members_delete on public.project_members for delete to authenticated using (app_private.can_admin_project(project_id));

drop policy if exists board_members_select on public.board_members;
drop policy if exists board_members_insert on public.board_members;
drop policy if exists board_members_update on public.board_members;
drop policy if exists board_members_delete on public.board_members;
create policy board_members_select on public.board_members for select to authenticated using (user_id = auth.uid() or app_private.can_admin_board(board_id));
create policy board_members_insert on public.board_members for insert to authenticated with check (app_private.can_admin_board(board_id));
create policy board_members_update on public.board_members for update to authenticated using (app_private.can_admin_board(board_id)) with check (app_private.can_admin_board(board_id));
create policy board_members_delete on public.board_members for delete to authenticated using (app_private.can_admin_board(board_id));

-- Child resources inherit board-scoped access through their task.
drop policy if exists assignees_select on public.task_assignees;
drop policy if exists assignees_insert_writer on public.task_assignees;
drop policy if exists assignees_delete_writer on public.task_assignees;
create policy assignees_select on public.task_assignees for select to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy assignees_insert_writer on public.task_assignees for insert to authenticated with check (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy assignees_delete_writer on public.task_assignees for delete to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));

drop policy if exists task_labels_select on public.task_labels;
drop policy if exists task_labels_insert_writer on public.task_labels;
drop policy if exists task_labels_delete_writer on public.task_labels;
create policy task_labels_select on public.task_labels for select to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy task_labels_insert_writer on public.task_labels for insert to authenticated with check (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy task_labels_delete_writer on public.task_labels for delete to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));

drop policy if exists comments_select on public.comments;
drop policy if exists comments_insert_writer on public.comments;
drop policy if exists comments_update_own on public.comments;
drop policy if exists comments_delete_own_or_admin on public.comments;
create policy comments_select on public.comments for select to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy comments_insert_writer on public.comments for insert to authenticated with check (author_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy comments_update_own on public.comments for update to authenticated using (author_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id))) with check (author_id=auth.uid());
create policy comments_delete_own_or_admin on public.comments for delete to authenticated using (author_id=auth.uid() or exists(select 1 from public.tasks t where t.id=task_id and app_private.can_admin_board(t.board_id)));

drop policy if exists checklist_select on public.checklist_items;
drop policy if exists checklist_insert_writer on public.checklist_items;
drop policy if exists checklist_update_writer on public.checklist_items;
drop policy if exists checklist_delete_writer on public.checklist_items;
create policy checklist_select on public.checklist_items for select to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy checklist_insert_writer on public.checklist_items for insert to authenticated with check (created_by=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy checklist_update_writer on public.checklist_items for update to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id))) with check (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy checklist_delete_writer on public.checklist_items for delete to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));

drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert_writer on public.attachments;
drop policy if exists attachments_delete_writer on public.attachments;
create policy attachments_select on public.attachments for select to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy attachments_insert_writer on public.attachments for insert to authenticated with check (uploaded_by=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy attachments_delete_writer on public.attachments for delete to authenticated using (exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));

-- New projects start empty at the account level, but each created project receives one
-- default board. Additional boards are explicit admin actions.
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

  insert into public.projects(workspace_id,name,created_by)
  values(_workspace_id,trim(_name),auth.uid()) returning id into v_project_id;

  insert into public.project_members(project_id,user_id,role,added_by)
  values(v_project_id,auth.uid(),'ADMIN',auth.uid())
  on conflict(project_id,user_id) do update set role='ADMIN';

  if not exists (select 1 from public.projects where workspace_id=_workspace_id and id<>v_project_id and is_default and archived_at is null) then
    update public.projects set is_default=true where id=v_project_id;
  end if;

  insert into public.workflow_statuses(project_id,name,category,position,is_terminal,notify_on_enter) values
    (v_project_id,'Backlog','BACKLOG',1000,false,false),
    (v_project_id,'To Do','UNSTARTED',2000,false,false),
    (v_project_id,'In Progress','STARTED',3000,false,false),
    (v_project_id,'Review','STARTED',4000,false,true),
    (v_project_id,'Done','COMPLETED',5000,true,false);

  insert into public.boards(workspace_id,project_id,name,is_default)
  values(_workspace_id,v_project_id,'Main Board',true) returning id into v_board_id;

  for v_status in select id,name,position from public.workflow_statuses where project_id=v_project_id order by position loop
    insert into public.board_columns(board_id,name,status_id,position)
    values(v_board_id,v_status.name,v_status.id,v_status.position);
  end loop;
  return v_project_id;
end;
$$;
revoke all on function public.create_project(uuid,text) from public;
grant execute on function public.create_project(uuid,text) to authenticated;

create or replace function public.create_board(_project_id uuid, _name text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_board_id uuid; v_workspace_id uuid; v_status record;
begin
  if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can create boards'; end if;
  if length(trim(_name)) < 1 or length(trim(_name)) > 120 then raise exception 'Board name must be between 1 and 120 characters'; end if;
  select workspace_id into v_workspace_id from public.projects where id=_project_id;
  insert into public.boards(workspace_id,project_id,name,is_default)
  values(v_workspace_id,_project_id,trim(_name),not exists(select 1 from public.boards where project_id=_project_id))
  returning id into v_board_id;
  for v_status in select id,name,position from public.workflow_statuses where project_id=_project_id order by position loop
    insert into public.board_columns(board_id,name,status_id,position) values(v_board_id,v_status.name,v_status.id,v_status.position);
  end loop;
  return v_board_id;
end;
$$;
revoke all on function public.create_board(uuid,text) from public;
grant execute on function public.create_board(uuid,text) to authenticated;

create or replace function public.set_default_board(_project_id uuid, _board_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can change the default board'; end if;
  if not exists(select 1 from public.boards where id=_board_id and project_id=_project_id) then raise exception 'Board not found'; end if;
  update public.boards set is_default=(id=_board_id) where project_id=_project_id;
end;
$$;
revoke all on function public.set_default_board(uuid,uuid) from public;
grant execute on function public.set_default_board(uuid,uuid) to authenticated;

create or replace function public.delete_board(_project_id uuid, _board_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_was_default boolean; v_replacement uuid;
begin
  if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can delete boards'; end if;
  select is_default into v_was_default from public.boards where id=_board_id and project_id=_project_id;
  if not found then raise exception 'Board not found'; end if;
  if exists(select 1 from public.tasks where board_id=_board_id) then raise exception 'Move or delete all tasks from this board before deleting it'; end if;
  if (select count(*) from public.boards where project_id=_project_id) <= 1 then raise exception 'A project must contain at least one board'; end if;
  delete from public.boards where id=_board_id;
  if v_was_default then
    select id into v_replacement from public.boards where project_id=_project_id order by created_at limit 1;
    update public.boards set is_default=(id=v_replacement) where project_id=_project_id;
  end if;
end;
$$;
revoke all on function public.delete_board(uuid,uuid) from public;
grant execute on function public.delete_board(uuid,uuid) to authenticated;

create or replace function public.grant_resource_access(_user_id uuid, _project_id uuid, _board_id uuid, _role public.workspace_role_type)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_workspace_id uuid;
begin
  if _project_id is null then raise exception 'Project is required'; end if;
  select workspace_id into v_workspace_id from public.projects where id=_project_id;
  if v_workspace_id is null then raise exception 'Project not found'; end if;
  if _board_id is null then
    if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can grant project access'; end if;
  else
    if not exists(select 1 from public.boards where id=_board_id and project_id=_project_id) then raise exception 'Board does not belong to project'; end if;
    if not app_private.can_admin_board(_board_id) then raise exception 'Only board admins can grant board access'; end if;
  end if;

  insert into public.workspace_members(workspace_id,user_id,role,added_by)
  values(v_workspace_id,_user_id,'VIEWER',auth.uid())
  on conflict(workspace_id,user_id) do nothing;

  if _board_id is null then
    insert into public.project_members(project_id,user_id,role,added_by)
    values(_project_id,_user_id,_role,auth.uid())
    on conflict(project_id,user_id) do update set role=excluded.role, added_by=excluded.added_by;
    delete from public.board_members bm using public.boards b where bm.board_id=b.id and b.project_id=_project_id and bm.user_id=_user_id;
  else
    if not exists(select 1 from public.project_members where project_id=_project_id and user_id=_user_id) then
      insert into public.board_members(board_id,user_id,role,added_by)
      values(_board_id,_user_id,_role,auth.uid())
      on conflict(board_id,user_id) do update set role=excluded.role, added_by=excluded.added_by;
    end if;
  end if;
end;
$$;
revoke all on function public.grant_resource_access(uuid,uuid,uuid,public.workspace_role_type) from public;
grant execute on function public.grant_resource_access(uuid,uuid,uuid,public.workspace_role_type) to authenticated;

create or replace function public.remove_resource_access(_user_id uuid, _project_id uuid, _board_id uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if _board_id is null then
    if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can remove project access'; end if;
    delete from public.project_members where project_id=_project_id and user_id=_user_id;
    delete from public.board_members bm using public.boards b where bm.board_id=b.id and b.project_id=_project_id and bm.user_id=_user_id;
  else
    if not app_private.can_admin_board(_board_id) then raise exception 'Only board admins can remove board access'; end if;
    delete from public.board_members where board_id=_board_id and user_id=_user_id;
  end if;
end;
$$;
revoke all on function public.remove_resource_access(uuid,uuid,uuid) from public;
grant execute on function public.remove_resource_access(uuid,uuid,uuid) to authenticated;

-- Assignees must be able to operate on the specific board, not merely belong to the tenant.
create or replace function app_private.validate_assignee_membership()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_board_id uuid;
begin
  select board_id into v_board_id from public.tasks where id=new.task_id;
  if not app_private.can_write_board(v_board_id,new.user_id) then
    raise exception 'Assignee must have Member or Admin access to this board';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_assignee_membership() from public;

-- Task notifications only reach users that can actually see the board containing the task.
create or replace function app_private.notify_workspace_members_for_task_event(
  _workspace_id uuid,
  _task_id uuid,
  _actor_id uuid,
  _type public.notification_type,
  _title text,
  _message text
)
returns void
language sql
security definer
set search_path=public,pg_temp
as $$
  insert into public.notifications(workspace_id,user_id,task_id,type,title,message)
  select distinct _workspace_id, candidate.user_id, _task_id, _type, _title, _message
  from (
    select pm.user_id
    from public.tasks t
    join public.project_members pm on pm.project_id=t.project_id
    where t.id=_task_id
    union
    select bm.user_id
    from public.tasks t
    join public.board_members bm on bm.board_id=t.board_id
    where t.id=_task_id
    union
    select wm.user_id
    from public.tasks t
    join public.workspace_members wm on wm.workspace_id=t.workspace_id and wm.role='ADMIN'
    where t.id=_task_id
  ) candidate
  where _actor_id is null or candidate.user_id is distinct from _actor_id;
$$;
revoke all on function app_private.notify_workspace_members_for_task_event(uuid,uuid,uuid,public.notification_type,text,text) from public;

-- Removing someone from the tenant removes all scoped grants and assignments in it.
create or replace function public.remove_workspace_member(_workspace_id uuid, _user_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if not app_private.is_workspace_admin(_workspace_id) then raise exception 'Only workspace admins can remove members'; end if;
  if _user_id=auth.uid() then raise exception 'You cannot remove yourself from the workspace'; end if;
  delete from public.task_assignees ta using public.tasks t where ta.task_id=t.id and ta.user_id=_user_id and t.workspace_id=_workspace_id;
  delete from public.board_members bm using public.boards b where bm.board_id=b.id and b.workspace_id=_workspace_id and bm.user_id=_user_id;
  delete from public.project_members pm using public.projects p where pm.project_id=p.id and p.workspace_id=_workspace_id and pm.user_id=_user_id;
  delete from public.workspace_members where workspace_id=_workspace_id and user_id=_user_id;
end;
$$;
revoke all on function public.remove_workspace_member(uuid,uuid) from public;
grant execute on function public.remove_workspace_member(uuid,uuid) to authenticated;