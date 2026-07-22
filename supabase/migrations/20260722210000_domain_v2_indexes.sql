create index if not exists projects_created_by_idx on public.projects(created_by) where created_by is not null;
create index if not exists tasks_status_idx on public.tasks(status_id);
