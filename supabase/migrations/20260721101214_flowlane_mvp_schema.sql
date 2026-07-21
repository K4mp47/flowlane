create schema if not exists app_private;

create type public.workspace_role_type as enum ('ADMIN', 'MEMBER', 'VIEWER');
create type public.workflow_stage_type as enum ('BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE');
create type public.task_priority_type as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
create type public.activity_event_type as enum (
  'TASK_CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'TASK_BLOCKED',
  'TASK_UNBLOCKED', 'TASK_COMPLETED', 'ASSIGNMENT_ADDED', 'ASSIGNMENT_REMOVED',
  'COMMENT_ADDED'
);
create type public.notification_type as enum ('ASSIGNMENT', 'MENTION', 'DUE_SOON', 'OVERDUE');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role_type not null default 'MEMBER',
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  workflow_stage public.workflow_stage_type not null,
  position numeric(20,6) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, workflow_stage),
  unique (id, board_id)
);

create table public.task_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  color text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_number bigint generated always as identity,
  workspace_id uuid not null,
  board_id uuid not null,
  column_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  context text,
  expected_result text,
  additional_information text,
  task_type_id uuid,
  priority public.task_priority_type,
  creator_id uuid not null references auth.users(id) on delete restrict,
  due_date timestamptz,
  is_blocked boolean not null default false,
  blocked_reason text,
  blocked_by_task_id uuid references public.tasks(id) on delete set null,
  position numeric(20,6) not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tasks_board_workspace_fk foreign key (board_id, workspace_id)
    references public.boards(id, workspace_id) on delete cascade,
  constraint tasks_column_board_fk foreign key (column_id, board_id)
    references public.board_columns(id, board_id) on delete restrict,
  constraint tasks_type_workspace_fk foreign key (task_type_id, workspace_id)
    references public.task_types(id, workspace_id) on delete restrict,
  constraint tasks_blocked_reason_ck check (
    not is_blocked or nullif(trim(coalesce(blocked_reason, '')), '') is not null
  )
);

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (task_id, label_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 500),
  is_completed boolean not null default false,
  position numeric(20,6) not null default 1000,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create table public.activity_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type public.activity_event_type not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  message text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_assignment boolean not null default true,
  email_mention boolean not null default true,
  email_due_soon boolean not null default true,
  email_overdue boolean not null default true,
  email_status_change boolean not null default false,
  email_new_task boolean not null default false,
  email_comment boolean not null default false,
  updated_at timestamptz not null default now()
);

create index workspace_members_user_idx on public.workspace_members(user_id);
create index boards_workspace_idx on public.boards(workspace_id);
create index board_columns_board_position_idx on public.board_columns(board_id, position);
create index task_types_workspace_idx on public.task_types(workspace_id);
create index labels_workspace_idx on public.labels(workspace_id);
create index tasks_workspace_idx on public.tasks(workspace_id);
create index tasks_board_column_position_idx on public.tasks(board_id, column_id, position);
create index tasks_due_date_idx on public.tasks(due_date) where due_date is not null;
create index tasks_priority_idx on public.tasks(priority) where priority is not null;
create index tasks_creator_idx on public.tasks(creator_id);
create index task_assignees_user_idx on public.task_assignees(user_id);
create index task_labels_label_idx on public.task_labels(label_id);
create index comments_task_created_idx on public.comments(task_id, created_at);
create index checklist_task_position_idx on public.checklist_items(task_id, position);
create index attachments_task_idx on public.attachments(task_id);
create index activity_workspace_created_idx on public.activity_events(workspace_id, created_at desc);
create index activity_task_created_idx on public.activity_events(task_id, created_at desc);
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;

create or replace function app_private.is_workspace_member(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = _workspace_id
        and wm.user_id = (select auth.uid())
    );
$$;

create or replace function app_private.workspace_role_for(_workspace_id uuid)
returns public.workspace_role_type
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = _workspace_id
    and wm.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function app_private.can_write_workspace(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app_private.workspace_role_for(_workspace_id) in ('ADMIN', 'MEMBER'), false);
$$;

create or replace function app_private.is_workspace_admin(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app_private.workspace_role_for(_workspace_id) = 'ADMIN', false);
$$;

create or replace function app_private.shares_workspace_with(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = _user_id
    );
$$;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;
revoke all on function app_private.is_workspace_member(uuid) from public;
revoke all on function app_private.workspace_role_for(uuid) from public;
revoke all on function app_private.can_write_workspace(uuid) from public;
revoke all on function app_private.is_workspace_admin(uuid) from public;
revoke all on function app_private.shares_workspace_with(uuid) from public;
grant execute on function app_private.is_workspace_member(uuid) to authenticated;
grant execute on function app_private.workspace_role_for(uuid) to authenticated;
grant execute on function app_private.can_write_workspace(uuid) to authenticated;
grant execute on function app_private.is_workspace_admin(uuid) to authenticated;
grant execute on function app_private.shares_workspace_with(uuid) to authenticated;

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles for each row execute function app_private.touch_updated_at();
create trigger workspaces_touch_updated_at before update on public.workspaces for each row execute function app_private.touch_updated_at();
create trigger boards_touch_updated_at before update on public.boards for each row execute function app_private.touch_updated_at();
create trigger columns_touch_updated_at before update on public.board_columns for each row execute function app_private.touch_updated_at();
create trigger tasks_touch_updated_at before update on public.tasks for each row execute function app_private.touch_updated_at();
create trigger comments_touch_updated_at before update on public.comments for each row execute function app_private.touch_updated_at();
create trigger checklist_touch_updated_at before update on public.checklist_items for each row execute function app_private.touch_updated_at();
create trigger notification_preferences_touch_updated_at before update on public.notification_preferences for each row execute function app_private.touch_updated_at();

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles(id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.notification_preferences(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
revoke all on function app_private.handle_new_user() from public;

create trigger on_auth_user_created after insert on auth.users for each row execute function app_private.handle_new_user();

create or replace function app_private.bootstrap_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_board_id uuid;
begin
  insert into public.workspace_members(workspace_id, user_id, role, added_by)
  values (new.id, new.created_by, 'ADMIN', new.created_by);

  insert into public.boards(workspace_id, name, is_default)
  values (new.id, 'Main Board', true)
  returning id into v_board_id;

  insert into public.board_columns(board_id, name, workflow_stage, position) values
    (v_board_id, 'Backlog', 'BACKLOG', 1000),
    (v_board_id, 'To Do', 'TODO', 2000),
    (v_board_id, 'In Progress', 'IN_PROGRESS', 3000),
    (v_board_id, 'Review', 'REVIEW', 4000),
    (v_board_id, 'Done', 'DONE', 5000);

  insert into public.task_types(workspace_id, name, description) values
    (new.id, 'Bug', 'Defect or unexpected behaviour'),
    (new.id, 'Feature', 'New capability or functionality'),
    (new.id, 'Improvement', 'Enhancement to existing functionality'),
    (new.id, 'Maintenance', 'Maintenance or technical upkeep'),
    (new.id, 'Research', 'Investigation or discovery work'),
    (new.id, 'Documentation', 'Documentation work'),
    (new.id, 'Support', 'Support or operational request');

  return new;
end;
$$;
revoke all on function app_private.bootstrap_workspace() from public;
create trigger on_workspace_created after insert on public.workspaces for each row execute function app_private.bootstrap_workspace();

create or replace function app_private.validate_task_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stage public.workflow_stage_type;
begin
  if tg_op = 'UPDATE' then
    new.creator_id := old.creator_id;
    new.workspace_id := old.workspace_id;
  end if;

  select workflow_stage into v_stage
  from public.board_columns
  where id = new.column_id and board_id = new.board_id;

  if v_stage is null then
    raise exception 'Invalid board column';
  end if;

  if v_stage <> 'BACKLOG' then
    if nullif(trim(coalesce(new.context, '')), '') is null
       or nullif(trim(coalesce(new.expected_result, '')), '') is null
       or new.task_type_id is null
       or new.priority is null then
      raise exception 'Task is not ready: context, expected result, type and priority are required outside Backlog';
    end if;

    if not exists (select 1 from public.task_assignees a where a.task_id = new.id) then
      raise exception 'Task is not ready: at least one assignee is required outside Backlog';
    end if;
  end if;

  if v_stage = 'DONE' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;
revoke all on function app_private.validate_task_transition() from public;
create trigger tasks_validate_transition before insert or update on public.tasks for each row execute function app_private.validate_task_transition();

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
    where workspace_id = v_workspace_id and user_id = new.user_id
  ) then
    raise exception 'Assignee must be a member of the task workspace';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_assignee_membership() from public;
create trigger task_assignees_validate_membership before insert or update on public.task_assignees for each row execute function app_private.validate_assignee_membership();

create or replace function app_private.validate_task_label()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.tasks t
    join public.labels l on l.id = new.label_id and l.workspace_id = t.workspace_id
    where t.id = new.task_id
  ) then
    raise exception 'Label must belong to the task workspace';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_task_label() from public;
create trigger task_labels_validate_workspace before insert or update on public.task_labels for each row execute function app_private.validate_task_label();

create or replace function app_private.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old_stage public.workflow_stage_type;
  v_new_stage public.workflow_stage_type;
begin
  if tg_op = 'INSERT' then
    insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
    values (new.workspace_id, new.id, v_actor, 'TASK_CREATED', jsonb_build_object('title', new.title));
    return new;
  end if;

  if new.column_id is distinct from old.column_id then
    select workflow_stage into v_old_stage from public.board_columns where id = old.column_id;
    select workflow_stage into v_new_stage from public.board_columns where id = new.column_id;
    insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
    values (new.workspace_id, new.id, v_actor, 'STATUS_CHANGED', jsonb_build_object('from', v_old_stage, 'to', v_new_stage));
    if v_new_stage = 'DONE' and v_old_stage is distinct from 'DONE' then
      insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
      values (new.workspace_id, new.id, v_actor, 'TASK_COMPLETED', '{}'::jsonb);
    end if;
  end if;

  if new.priority is distinct from old.priority then
    insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
    values (new.workspace_id, new.id, v_actor, 'PRIORITY_CHANGED', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;

  if new.is_blocked is distinct from old.is_blocked then
    insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
    values (
      new.workspace_id,
      new.id,
      v_actor,
      case when new.is_blocked then 'TASK_BLOCKED'::public.activity_event_type else 'TASK_UNBLOCKED'::public.activity_event_type end,
      jsonb_build_object('reason', new.blocked_reason)
    );
  end if;

  return new;
end;
$$;
revoke all on function app_private.log_task_activity() from public;
create trigger tasks_log_activity after insert or update on public.tasks for each row execute function app_private.log_task_activity();

create or replace function app_private.handle_assignment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_title text;
  v_actor uuid := (select auth.uid());
  v_user uuid;
begin
  if tg_op = 'DELETE' then
    select workspace_id, title into v_workspace_id, v_title from public.tasks where id = old.task_id;
    v_user := old.user_id;
    insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
    values (v_workspace_id, old.task_id, v_actor, 'ASSIGNMENT_REMOVED', jsonb_build_object('user_id', old.user_id));
    return old;
  end if;

  select workspace_id, title into v_workspace_id, v_title from public.tasks where id = new.task_id;
  v_user := new.user_id;
  insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
  values (v_workspace_id, new.task_id, v_actor, 'ASSIGNMENT_ADDED', jsonb_build_object('user_id', new.user_id));

  if v_user is distinct from v_actor then
    insert into public.notifications(workspace_id, user_id, task_id, type, title, message)
    values (v_workspace_id, v_user, new.task_id, 'ASSIGNMENT', 'New task assigned to you', v_title);
  end if;

  return new;
end;
$$;
revoke all on function app_private.handle_assignment_activity() from public;
create trigger task_assignees_activity after insert or delete on public.task_assignees for each row execute function app_private.handle_assignment_activity();

create or replace function app_private.log_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.tasks where id = new.task_id;
  insert into public.activity_events(workspace_id, task_id, actor_id, event_type, metadata)
  values (v_workspace_id, new.task_id, new.author_id, 'COMMENT_ADDED', jsonb_build_object('comment_id', new.id));
  return new;
end;
$$;
revoke all on function app_private.log_comment_activity() from public;
create trigger comments_log_activity after insert on public.comments for each row execute function app_private.log_comment_activity();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.boards enable row level security;
alter table public.board_columns enable row level security;
alter table public.task_types enable row level security;
alter table public.labels enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_labels enable row level security;
alter table public.comments enable row level security;
alter table public.checklist_items enable row level security;
alter table public.attachments enable row level security;
alter table public.activity_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using ((select auth.uid()) = id or app_private.shares_workspace_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy workspaces_select on public.workspaces for select to authenticated using (app_private.is_workspace_member(id));
create policy workspaces_insert on public.workspaces for insert to authenticated with check ((select auth.uid()) = created_by);
create policy workspaces_update_admin on public.workspaces for update to authenticated using (app_private.is_workspace_admin(id)) with check (app_private.is_workspace_admin(id));
create policy workspaces_delete_admin on public.workspaces for delete to authenticated using (app_private.is_workspace_admin(id));

create policy workspace_members_select on public.workspace_members for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy workspace_members_insert_admin on public.workspace_members for insert to authenticated with check (app_private.is_workspace_admin(workspace_id));
create policy workspace_members_update_admin on public.workspace_members for update to authenticated using (app_private.is_workspace_admin(workspace_id)) with check (app_private.is_workspace_admin(workspace_id));
create policy workspace_members_delete_admin on public.workspace_members for delete to authenticated using (app_private.is_workspace_admin(workspace_id));

create policy boards_select on public.boards for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy boards_insert_admin on public.boards for insert to authenticated with check (app_private.is_workspace_admin(workspace_id));
create policy boards_update_admin on public.boards for update to authenticated using (app_private.is_workspace_admin(workspace_id)) with check (app_private.is_workspace_admin(workspace_id));
create policy boards_delete_admin on public.boards for delete to authenticated using (app_private.is_workspace_admin(workspace_id));

create policy columns_select on public.board_columns for select to authenticated
using (exists (select 1 from public.boards b where b.id = board_id and app_private.is_workspace_member(b.workspace_id)));
create policy columns_insert_admin on public.board_columns for insert to authenticated
with check (exists (select 1 from public.boards b where b.id = board_id and app_private.is_workspace_admin(b.workspace_id)));
create policy columns_update_admin on public.board_columns for update to authenticated
using (exists (select 1 from public.boards b where b.id = board_id and app_private.is_workspace_admin(b.workspace_id)))
with check (exists (select 1 from public.boards b where b.id = board_id and app_private.is_workspace_admin(b.workspace_id)));
create policy columns_delete_admin on public.board_columns for delete to authenticated
using (exists (select 1 from public.boards b where b.id = board_id and app_private.is_workspace_admin(b.workspace_id)));

create policy task_types_select on public.task_types for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy task_types_insert_admin on public.task_types for insert to authenticated with check (app_private.is_workspace_admin(workspace_id));
create policy task_types_update_admin on public.task_types for update to authenticated using (app_private.is_workspace_admin(workspace_id)) with check (app_private.is_workspace_admin(workspace_id));
create policy task_types_delete_admin on public.task_types for delete to authenticated using (app_private.is_workspace_admin(workspace_id));

create policy labels_select on public.labels for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy labels_insert_admin on public.labels for insert to authenticated with check (app_private.is_workspace_admin(workspace_id));
create policy labels_update_admin on public.labels for update to authenticated using (app_private.is_workspace_admin(workspace_id)) with check (app_private.is_workspace_admin(workspace_id));
create policy labels_delete_admin on public.labels for delete to authenticated using (app_private.is_workspace_admin(workspace_id));

create policy tasks_select on public.tasks for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy tasks_insert_writer on public.tasks for insert to authenticated with check (app_private.can_write_workspace(workspace_id) and creator_id = (select auth.uid()));
create policy tasks_update_writer on public.tasks for update to authenticated using (app_private.can_write_workspace(workspace_id)) with check (app_private.can_write_workspace(workspace_id));
create policy tasks_delete_admin on public.tasks for delete to authenticated using (app_private.is_workspace_admin(workspace_id));

create policy assignees_select on public.task_assignees for select to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.is_workspace_member(t.workspace_id)));
create policy assignees_insert_writer on public.task_assignees for insert to authenticated
with check (exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));
create policy assignees_delete_writer on public.task_assignees for delete to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));

create policy task_labels_select on public.task_labels for select to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.is_workspace_member(t.workspace_id)));
create policy task_labels_insert_writer on public.task_labels for insert to authenticated
with check (exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));
create policy task_labels_delete_writer on public.task_labels for delete to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));

create policy comments_select on public.comments for select to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.is_workspace_member(t.workspace_id)));
create policy comments_insert_writer on public.comments for insert to authenticated
with check (author_id = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));
create policy comments_update_own on public.comments for update to authenticated
using (author_id = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)))
with check (author_id = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));
create policy comments_delete_own_or_admin on public.comments for delete to authenticated
using (author_id = (select auth.uid()) or exists (select 1 from public.tasks t where t.id = task_id and app_private.is_workspace_admin(t.workspace_id)));

create policy checklist_select on public.checklist_items for select to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.is_workspace_member(t.workspace_id)));
create policy checklist_insert_writer on public.checklist_items for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));
create policy checklist_update_writer on public.checklist_items for update to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)))
with check (exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));
create policy checklist_delete_writer on public.checklist_items for delete to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));

create policy attachments_select on public.attachments for select to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.is_workspace_member(t.workspace_id)));
create policy attachments_insert_writer on public.attachments for insert to authenticated
with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));
create policy attachments_delete_writer on public.attachments for delete to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id and app_private.can_write_workspace(t.workspace_id)));

create policy activity_select on public.activity_events for select to authenticated using (app_private.is_workspace_member(workspace_id));

create policy notifications_select_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy notification_preferences_select_own on public.notification_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_insert_own on public.notification_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_preferences_update_own on public.notification_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.boards to authenticated;
grant select, insert, update, delete on public.board_columns to authenticated;
grant select, insert, update, delete on public.task_types to authenticated;
grant select, insert, update, delete on public.labels to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, delete on public.task_assignees to authenticated;
grant select, insert, delete on public.task_labels to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select, insert, update, delete on public.checklist_items to authenticated;
grant select, insert, delete on public.attachments to authenticated;
grant select on public.activity_events to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-attachments',
  'task-attachments',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf','text/plain']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy task_attachments_read on storage.objects for select to authenticated
using (
  bucket_id = 'task-attachments'
  and exists (
    select 1 from public.workspace_members wm
    where wm.user_id = (select auth.uid())
      and wm.workspace_id::text = (storage.foldername(name))[1]
  )
);

create policy task_attachments_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-attachments'
  and exists (
    select 1 from public.workspace_members wm
    where wm.user_id = (select auth.uid())
      and wm.role in ('ADMIN','MEMBER')
      and wm.workspace_id::text = (storage.foldername(name))[1]
  )
);

create policy task_attachments_update on storage.objects for update to authenticated
using (
  bucket_id = 'task-attachments'
  and exists (
    select 1 from public.workspace_members wm
    where wm.user_id = (select auth.uid())
      and wm.role in ('ADMIN','MEMBER')
      and wm.workspace_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'task-attachments'
  and exists (
    select 1 from public.workspace_members wm
    where wm.user_id = (select auth.uid())
      and wm.role in ('ADMIN','MEMBER')
      and wm.workspace_id::text = (storage.foldername(name))[1]
  )
);

create policy task_attachments_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'task-attachments'
  and exists (
    select 1 from public.workspace_members wm
    where wm.user_id = (select auth.uid())
      and wm.role in ('ADMIN','MEMBER')
      and wm.workspace_id::text = (storage.foldername(name))[1]
  )
);

alter table public.tasks replica identity full;
alter table public.task_assignees replica identity full;
alter table public.comments replica identity full;
alter table public.notifications replica identity full;
alter table public.checklist_items replica identity full;

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_assignees;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.checklist_items;
