create table if not exists public.student_push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://'),
  registration text not null references public.student_accounts(reg_number) on delete cascade,
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz
);

create index if not exists student_push_subscriptions_registration_idx
  on public.student_push_subscriptions (registration);

alter table public.student_push_subscriptions enable row level security;
revoke all on public.student_push_subscriptions from anon, authenticated;
grant all on public.student_push_subscriptions to service_role;
