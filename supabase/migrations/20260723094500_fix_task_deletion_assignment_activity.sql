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
  if tg_op = 'DELETE' then
    -- When a task is deleted, task_assignees rows are removed via ON DELETE CASCADE.
    -- At this point the parent task may already be unavailable to this trigger, so
    -- looking up workspace_id/title through public.tasks can return NULL and make
    -- the activity_events insert violate its NOT NULL workspace_id constraint.
    -- Skip assignment activity for cascade deletes; the task deletion itself is the
    -- authoritative lifecycle event.
    if not exists (select 1 from public.tasks t where t.id = old.task_id) then
      return old;
    end if;

    select t.workspace_id, t.title, t.task_number, p.name
      into v_workspace_id, v_title, v_task_number, v_project_name
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = old.task_id;

    v_user := old.user_id;
    insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
    values (
      v_workspace_id,
      old.task_id,
      v_actor,
      'ASSIGNMENT_REMOVED',
      jsonb_build_object('user_id', old.user_id)
    );
    return old;
  end if;

  select t.workspace_id, t.title, t.task_number, p.name
    into v_workspace_id, v_title, v_task_number, v_project_name
  from public.tasks t
  join public.projects p on p.id = t.project_id
  where t.id = new.task_id;

  select coalesce(pr.display_name, pr.email, 'A workspace member')
    into v_actor_name
  from public.profiles pr
  where pr.id = v_actor;
  v_actor_name := coalesce(v_actor_name, 'A workspace member');

  v_user := new.user_id;
  insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
  values (
    v_workspace_id,
    new.task_id,
    v_actor,
    'ASSIGNMENT_ADDED',
    jsonb_build_object('user_id', new.user_id)
  );

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
