-- Every authenticated member of the tenant shell can create projects.
-- The creator immediately becomes the ADMIN of the new project, while access to
-- existing projects remains explicitly scoped through project_members/board_members.

drop policy if exists projects_insert_admin on public.projects;
drop policy if exists projects_insert_member on public.projects;
create policy projects_insert_member on public.projects
for insert to authenticated
with check (
  app_private.is_workspace_member(workspace_id)
  and created_by = auth.uid()
);

create or replace function public.create_project(_workspace_id uuid,_name text)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_project_id uuid;
  v_board_id uuid;
  v_status record;
begin
  if not app_private.is_workspace_member(_workspace_id) then
    raise exception 'You must belong to the workspace to create a project';
  end if;
  if length(trim(_name)) not between 1 and 120 then
    raise exception 'Project name must be between 1 and 120 characters';
  end if;

  insert into public.projects(workspace_id,name,created_by)
  values(_workspace_id,trim(_name),auth.uid())
  returning id into v_project_id;

  -- Establish project ownership before creating project-owned children so their
  -- RLS policies recognize the creator as the project administrator.
  insert into public.project_members(project_id,user_id,role,added_by)
  values(v_project_id,auth.uid(),'ADMIN',auth.uid());

  if not exists(
    select 1 from public.projects
    where workspace_id=_workspace_id
      and id<>v_project_id
      and is_default
      and archived_at is null
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
    select id,name,position
    from public.workflow_statuses
    where project_id=v_project_id
    order by position
  loop
    insert into public.board_columns(board_id,name,status_id,position)
    values(v_board_id,v_status.name,v_status.id,v_status.position);
  end loop;

  return v_project_id;
end;
$$;

revoke all on function public.create_project(uuid,text) from public;
grant execute on function public.create_project(uuid,text) to authenticated;
