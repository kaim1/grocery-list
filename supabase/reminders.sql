-- Reminders: run once in the Supabase SQL Editor, after schema.sql.
-- See REMINDERS-SETUP.md for the full setup.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One row per device that turned reminders on.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Remembers which reminders were already sent, so each one is sent once.
create table if not exists public.sent_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  todo_id text not null,
  remind_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, todo_id, remind_at)
);

-- Only the edge function (service role) reads these tables.
alter table public.push_subscriptions enable row level security;
alter table public.sent_reminders enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.sent_reminders from anon, authenticated;

-- The app registers its device through this function. There is deliberately no user_id argument.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2048
    or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Invalid subscription';
  end if;
  insert into public.push_subscriptions(endpoint, user_id, p256dh, auth)
    values (p_endpoint, auth.uid(), p_p256dh, p_auth)
    on conflict (endpoint) do update
      set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Every minute, ask the edge function to send the reminders that are due.
select cron.unschedule('send-reminders') where exists (
  select 1 from cron.job where jobname = 'send-reminders');
select cron.schedule('send-reminders', '* * * * *', $$
  select net.http_post(
    url := 'https://herzjfdrakjfwihemjrp.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);

-- Old send records are only needed for a few hours.
select cron.unschedule('prune-sent-reminders') where exists (
  select 1 from cron.job where jobname = 'prune-sent-reminders');
select cron.schedule('prune-sent-reminders', '17 3 * * *', $$
  delete from public.sent_reminders where remind_at < now() - interval '7 days';
$$);
