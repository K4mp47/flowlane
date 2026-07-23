-- Project/board scoped access. Workspace remains the tenant boundary only.

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role_type not null default 'MEMBER',
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role_type not null default 'MEMBER',
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index project_members_user_idx on public.project_members(user_id);
create index board_members_user_idx on public.board_members(user_id);

alter table public.project_members enable row level security;
alter table public.board_members enable row level security;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.board_members to authenticated;

-- Existing users keep the visibility they had before this migration.
insert into public.project_members(project_id,user_id,role,added_by)
select p.id,wm.user_id,wm.role,wm.added_by
from public.projects p
join public.workspace_members wm on wm.workspace_id=p.workspace_id
on conflict do nothing;

create or replace function app_private.project_role_for(_project_id uuid,_user_id uuid default auth.uid())
returns public.workspace_role_type language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when exists (
      select 1 from public.projects p
      join public.workspace_members wm on wm.workspace_id=p.workspace_id
      where p.id=_project_id and wm.user_id=_user_id and wm.role='ADMIN'
    ) then 'ADMIN'::public.workspace_role_type
    else (select pm.role from public.project_members pm where pm.project_id=_project_id and pm.user_id=_user_id limit 1)
  end;
$$;

create or replace function app_private.board_role_for(_board_id uuid,_user_id uuid default auth.uid())
returns public.workspace_role_type language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(
    app_private.project_role_for((select b.project_id from public.boards b where b.id=_board_id),_user_id),
    (select bm.role from public.board_members bm where bm.board_id=_board_id and bm.user_id=_user_id limit 1)
  );
$$;

create or replace function app_private.can_view_project(_project_id uuid,_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select _user_id is not null and (
    app_private.project_role_for(_project_id,_user_id) is not null
    or exists(select 1 from public.boards b join public.board_members bm on bm.board_id=b.id where b.project_id=_project_id and bm.user_id=_user_id)
  );
$$;

create or replace function app_private.can_admin_project(_project_id uuid,_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(app_private.project_role_for(_project_id,_user_id)='ADMIN',false);
$$;

create or replace function app_private.can_view_board(_board_id uuid,_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select app_private.board_role_for(_board_id,_user_id) is not null;
$$;

create or replace function app_private.can_write_board(_board_id uuid,_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(app_private.board_role_for(_board_id,_user_id) in ('ADMIN','MEMBER'),false);
$$;

create or replace function app_private.can_admin_board(_board_id uuid,_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(app_private.board_role_for(_board_id,_user_id)='ADMIN',false);
$$;

revoke all on function app_private.project_role_for(uuid,uuid) from public;
revoke all on function app_private.board_role_for(uuid,uuid) from public;
revoke all on function app_private.can_view_project(uuid,uuid) from public;
revoke all on function app_private.can_admin_project(uuid,uuid) from public;
revoke all on function app_private.can_view_board(uuid,uuid) from public;
revoke all on function app_private.can_write_board(uuid,uuid) from public;
revoke all on function app_private.can_admin_board(uuid,uuid) from public;
grant execute on function app_private.project_role_for(uuid,uuid),app_private.board_role_for(uuid,uuid),app_private.can_view_project(uuid,uuid),app_private.can_admin_project(uuid,uuid),app_private.can_view_board(uuid,uuid),app_private.can_write_board(uuid,uuid),app_private.can_admin_board(uuid,uuid) to authenticated;

-- A task belongs to one specific board. This is required for board-only access.
alter table public.tasks add column board_id uuid;

insert into public.boards(workspace_id,project_id,name,is_default)
select p.workspace_id,p.id,'Main Board',true from public.projects p
where not exists(select 1 from public.boards b where b.project_id=p.id);

insert into public.board_columns(board_id,name,status_id,position)
select b.id,ws.name,ws.id,ws.position
from public.boards b join public.workflow_statuses ws on ws.project_id=b.project_id
where not exists(select 1 from public.board_columns bc where bc.board_id=b.id and bc.status_id=ws.id);

update public.tasks t set board_id=(
  select b.id from public.boards b where b.project_id=t.project_id
  order by b.is_default desc,b.created_at limit 1
) where t.board_id is null;

alter table public.tasks alter column board_id set not null;
alter table public.tasks add constraint tasks_board_id_fkey foreign key(board_id) references public.boards(id) on delete restrict;
create index tasks_board_status_position_idx on public.tasks(board_id,status_id,position);

create or replace function app_private.prepare_task_domain()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_workspace_id uuid; v_board_project uuid;
begin
  if new.project_id is null or new.board_id is null or new.status_id is null then raise exception 'Task project, board and status are required'; end if;
  select workspace_id into v_workspace_id from public.projects where id=new.project_id and archived_at is null;
  if v_workspace_id is null then raise exception 'Invalid project'; end if;
  select project_id into v_board_project from public.boards where id=new.board_id;
  if v_board_project is distinct from new.project_id then raise exception 'Board must belong to the task project'; end if;
  if not exists(select 1 from public.workflow_statuses where id=new.status_id and project_id=new.project_id) then raise exception 'Status must belong to the task project'; end if;
  if not exists(select 1 from public.board_columns where board_id=new.board_id and status_id=new.status_id) then raise exception 'Status is not available on this board'; end if;
  new.workspace_id:=v_workspace_id;
  if tg_op='UPDATE' then new.creator_id:=old.creator_id; end if;
  return new;
end;
$$;
revoke all on function app_private.prepare_task_domain() from public;

-- Resource-level RLS.
drop policy if exists projects_select on public.projects;
drop policy if exists projects_update_admin on public.projects;
drop policy if exists projects_delete_admin on public.projects;
create policy projects_select on public.projects for select to authenticated using(app_private.can_view_project(id));
create policy projects_update_admin on public.projects for update to authenticated using(app_private.can_admin_project(id)) with check(app_private.can_admin_project(id));
create policy projects_delete_admin on public.projects for delete to authenticated using(app_private.can_admin_project(id));

drop policy if exists boards_select on public.boards;
drop policy if exists boards_insert_admin on public.boards;
drop policy if exists boards_update_admin on public.boards;
drop policy if exists boards_delete_admin on public.boards;
create policy boards_select on public.boards for select to authenticated using(app_private.can_view_board(id));
create policy boards_insert_admin on public.boards for insert to authenticated with check(app_private.can_admin_project(project_id));
create policy boards_update_admin on public.boards for update to authenticated using(app_private.can_admin_board(id)) with check(app_private.can_admin_board(id));
create policy boards_delete_admin on public.boards for delete to authenticated using(app_private.can_admin_board(id));

drop policy if exists columns_select on public.board_columns;
drop policy if exists columns_insert_admin on public.board_columns;
drop policy if exists columns_update_admin on public.board_columns;
drop policy if exists columns_delete_admin on public.board_columns;
create policy columns_select on public.board_columns for select to authenticated using(app_private.can_view_board(board_id));
create policy columns_insert_admin on public.board_columns for insert to authenticated with check(app_private.can_admin_board(board_id));
create policy columns_update_admin on public.board_columns for update to authenticated using(app_private.can_admin_board(board_id)) with check(app_private.can_admin_board(board_id));
create policy columns_delete_admin on public.board_columns for delete to authenticated using(app_private.can_admin_board(board_id));

drop policy if exists workflow_statuses_select on public.workflow_statuses;
drop policy if exists workflow_statuses_insert_admin on public.workflow_statuses;
drop policy if exists workflow_statuses_update_admin on public.workflow_statuses;
drop policy if exists workflow_statuses_delete_admin on public.workflow_statuses;
create policy workflow_statuses_select on public.workflow_statuses for select to authenticated using(app_private.can_view_project(project_id));
create policy workflow_statuses_insert_admin on public.workflow_statuses for insert to authenticated with check(app_private.can_admin_project(project_id));
create policy workflow_statuses_update_admin on public.workflow_statuses for update to authenticated using(app_private.can_admin_project(project_id)) with check(app_private.can_admin_project(project_id));
create policy workflow_statuses_delete_admin on public.workflow_statuses for delete to authenticated using(app_private.can_admin_project(project_id));

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert_writer on public.tasks;
drop policy if exists tasks_update_writer on public.tasks;
drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using(app_private.can_view_board(board_id));
create policy tasks_insert_writer on public.tasks for insert to authenticated with check(app_private.can_write_board(board_id) and creator_id=auth.uid());
create policy tasks_update_writer on public.tasks for update to authenticated using(app_private.can_write_board(board_id)) with check(app_private.can_write_board(board_id));
create policy tasks_delete_admin on public.tasks for delete to authenticated using(app_private.can_admin_board(board_id));

create policy project_members_select on public.project_members for select to authenticated using(user_id=auth.uid() or app_private.can_admin_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated with check(app_private.can_admin_project(project_id));
create policy project_members_update on public.project_members for update to authenticated using(app_private.can_admin_project(project_id)) with check(app_private.can_admin_project(project_id));
create policy project_members_delete on public.project_members for delete to authenticated using(app_private.can_admin_project(project_id));
create policy board_members_select on public.board_members for select to authenticated using(user_id=auth.uid() or app_private.can_admin_board(board_id));
create policy board_members_insert on public.board_members for insert to authenticated with check(app_private.can_admin_board(board_id));
create policy board_members_update on public.board_members for update to authenticated using(app_private.can_admin_board(board_id)) with check(app_private.can_admin_board(board_id));
create policy board_members_delete on public.board_members for delete to authenticated using(app_private.can_admin_board(board_id));

-- Task-owned data inherits the task's board access.
drop policy if exists assignees_select on public.task_assignees;
drop policy if exists assignees_insert_writer on public.task_assignees;
drop policy if exists assignees_delete_writer on public.task_assignees;
create policy assignees_select on public.task_assignees for select to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy assignees_insert_writer on public.task_assignees for insert to authenticated with check(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy assignees_delete_writer on public.task_assignees for delete to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));

drop policy if exists task_labels_select on public.task_labels;
drop policy if exists task_labels_insert_writer on public.task_labels;
drop policy if exists task_labels_delete_writer on public.task_labels;
create policy task_labels_select on public.task_labels for select to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy task_labels_insert_writer on public.task_labels for insert to authenticated with check(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy task_labels_delete_writer on public.task_labels for delete to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));

drop policy if exists comments_select on public.comments;
drop policy if exists comments_insert_writer on public.comments;
drop policy if exists comments_update_own on public.comments;
drop policy if exists comments_delete_own_or_admin on public.comments;
create policy comments_select on public.comments for select to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy comments_insert_writer on public.comments for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy comments_update_own on public.comments for update to authenticated using(author_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id))) with check(author_id=auth.uid());
create policy comments_delete_own_or_admin on public.comments for delete to authenticated using(author_id=auth.uid() or exists(select 1 from public.tasks t where t.id=task_id and app_private.can_admin_board(t.board_id)));

drop policy if exists checklist_select on public.checklist_items;
drop policy if exists checklist_insert_writer on public.checklist_items;
drop policy if exists checklist_update_writer on public.checklist_items;
drop policy if exists checklist_delete_writer on public.checklist_items;
create policy checklist_select on public.checklist_items for select to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy checklist_insert_writer on public.checklist_items for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy checklist_update_writer on public.checklist_items for update to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id))) with check(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy checklist_delete_writer on public.checklist_items for delete to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));

drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert_writer on public.attachments;
drop policy if exists attachments_delete_writer on public.attachments;
create policy attachments_select on public.attachments for select to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)));
create policy attachments_insert_writer on public.attachments for insert to authenticated with check(uploaded_by=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));
create policy attachments_delete_writer on public.attachments for delete to authenticated using(exists(select 1 from public.tasks t where t.id=task_id and app_private.can_write_board(t.board_id)));

drop policy if exists activity_select on public.activity_events;
create policy activity_select on public.activity_events for select to authenticated using(
  (task_id is not null and exists(select 1 from public.tasks t where t.id=task_id and app_private.can_view_board(t.board_id)))
  or app_private.is_workspace_admin(workspace_id)
);