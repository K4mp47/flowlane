create or replace function app_private.notify_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old_stage public.workflow_stage_type;
  v_new_stage public.workflow_stage_type;
  v_assignee uuid;
begin
  if new.column_id is not distinct from old.column_id then
    return new;
  end if;

  select workflow_stage into v_old_stage from public.board_columns where id = old.column_id;
  select workflow_stage into v_new_stage from public.board_columns where id = new.column_id;

  for v_assignee in
    select user_id from public.task_assignees where task_id = new.id and user_id is distinct from v_actor
  loop
    insert into public.notifications(workspace_id, user_id, task_id, type, title, message)
    values (
      new.workspace_id,
      v_assignee,
      new.id,
      'STATUS_CHANGE',
      'Task status changed',
      format('%s moved from %s to %s', new.title, replace(v_old_stage::text, '_', ' '), replace(v_new_stage::text, '_', ' '))
    );
  end loop;

  return new;
end;
$$;

revoke all on function app_private.notify_task_status_change() from public;
drop trigger if exists tasks_notify_status_change on public.tasks;
create trigger tasks_notify_status_change after update of column_id on public.tasks
for each row execute function app_private.notify_task_status_change();

create or replace function app_private.notify_task_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_title text;
  v_assignee uuid;
begin
  select workspace_id, title into v_workspace_id, v_title from public.tasks where id = new.task_id;

  for v_assignee in
    select user_id from public.task_assignees where task_id = new.task_id and user_id is distinct from new.author_id
  loop
    insert into public.notifications(workspace_id, user_id, task_id, type, title, message)
    values (
      v_workspace_id,
      v_assignee,
      new.task_id,
      'COMMENT',
      'New comment on assigned task',
      v_title
    );
  end loop;

  return new;
end;
$$;

revoke all on function app_private.notify_task_comment() from public;
drop trigger if exists comments_notify_assignees on public.comments;
create trigger comments_notify_assignees after insert on public.comments
for each row execute function app_private.notify_task_comment();
