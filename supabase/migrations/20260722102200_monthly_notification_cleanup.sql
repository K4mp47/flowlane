create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'flowlane-monthly-notification-cleanup') then
    perform cron.unschedule((select jobid from cron.job where jobname = 'flowlane-monthly-notification-cleanup' limit 1));
  end if;
end
$$;

select cron.schedule(
  'flowlane-monthly-notification-cleanup',
  '10 0 1 * *',
  $$delete from public.notifications where created_at < date_trunc('month', now());$$
);
