create or replace function app_private.notify_workspace_members_for_task_event(
  _workspace_id uuid,
  _task_id uuid,
  _actor_id uuid,
  _type public.notification_type,
  _title text,
  _message text
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications(workspace_id, user_id, task_id, type, title, message)
  select _workspace_id, wm.user_id, _task_id, _type, _title, _message
  from public.workspace_members wm
  where wm.workspace_id = _workspace_id
    and (_actor_id is null or wm.user_id is distinct from _actor_id);
$$;

revoke all on function app_private.notify_workspace_members_for_task_event(uuid, uuid, uuid, public.notification_type, text, text) from public;

create or replace function app_private.notify_task_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_old_stage public.workflow_stage_type;
  v_new_stage public.workflow_stage_type;
  v_modified boolean := false;
begin
  if tg_op = 'INSERT' then
    perform app_private.notify_workspace_members_for_task_event(
      new.workspace_id,
      new.id,
      v_actor,
      'TASK_CREATED',
      'New task created',
      'FL-' || new.task_number::text || ' · ' || new.title
    );
    return new;
  end if;

  if new.column_id is distinct from old.column_id then
    select workflow_stage into v_old_stage from public.board_columns where id = old.column_id;
    select workflow_stage into v_new_stage from public.board_columns where id = new.column_id;

    if v_new_stage = 'REVIEW' and v_old_stage is distinct from 'REVIEW' then
      perform app_private.notify_workspace_members_for_task_event(
        new.workspace_id,
        new.id,
        v_actor,
        'STATUS_CHANGE',
        'Task moved to Review',
        'FL-' || new.task_number::text || ' · ' || new.title || ' is ready for review.'
      );
    else
      v_modified := true;
    end if;
  end if;

  if new.title is distinct from old.title
    or new.context is distinct from old.context
    or new.expected_result is distinct from old.expected_result
    or new.additional_information is distinct from old.additional_information
    or new.task_type_id is distinct from old.task_type_id
    or new.priority is distinct from old.priority
    or new.due_date is distinct from old.due_date
    or new.is_blocked is distinct from old.is_blocked
    or new.blocked_reason is distinct from old.blocked_reason
    or new.blocked_by_task_id is distinct from old.blocked_by_task_id
  then
    v_modified := true;
  end if;

  if v_modified then
    perform app_private.notify_workspace_members_for_task_event(
      new.workspace_id,
      new.id,
      v_actor,
      'TASK_UPDATED',
      'Task updated',
      'FL-' || new.task_number::text || ' · ' || new.title
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.notify_task_lifecycle() from public;

drop trigger if exists tasks_notify_status_change on public.tasks;
drop trigger if exists tasks_notify_lifecycle on public.tasks;
create trigger tasks_notify_lifecycle
after insert or update on public.tasks
for each row execute function app_private.notify_task_lifecycle();
