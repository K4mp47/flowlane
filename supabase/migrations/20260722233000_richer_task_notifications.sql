create or replace function app_private.notify_task_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_workspace_id uuid;
  v_project_name text;
  v_old_status public.workflow_statuses%rowtype;
  v_new_status public.workflow_statuses%rowtype;
  v_changes text[] := array[]::text[];
  v_message text;
begin
  select p.workspace_id, p.name into v_workspace_id, v_project_name
  from public.projects p where p.id = new.project_id;

  if tg_op = 'INSERT' then
    select * into v_new_status from public.workflow_statuses where id = new.status_id;
    v_message := 'FL-' || new.task_number::text || ' · ' || new.title || ' was created in ' || coalesce(v_project_name, 'this project') || ' with status ' || coalesce(v_new_status.name, 'Not set') || '.';
    if new.priority is not null then v_message := v_message || ' Priority: ' || initcap(lower(new.priority::text)) || '.'; end if;
    if new.due_date is not null then v_message := v_message || ' Due ' || to_char(new.due_date at time zone 'UTC', 'Mon FMDD, YYYY') || '.'; end if;
    perform app_private.notify_workspace_members_for_task_event(v_workspace_id,new.id,v_actor,'TASK_CREATED','New task created',v_message);
    return new;
  end if;

  if new.status_id is distinct from old.status_id then
    select * into v_old_status from public.workflow_statuses where id = old.status_id;
    select * into v_new_status from public.workflow_statuses where id = new.status_id;
    if v_new_status.notify_on_enter then
      perform app_private.notify_workspace_members_for_task_event(
        v_workspace_id,new.id,v_actor,'STATUS_CHANGE',
        'Task moved to ' || v_new_status.name,
        'FL-' || new.task_number::text || ' · ' || new.title || ' moved from ' || coalesce(v_old_status.name, 'its previous status') || ' to ' || v_new_status.name || ' in ' || coalesce(v_project_name, 'the project') || '.'
      );
    else
      v_changes := array_append(v_changes, 'status changed from ' || coalesce(v_old_status.name, 'Not set') || ' to ' || coalesce(v_new_status.name, 'Not set'));
    end if;
  end if;

  if new.title is distinct from old.title then v_changes := array_append(v_changes, 'title changed from “' || old.title || '” to “' || new.title || '”'); end if;
  if new.priority is distinct from old.priority then v_changes := array_append(v_changes, 'priority changed from ' || coalesce(initcap(lower(old.priority::text)), 'Not set') || ' to ' || coalesce(initcap(lower(new.priority::text)), 'Not set')); end if;
  if new.start_date is distinct from old.start_date then v_changes := array_append(v_changes, 'start date changed from ' || coalesce(to_char(old.start_date at time zone 'UTC','Mon FMDD, YYYY'),'Not set') || ' to ' || coalesce(to_char(new.start_date at time zone 'UTC','Mon FMDD, YYYY'),'Not set')); end if;
  if new.due_date is distinct from old.due_date then v_changes := array_append(v_changes, 'due date changed from ' || coalesce(to_char(old.due_date at time zone 'UTC','Mon FMDD, YYYY'),'No deadline') || ' to ' || coalesce(to_char(new.due_date at time zone 'UTC','Mon FMDD, YYYY'),'No deadline')); end if;
  if new.task_type_id is distinct from old.task_type_id then v_changes := array_append(v_changes, 'task type was changed'); end if;
  if new.context is distinct from old.context then v_changes := array_append(v_changes, 'context was updated'); end if;
  if new.expected_result is distinct from old.expected_result then v_changes := array_append(v_changes, 'expected result was updated'); end if;
  if new.additional_information is distinct from old.additional_information then v_changes := array_append(v_changes, 'additional information was updated'); end if;
  if new.is_blocked is distinct from old.is_blocked then
    v_changes := array_append(v_changes, case when new.is_blocked then 'task was marked blocked' else 'task was unblocked' end);
  elsif new.blocked_reason is distinct from old.blocked_reason then
    v_changes := array_append(v_changes, 'blocked reason was updated');
  end if;
  if new.blocked_by_task_id is distinct from old.blocked_by_task_id then v_changes := array_append(v_changes, 'blocking dependency was changed'); end if;

  if cardinality(v_changes) > 0 then
    v_message := 'FL-' || new.task_number::text || ' · ' || new.title || ': ' || array_to_string(v_changes, '; ') || '.';
    perform app_private.notify_workspace_members_for_task_event(v_workspace_id,new.id,v_actor,'TASK_UPDATED','Task updated',v_message);
  end if;
  return new;
end;
$$;
revoke all on function app_private.notify_task_lifecycle() from public;

create or replace function app_private.handle_assignment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_title text;
  v_task_number bigint;
  v_project_name text;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_user uuid;
begin
  select t.workspace_id, t.title, t.task_number, p.name
    into v_workspace_id, v_title, v_task_number, v_project_name
  from public.tasks t
  join public.projects p on p.id = t.project_id
  where t.id = coalesce(new.task_id, old.task_id);

  select coalesce(pr.display_name, pr.email, 'A workspace member')
    into v_actor_name
  from public.profiles pr where pr.id = v_actor;
  v_actor_name := coalesce(v_actor_name, 'A workspace member');

  if tg_op = 'DELETE' then
    v_user := old.user_id;
    insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
    values (v_workspace_id, old.task_id, v_actor, 'ASSIGNMENT_REMOVED', jsonb_build_object('user_id', old.user_id));
    return old;
  end if;

  v_user := new.user_id;
  insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
  values (v_workspace_id, new.task_id, v_actor, 'ASSIGNMENT_ADDED', jsonb_build_object('user_id', new.user_id));

  if v_user is distinct from v_actor then
    insert into public.notifications(workspace_id, user_id, task_id, type, title, message)
    values (
      v_workspace_id,
      v_user,
      new.task_id,
      'ASSIGNMENT',
      'Task assigned to you',
      v_actor_name || ' assigned you to FL-' || v_task_number::text || ' · ' || v_title || ' in ' || coalesce(v_project_name, 'the project') || '.'
    );
  end if;

  return new;
end;
$$;
revoke all on function app_private.handle_assignment_activity() from public;
