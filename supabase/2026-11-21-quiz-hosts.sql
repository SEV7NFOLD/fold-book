-- Quiz hosts: lecturers and class reps who create and run their own quizzes.
-- Run once in Supabase → SQL Editor. Safe to run again.

create table if not exists public.foldbook_hosts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text not null check (char_length(name) between 2 and 80),
  role text not null check (role in ('lecturer', 'rep')),
  -- Lecturers: the courses they may host (empty = any course). Reps: unused.
  courses text[] not null default '{}',
  -- Reps: the level whose students their quizzes go to. Lecturers: unused.
  level text check (level is null or level in ('100L', '200L', '300L', '400L')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- One-time sign-in codes sent by email. Only a hash of each code is stored.
create table if not exists public.foldbook_host_codes (
  id bigint generated always as identity primary key,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists foldbook_host_codes_email_idx on public.foldbook_host_codes (email, created_at desc);

-- Which host owns a quiz (null = made in the admin Quiz Studio).
alter table public.foldbook_quizzes
  add column if not exists host_id uuid references public.foldbook_hosts (id) on delete set null;
create index if not exists foldbook_quizzes_host_idx on public.foldbook_quizzes (host_id, created_at desc);

-- Only the server (service role) reads or writes these tables.
alter table public.foldbook_hosts enable row level security;
alter table public.foldbook_host_codes enable row level security;
revoke all on public.foldbook_hosts from anon, authenticated;
revoke all on public.foldbook_host_codes from anon, authenticated;
grant select, insert, update, delete on public.foldbook_hosts to service_role;
grant select, insert, update, delete on public.foldbook_host_codes to service_role;
grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';
