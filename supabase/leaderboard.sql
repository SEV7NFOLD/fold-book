create table if not exists public.student_xp (
  id uuid primary key,
  display_name text not null check (char_length(display_name) between 1 and 32),
  xp integer not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now()
);

alter table public.student_xp enable row level security;

drop policy if exists "Public leaderboard is readable" on public.student_xp;
create policy "Public leaderboard is readable"
  on public.student_xp for select
  to anon, authenticated
  using (true);

drop policy if exists "Browser clients can submit XP" on public.student_xp;
create policy "Browser clients can submit XP"
  on public.student_xp for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Browser clients can update XP" on public.student_xp;
create policy "Browser clients can update XP"
  on public.student_xp for update
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.student_xp to anon, authenticated;
