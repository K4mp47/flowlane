create or replace function app_private.validate_assignee_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.tasks where id = new.task_id;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_workspace_id
      and user_id = new.user_id
      and role in ('ADMIN','MEMBER')
  ) then
    raise exception 'Assignee must be an ADMIN or MEMBER of the task workspace';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_assignee_membership() from public;
