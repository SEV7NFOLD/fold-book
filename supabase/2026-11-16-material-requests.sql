-- Notes students asked Dr. Eco for that FoldBook doesn't have yet.
-- Run once in Supabase > SQL Editor. Safe to run more than once.
-- See what students want most:
--   select coalesce(course_code, '(no course)') as course, keywords, count(*) as requests
--   from public.material_requests group by 1, 2 order by requests desc limit 50;

create table if not exists public.material_requests (
  id bigint generated always as identity primary key,
  registration text not null,
  course_code text,
  query text not null default '',
  keywords text not null default '',
  created_at timestamptz not null default now()
);

alter table public.material_requests enable row level security;
revoke all on public.material_requests from anon, authenticated;
grant select, insert on public.material_requests to service_role;

create index if not exists material_requests_created_idx on public.material_requests (created_at desc);
create index if not exists material_requests_course_idx on public.material_requests (course_code);

notify pgrst, 'reload schema';
