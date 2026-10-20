-- Admin-managed WhatsApp reminder schedule and worker heartbeat.
create table if not exists public.whatsapp_bot_settings (
  id integer primary key check (id = 1),
  enabled boolean not null default true,
  morning_time text not null default '07:00' check (morning_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  evening_time text not null default '19:00' check (evening_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  min_interval_hours integer not null default 10 check (min_interval_hours between 6 and 48),
  audience text not null default 'all' check (audience in ('all', 'inactive')),
  morning_message text not null default 'Good morning {{name}}! {{streak}}. Today mini-quest: five minutes of {{course}}. Open FoldBook: {{link}} Reply STOP any time to pause reminders.',
  evening_message text not null default 'Evening checkpoint {{name}}! {{streak}}. Your mini-quest: one quick {{course}} question. Open FoldBook: {{link}} Reply STOP any time to pause reminders.',
  updated_at timestamptz not null default now()
);

insert into public.whatsapp_bot_settings (id) values (1) on conflict (id) do nothing;
alter table public.whatsapp_bot_settings enable row level security;
revoke all on public.whatsapp_bot_settings from anon, authenticated;
grant all on public.whatsapp_bot_settings to service_role;

create table if not exists public.whatsapp_bot_heartbeat (
  id integer primary key check (id = 1),
  connected boolean not null default false,
  last_seen_at timestamptz not null default now()
);
alter table public.whatsapp_bot_heartbeat enable row level security;
revoke all on public.whatsapp_bot_heartbeat from anon, authenticated;
grant all on public.whatsapp_bot_heartbeat to service_role;

create table if not exists public.whatsapp_bot_delivery_log (
  id bigint generated always as identity primary key,
  session text not null check (session in ('morning', 'evening', 'preview')),
  status text not null check (status in ('sent', 'failed')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  detail text,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_bot_delivery_log enable row level security;
revoke all on public.whatsapp_bot_delivery_log from anon, authenticated;
grant all on public.whatsapp_bot_delivery_log to service_role;
