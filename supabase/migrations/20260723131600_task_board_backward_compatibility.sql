-- Older frontend builds did not submit board_id. During the rollout, route those
-- writes to the project's default board so task creation/update remains available.

create or replace function app_private.prepare_task_domain()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_workspace_id uuid;
  v_board_project_id uuid;
begin
  if new.project_id is null or new.status_id is null then
    raise exception 'Task project and status are required';
  end if;

  if new.board_id is null then
    select b.id into new.board_id
    from public.boards b
    where b.project_id=new.project_id
    order by b.is_default desc,b.created_at
    limit 1;
  end if;
  if new.board_id is null then raise exception 'Task board is required'; end if;

  select p.workspace_id into v_workspace_id
  from public.projects p
  where p.id=new.project_id and p.archived_at is null;
  if v_workspace_id is null then raise exception 'Invalid project'; end if;

  select b.project_id into v_board_project_id
  from public.boards b
  where b.id=new.board_id;
  if v_board_project_id is distinct from new.project_id then raise exception 'Board must belong to the task project'; end if;

  if not exists(select 1 from public.workflow_statuses ws where ws.id=new.status_id and ws.project_id=new.project_id) then
    raise exception 'Status must belong to the task project';
  end if;
  if not exists(select 1 from public.board_columns bc where bc.board_id=new.board_id and bc.status_id=new.status_id) then
    raise exception 'Status is not available on the selected board';
  end if;

  new.workspace_id:=v_workspace_id;
  if tg_op='UPDATE' then
    new.creator_id:=old.creator_id;
    if new.project_id is distinct from old.project_id then
      raise exception 'Move tasks between projects by recreating them in the target project';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.prepare_task_domain() from public;
