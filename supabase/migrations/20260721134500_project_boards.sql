create unique index if not exists boards_one_default_per_workspace_idx
  on public.boards(workspace_id)
  where is_default;

create or replace function public.create_project_board(_workspace_id uuid, _name text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  _board_id uuid;
begin
  if not app_private.is_workspace_admin(_workspace_id) then
    raise exception 'Only workspace admins can create project boards';
  end if;

  if length(trim(_name)) < 1 or length(trim(_name)) > 120 then
    raise exception 'Project board name must be between 1 and 120 characters';
  end if;

  insert into public.boards (workspace_id, name, is_default)
  values (_workspace_id, trim(_name), false)
  returning id into _board_id;

  insert into public.board_columns (board_id, name, workflow_stage, position)
  values
    (_board_id, 'Backlog', 'BACKLOG', 1000),
    (_board_id, 'To Do', 'TODO', 2000),
    (_board_id, 'In Progress', 'IN_PROGRESS', 3000),
    (_board_id, 'Review', 'REVIEW', 4000),
    (_board_id, 'Done', 'DONE', 5000);

  return _board_id;
end;
$$;

create or replace function public.set_default_project_board(_workspace_id uuid, _board_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not app_private.is_workspace_admin(_workspace_id) then
    raise exception 'Only workspace admins can change the default project board';
  end if;

  if not exists (select 1 from public.boards where id = _board_id and workspace_id = _workspace_id) then
    raise exception 'Project board not found';
  end if;

  update public.boards set is_default = false where workspace_id = _workspace_id and is_default;
  update public.boards set is_default = true where id = _board_id and workspace_id = _workspace_id;
end;
$$;

create or replace function public.delete_project_board(_workspace_id uuid, _board_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  _was_default boolean;
  _replacement uuid;
begin
  if not app_private.is_workspace_admin(_workspace_id) then
    raise exception 'Only workspace admins can delete project boards';
  end if;

  select is_default into _was_default
  from public.boards
  where id = _board_id and workspace_id = _workspace_id;

  if not found then
    raise exception 'Project board not found';
  end if;

  if (select count(*) from public.boards where workspace_id = _workspace_id) <= 1 then
    raise exception 'A workspace must keep at least one project board';
  end if;

  if exists (select 1 from public.tasks where board_id = _board_id) then
    raise exception 'Move or delete all tasks from this board before deleting it';
  end if;

  if _was_default then
    select id into _replacement
    from public.boards
    where workspace_id = _workspace_id and id <> _board_id
    order by created_at
    limit 1;

    update public.boards set is_default = false where id = _board_id;
    update public.boards set is_default = true where id = _replacement;
  end if;

  delete from public.boards where id = _board_id and workspace_id = _workspace_id;
end;
$$;

revoke all on function public.create_project_board(uuid, text) from public;
revoke all on function public.set_default_project_board(uuid, uuid) from public;
revoke all on function public.delete_project_board(uuid, uuid) from public;
grant execute on function public.create_project_board(uuid, text) to authenticated;
grant execute on function public.set_default_project_board(uuid, uuid) to authenticated;
grant execute on function public.delete_project_board(uuid, uuid) to authenticated;
