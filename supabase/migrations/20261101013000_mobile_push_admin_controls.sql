alter table public.student_push_subscriptions
  add column if not exists last_morning_sent_date date,
  add column if not exists last_evening_sent_date date;

create table if not exists public.student_push_settings (
  id integer primary key check (id = 1),
  enabled boolean not null default true,
  morning_enabled boolean not null default true,
  evening_enabled boolean not null default true,
  morning_time text not null default '07:00' check (morning_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  evening_time text not null default '19:00' check (evening_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  min_interval_hours integer not null default 6 check (min_interval_hours between 1 and 48),
  audience text not null default 'all' check (audience in ('all', 'selected')),
  selected_registrations text[] not null default '{}',
  morning_message text not null default '☀️ Good morning, {{name}}! Your FoldBook streak is waiting. Take a 5-minute mini-quest and keep moving toward your goals.',
  evening_message text not null default '🌙 Evening check-in, {{name}}! One quick revision now makes tomorrow easier. Open FoldBook for your next mini-quest.',
  updated_at timestamptz not null default now()
);
insert into public.student_push_settings (id) values (1) on conflict (id) do nothing;
alter table public.student_push_settings enable row level security;
revoke all on public.student_push_settings from anon, authenticated;
grant all on public.student_push_settings to service_role;

create table if not exists public.student_push_campaigns (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('all', 'selected')),
  registrations text[] not null default '{}',
  message text not null check (char_length(message) between 1 and 500),
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed')),
  sent_count integer not null default 0 check (sent_count >= 0),
  created_at timestamptz not null default now(),
  processing_at timestamptz,
  processed_at timestamptz
);
create index if not exists student_push_campaigns_queue_idx
  on public.student_push_campaigns (status, created_at);
alter table public.student_push_campaigns enable row level security;
revoke all on public.student_push_campaigns from anon, authenticated;
grant all on public.student_push_campaigns to service_role;

create or replace function public.claim_foldbook_push_campaign()
returns setof public.student_push_campaigns
language sql
security definer
set search_path = ''
as $$
  update public.student_push_campaigns as campaign
  set status = 'processing', processing_at = now()
  where campaign.id = (
    select id
    from public.student_push_campaigns
    where status = 'queued'
    order by created_at
    for update skip locked
    limit 1
  )
  returning campaign.*;
$$;
revoke all on function public.claim_foldbook_push_campaign() from public, anon, authenticated;
grant execute on function public.claim_foldbook_push_campaign() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

select cron.schedule(
  'foldbook-mobile-push-minute',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://foldbook-beta.vercel.app/api/study-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'foldbook_push_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 8000
    );
  $$
);