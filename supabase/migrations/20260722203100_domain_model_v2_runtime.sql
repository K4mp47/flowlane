create or replace function app_private.sync_task_domain_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_board_id uuid;
  v_column_id uuid;
  v_project_id uuid;
  v_status_id uuid;
  v_legacy_changed boolean := false;
  v_domain_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    v_domain_changed := new.project_id is not null and new.status_id is not null;
    v_legacy_changed := not v_domain_changed and new.board_id is not null and new.column_id is not null;
  else
    v_domain_changed := new.project_id is distinct from old.project_id or new.status_id is distinct from old.status_id;
    v_legacy_changed := not v_domain_changed and (new.board_id is distinct from old.board_id or new.column_id is distinct from old.column_id);
    new.creator_id := old.creator_id;
  end if;

  if v_legacy_changed then
    select b.project_id, bc.status_id
      into v_project_id, v_status_id
    from public.boards b
    join public.board_columns bc on bc.board_id = b.id
    where b.id = new.board_id and bc.id = new.column_id;
    if v_project_id is null or v_status_id is null then raise exception 'Invalid board column'; end if;
    new.project_id := v_project_id;
    new.status_id := v_status_id;
  end if;

  if new.project_id is null or new.status_id is null then raise exception 'Task project and status are required'; end if;
  select p.workspace_id into v_workspace_id from public.projects p where p.id = new.project_id;
  if v_workspace_id is null then raise exception 'Invalid project'; end if;
  if not exists (select 1 from public.workflow_statuses ws where ws.id = new.status_id and ws.project_id = new.project_id) then raise exception 'Status must belong to the task project'; end if;

  if v_domain_changed or not v_legacy_changed then
    select b.id into v_board_id from public.boards b where b.project_id = new.project_id order by b.is_default desc, b.created_at limit 1;
    select bc.id into v_column_id from public.board_columns bc where bc.board_id = v_board_id and bc.status_id = new.status_id order by bc.position limit 1;
    if v_board_id is null or v_column_id is null then raise exception 'Project board is missing a column for the selected status'; end if;
    new.board_id := v_board_id;
    new.column_id := v_column_id;
  end if;

  new.workspace_id := v_workspace_id;
  return new;
end;
$$;
revoke all on function app_private.sync_task_domain_fields() from public;

drop trigger if exists tasks_sync_domain_fields on public.tasks;
drop trigger if exists tasks_set_completion_from_status on public.tasks;
drop trigger if exists tasks_01_sync_domain_fields on public.tasks;
drop trigger if exists tasks_02_set_completion_from_status on public.tasks;
create trigger tasks_01_sync_domain_fields before insert or update on public.tasks for each row execute function app_private.sync_task_domain_fields();
create trigger tasks_02_set_completion_from_status before insert or update on public.tasks for each row execute function app_private.set_task_completion_from_status();

create or replace function app_private.validate_assignee_membership()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_workspace_id uuid;
begin
  select p.workspace_id into v_workspace_id from public.tasks t join public.projects p on p.id=t.project_id where t.id=new.task_id;
  if not exists (select 1 from public.workspace_members where workspace_id=v_workspace_id and user_id=new.user_id and role in ('ADMIN','MEMBER')) then
    raise exception 'Assignee must be an ADMIN or MEMBER of the task workspace';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_assignee_membership() from public;

create or replace function app_private.validate_task_label()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.tasks t
    join public.projects p on p.id=t.project_id
    join public.labels l on l.id=new.label_id and l.workspace_id=p.workspace_id
    where t.id=new.task_id
  ) then raise exception 'Label must belong to the task workspace'; end if;
  return new;
end;
$$;
revoke all on function app_private.validate_task_label() from public;

create or replace function app_private.log_task_activity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_workspace_id uuid;
  v_old_status public.workflow_statuses%rowtype;
  v_new_status public.workflow_statuses%rowtype;
begin
  select workspace_id into v_workspace_id from public.projects where id=new.project_id;
  if tg_op='INSERT' then
    insert into public.activity_events(workspace_id,task_id,actor_id,event_type,metadata) values(v_workspace_id,new.id,v_actor,'TASK_CREATED',jsonb_build_object('title',new.title,'project_id',new.project_id));
    return new;
  end if;
  if new.status_id is distinct from old.status_id then
    select * into v_old_status from public.workflow_statuses where id=old.status_id;
    select * into v_new_status from public.workflow_statuses where id=new.status_id;
    insert into public.activity_events(workspace_id,task_id,actor_id,event_type,metadata) values(v_workspace_id,new.id,v_actor,'STATUS_CHANGED',jsonb_build_object('from',v_old_status.name,'to',v_new_status.name,'from_status_id',old.status_id,'to_status_id',new.status_id));
    if v_new_status.is_terminal and not coalesce(v_old_status.is_terminal,false) then
      insert into public.activity_events(workspace_id,task_id,actor_id,event_type,metadata) values(v_workspace_id,new.id,v_actor,'TASK_COMPLETED','{}'::jsonb);
    end if;
  end if;
  if new.priority is distinct from old.priority then insert into public.activity_events(workspace_id,task_id,actor_id,event_type,metadata) values(v_workspace_id,new.id,v_actor,'PRIORITY_CHANGED',jsonb_build_object('from',old.priority,'to',new.priority)); end if;
  if new.is_blocked is distinct from old.is_blocked then insert into public.activity_events(workspace_id,task_id,actor_id,event_type,metadata) values(v_workspace_id,new.id,v_actor,case when new.is_blocked then 'TASK_BLOCKED'::public.activity_event_type else 'TASK_UNBLOCKED'::public.activity_event_type end,jsonb_build_object('reason',new.blocked_reason)); end if;
  return new;
end;
$$;
revoke all on function app_private.log_task_activity() from public;

create or replace function app_private.notify_task_lifecycle()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_workspace_id uuid;
  v_status public.workflow_statuses%rowtype;
  v_modified boolean := false;
begin
  select workspace_id into v_workspace_id from public.projects where id=new.project_id;
  if tg_op='INSERT' then
    perform app_private.notify_workspace_members_for_task_event(v_workspace_id,new.id,v_actor,'TASK_CREATED','New task created','FL-'||new.task_number::text||' · '||new.title);
    return new;
  end if;
  if new.status_id is distinct from old.status_id then
    select * into v_status from public.workflow_statuses where id=new.status_id;
    if v_status.notify_on_enter then
      perform app_private.notify_workspace_members_for_task_event(v_workspace_id,new.id,v_actor,'STATUS_CHANGE','Task moved to '||v_status.name,'FL-'||new.task_number::text||' · '||new.title||' moved to '||v_status.name||'.');
    else v_modified := true; end if;
  end if;
  if new.title is distinct from old.title or new.context is distinct from old.context or new.expected_result is distinct from old.expected_result or new.additional_information is distinct from old.additional_information or new.task_type_id is distinct from old.task_type_id or new.priority is distinct from old.priority or new.start_date is distinct from old.start_date or new.due_date is distinct from old.due_date or new.is_blocked is distinct from old.is_blocked or new.blocked_reason is distinct from old.blocked_reason or new.blocked_by_task_id is distinct from old.blocked_by_task_id then v_modified := true; end if;
  if v_modified then perform app_private.notify_workspace_members_for_task_event(v_workspace_id,new.id,v_actor,'TASK_UPDATED','Task updated','FL-'||new.task_number::text||' · '||new.title); end if;
  return new;
end;
$$;
revoke all on function app_private.notify_task_lifecycle() from public;
