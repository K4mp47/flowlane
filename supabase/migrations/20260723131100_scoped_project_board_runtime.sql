-- Runtime operations for project/board hierarchy and scoped collaboration.

create or replace function public.create_project(_workspace_id uuid,_name text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_project_id uuid; v_board_id uuid; v_status record;
begin
  if not app_private.is_workspace_admin(_workspace_id) then raise exception 'Only workspace admins can create projects'; end if;
  if length(trim(_name)) not between 1 and 120 then raise exception 'Project name must be between 1 and 120 characters'; end if;
  insert into public.projects(workspace_id,name,created_by) values(_workspace_id,trim(_name),auth.uid()) returning id into v_project_id;
  insert into public.project_members(project_id,user_id,role,added_by) values(v_project_id,auth.uid(),'ADMIN',auth.uid());
  if not exists(select 1 from public.projects where workspace_id=_workspace_id and id<>v_project_id and is_default and archived_at is null) then
    update public.projects set is_default=true where id=v_project_id;
  end if;
  insert into public.workflow_statuses(project_id,name,category,position,is_terminal,notify_on_enter) values
    (v_project_id,'Backlog','BACKLOG',1000,false,false),(v_project_id,'To Do','UNSTARTED',2000,false,false),
    (v_project_id,'In Progress','STARTED',3000,false,false),(v_project_id,'Review','STARTED',4000,false,true),
    (v_project_id,'Done','COMPLETED',5000,true,false);
  insert into public.boards(workspace_id,project_id,name,is_default) values(_workspace_id,v_project_id,'Main Board',true) returning id into v_board_id;
  for v_status in select id,name,position from public.workflow_statuses where project_id=v_project_id order by position loop
    insert into public.board_columns(board_id,name,status_id,position) values(v_board_id,v_status.name,v_status.id,v_status.position);
  end loop;
  return v_project_id;
end;
$$;
revoke all on function public.create_project(uuid,text) from public;
grant execute on function public.create_project(uuid,text) to authenticated;

create or replace function public.create_board(_project_id uuid,_name text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_board_id uuid; v_workspace_id uuid; v_status record;
begin
  if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can create boards'; end if;
  if length(trim(_name)) not between 1 and 120 then raise exception 'Board name must be between 1 and 120 characters'; end if;
  select workspace_id into v_workspace_id from public.projects where id=_project_id;
  insert into public.boards(workspace_id,project_id,name,is_default)
  values(v_workspace_id,_project_id,trim(_name),not exists(select 1 from public.boards where project_id=_project_id)) returning id into v_board_id;
  for v_status in select id,name,position from public.workflow_statuses where project_id=_project_id order by position loop
    insert into public.board_columns(board_id,name,status_id,position) values(v_board_id,v_status.name,v_status.id,v_status.position);
  end loop;
  return v_board_id;
end;
$$;
revoke all on function public.create_board(uuid,text) from public;
grant execute on function public.create_board(uuid,text) to authenticated;

create or replace function public.set_default_board(_project_id uuid,_board_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can change the default board'; end if;
  if not exists(select 1 from public.boards where id=_board_id and project_id=_project_id) then raise exception 'Board not found'; end if;
  update public.boards set is_default=(id=_board_id) where project_id=_project_id;
end;
$$;
revoke all on function public.set_default_board(uuid,uuid) from public;
grant execute on function public.set_default_board(uuid,uuid) to authenticated;

create or replace function public.delete_board(_project_id uuid,_board_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_was_default boolean; v_replacement uuid;
begin
  if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can delete boards'; end if;
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

create or replace function public.delete_project(_workspace_id uuid,_project_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_was_default boolean; v_replacement uuid;
begin
  if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can delete projects'; end if;
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

create or replace function public.grant_resource_access(_user_id uuid,_project_id uuid,_board_id uuid,_role public.workspace_role_type)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_workspace_id uuid;
begin
  if _role not in ('ADMIN','MEMBER','VIEWER') then raise exception 'Invalid role'; end if;
  select workspace_id into v_workspace_id from public.projects where id=_project_id;
  if v_workspace_id is null then raise exception 'Project not found'; end if;
  if _board_id is null then
    if not app_private.can_admin_project(_project_id) then raise exception 'Only project admins can grant project access'; end if;
  else
    if not exists(select 1 from public.boards where id=_board_id and project_id=_project_id) then raise exception 'Board does not belong to project'; end if;
    if not app_private.can_admin_board(_board_id) then raise exception 'Only board admins can grant board access'; end if;
  end if;
  insert into public.workspace_members(workspace_id,user_id,role,added_by)
  values(v_workspace_id,_user_id,'VIEWER',auth.uid()) on conflict(workspace_id,user_id) do nothing;
  if _board_id is null then
    insert into public.project_members(project_id,user_id,role,added_by) values(_project_id,_user_id,_role,auth.uid())
    on conflict(project_id,user_id) do update set role=excluded.role,added_by=excluded.added_by;
    delete from public.board_members bm using public.boards b where bm.board_id=b.id and b.project_id=_project_id and bm.user_id=_user_id;
  else
    if not exists(select 1 from public.project_members where project_id=_project_id and user_id=_user_id) then
      insert into public.board_members(board_id,user_id,role,added_by) values(_board_id,_user_id,_role,auth.uid())
      on conflict(board_id,user_id) do update set role=excluded.role,added_by=excluded.added_by;
    end if;
  end if;
end;
$$;
revoke all on function public.grant_resource_access(uuid,uuid,uuid,public.workspace_role_type) from public;
grant execute on function public.grant_resource_access(uuid,uuid,uuid,public.workspace_role_type) to authenticated;

create or replace function public.remove_resource_access(_user_id uuid,_project_id uuid,_board_id uuid default null)
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

create or replace function app_private.validate_assignee_membership()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_board_id uuid;
begin
  select board_id into v_board_id from public.tasks where id=new.task_id;
  if not app_private.can_write_board(v_board_id,new.user_id) then raise exception 'Assignee must have Member or Admin access to this board'; end if;
  return new;
end;
$$;
revoke all on function app_private.validate_assignee_membership() from public;

create or replace function app_private.notify_workspace_members_for_task_event(_workspace_id uuid,_task_id uuid,_actor_id uuid,_type public.notification_type,_title text,_message text)
returns void language sql security definer set search_path=public,pg_temp as $$
  insert into public.notifications(workspace_id,user_id,task_id,type,title,message)
  select distinct _workspace_id,c.user_id,_task_id,_type,_title,_message
  from (
    select pm.user_id from public.tasks t join public.project_members pm on pm.project_id=t.project_id where t.id=_task_id
    union
    select bm.user_id from public.tasks t join public.board_members bm on bm.board_id=t.board_id where t.id=_task_id
    union
    select wm.user_id from public.tasks t join public.workspace_members wm on wm.workspace_id=t.workspace_id and wm.role='ADMIN' where t.id=_task_id
  ) c
  where _actor_id is null or c.user_id is distinct from _actor_id;
$$;
revoke all on function app_private.notify_workspace_members_for_task_event(uuid,uuid,uuid,public.notification_type,text,text) from public;

create or replace function public.remove_workspace_member(_workspace_id uuid,_user_id uuid)
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