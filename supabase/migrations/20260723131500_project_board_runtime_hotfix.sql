-- Runtime hotfixes for scoped project/board access.
-- SECURITY DEFINER is intentional for transactional orchestration; every public RPC
-- validates auth.uid() and resource-level permissions before writing.

create or replace function public.create_project(_workspace_id uuid,_name text)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project_id uuid;
  v_board_id uuid;
  v_status record;
begin
  if v_actor is null or not app_private.is_workspace_member(_workspace_id,v_actor) then
    raise exception 'You must belong to the workspace to create a project';
  end if;
  if length(trim(_name)) not between 1 and 120 then
    raise exception 'Project name must be between 1 and 120 characters';
  end if;

  insert into public.projects(workspace_id,name,created_by,is_default)
  values(_workspace_id,trim(_name),v_actor,false)
  returning id into v_project_id;

  insert into public.project_members(project_id,user_id,role,added_by)
  values(v_project_id,v_actor,'ADMIN',v_actor)
  on conflict(project_id,user_id) do update set role='ADMIN',added_by=excluded.added_by;

  if not exists(
    select 1 from public.projects
    where workspace_id=_workspace_id and id<>v_project_id and is_default and archived_at is null
  ) then
    update public.projects set is_default=true where id=v_project_id;
  end if;

  insert into public.workflow_statuses(project_id,name,category,position,is_terminal,notify_on_enter) values
    (v_project_id,'Backlog','BACKLOG',1000,false,false),
    (v_project_id,'To Do','UNSTARTED',2000,false,false),
    (v_project_id,'In Progress','STARTED',3000,false,false),
    (v_project_id,'Review','STARTED',4000,false,true),
    (v_project_id,'Done','COMPLETED',5000,true,false);

  insert into public.boards(workspace_id,project_id,name,is_default)
  values(_workspace_id,v_project_id,'Main Board',true)
  returning id into v_board_id;

  for v_status in
    select id,name,position from public.workflow_statuses
    where project_id=v_project_id order by position
  loop
    insert into public.board_columns(board_id,name,status_id,position)
    values(v_board_id,v_status.name,v_status.id,v_status.position);
  end loop;

  return v_project_id;
end;
$$;
revoke all on function public.create_project(uuid,text) from public;
grant execute on function public.create_project(uuid,text) to authenticated;

create or replace function public.create_board(_project_id uuid,_name text)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_board_id uuid;
  v_workspace_id uuid;
  v_status record;
begin
  if v_actor is null or not app_private.can_admin_project(_project_id,v_actor) then
    raise exception 'Only project admins can create boards';
  end if;
  if length(trim(_name)) not between 1 and 120 then
    raise exception 'Board name must be between 1 and 120 characters';
  end if;
  select workspace_id into v_workspace_id from public.projects where id=_project_id and archived_at is null;
  if v_workspace_id is null then raise exception 'Project not found'; end if;

  insert into public.boards(workspace_id,project_id,name,is_default)
  values(v_workspace_id,_project_id,trim(_name),not exists(select 1 from public.boards where project_id=_project_id))
  returning id into v_board_id;

  for v_status in select id,name,position from public.workflow_statuses where project_id=_project_id order by position loop
    insert into public.board_columns(board_id,name,status_id,position)
    values(v_board_id,v_status.name,v_status.id,v_status.position);
  end loop;
  return v_board_id;
end;
$$;
revoke all on function public.create_board(uuid,text) from public;
grant execute on function public.create_board(uuid,text) to authenticated;

create or replace function public.set_default_board(_project_id uuid,_board_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not app_private.can_admin_project(_project_id,v_actor) then
    raise exception 'Only project admins can change the default board';
  end if;
  if not exists(select 1 from public.boards where id=_board_id and project_id=_project_id) then raise exception 'Board not found'; end if;
  update public.boards set is_default=(id=_board_id) where project_id=_project_id;
end;
$$;
revoke all on function public.set_default_board(uuid,uuid) from public;
grant execute on function public.set_default_board(uuid,uuid) to authenticated;

create or replace function public.delete_board(_project_id uuid,_board_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_was_default boolean;
  v_replacement uuid;
begin
  if v_actor is null or not app_private.can_admin_project(_project_id,v_actor) then
    raise exception 'Only project admins can delete boards';
  end if;
  select is_default into v_was_default from public.boards where id=_board_id and project_id=_project_id;
  if not found then raise exception 'Board not found'; end if;
  if exists(select 1 from public.tasks where board_id=_board_id) then raise exception 'Move or delete all tasks from this board before deleting it'; end if;
  if (select count(*) from public.boards where project_id=_project_id)<=1 then raise exception 'A project must contain at least one board'; end if;
  delete from public.boards where id=_board_id;
  if v_was_default then
    select id into v_replacement from public.boards where project_id=_project_id order by created_at limit 1;
    update public.boards set is_default=(id=v_replacement) where project_id=_project_id;
  end if;
end;
$$;
revoke all on function public.delete_board(uuid,uuid) from public;
grant execute on function public.delete_board(uuid,uuid) to authenticated;

create or replace function public.grant_resource_access(_user_id uuid,_project_id uuid,_board_id uuid,_role public.workspace_role_type)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if _role not in ('ADMIN','MEMBER','VIEWER') then raise exception 'Invalid role'; end if;
  select workspace_id into v_workspace_id from public.projects where id=_project_id;
  if v_workspace_id is null then raise exception 'Project not found'; end if;

  if _board_id is null then
    if not app_private.can_admin_project(_project_id,v_actor) then raise exception 'Only project admins can grant project access'; end if;
  else
    if not exists(select 1 from public.boards where id=_board_id and project_id=_project_id) then raise exception 'Board does not belong to project'; end if;
    if not app_private.can_admin_board(_board_id,v_actor) then raise exception 'Only board admins can grant board access'; end if;
  end if;

  insert into public.workspace_members(workspace_id,user_id,role,added_by)
  values(v_workspace_id,_user_id,'VIEWER',v_actor)
  on conflict(workspace_id,user_id) do nothing;

  if _board_id is null then
    insert into public.project_members(project_id,user_id,role,added_by)
    values(_project_id,_user_id,_role,v_actor)
    on conflict(project_id,user_id) do update set role=excluded.role,added_by=excluded.added_by;
    delete from public.board_members bm using public.boards b
    where bm.board_id=b.id and b.project_id=_project_id and bm.user_id=_user_id;
  else
    delete from public.project_members where project_id=_project_id and user_id=_user_id and role<>'ADMIN';
    insert into public.board_members(board_id,user_id,role,added_by)
    values(_board_id,_user_id,_role,v_actor)
    on conflict(board_id,user_id) do update set role=excluded.role,added_by=excluded.added_by;
  end if;
end;
$$;
revoke all on function public.grant_resource_access(uuid,uuid,uuid,public.workspace_role_type) from public;
grant execute on function public.grant_resource_access(uuid,uuid,uuid,public.workspace_role_type) to authenticated;

create or replace function public.remove_resource_access(_user_id uuid,_project_id uuid,_board_id uuid default null)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if _board_id is null then
    if not app_private.can_admin_project(_project_id,v_actor) then raise exception 'Only project admins can remove project access'; end if;
    delete from public.project_members where project_id=_project_id and user_id=_user_id;
    delete from public.board_members bm using public.boards b where bm.board_id=b.id and b.project_id=_project_id and bm.user_id=_user_id;
  else
    if not app_private.can_admin_board(_board_id,v_actor) then raise exception 'Only board admins can remove board access'; end if;
    delete from public.board_members where board_id=_board_id and user_id=_user_id;
  end if;
end;
$$;
revoke all on function public.remove_resource_access(uuid,uuid,uuid) from public;
grant execute on function public.remove_resource_access(uuid,uuid,uuid) to authenticated;

create or replace function public.delete_project(_workspace_id uuid,_project_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_was_default boolean;
  v_replacement uuid;
begin
  if v_actor is null or not app_private.can_admin_project(_project_id,v_actor) then raise exception 'Only project admins can delete projects'; end if;
  select is_default into v_was_default from public.projects where id=_project_id and workspace_id=_workspace_id;
  if not found then raise exception 'Project not found'; end if;
  delete from public.tasks where project_id=_project_id;
  delete from public.projects where id=_project_id;
  if v_was_default then
    select id into v_replacement from public.projects where workspace_id=_workspace_id and archived_at is null order by created_at limit 1;
    if v_replacement is not null then update public.projects set is_default=true where id=v_replacement; end if;
  end if;
end;
$$;
revoke all on function public.delete_project(uuid,uuid) from public;
grant execute on function public.delete_project(uuid,uuid) to authenticated;
