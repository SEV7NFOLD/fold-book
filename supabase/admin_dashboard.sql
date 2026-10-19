create table if not exists public.course_catalog (
  level text not null check (level in ('100L', '200L', '300L', '400L')),
  course_code text not null,
  title text not null,
  credit_units integer not null check (credit_units between 1 and 12),
  primary key (level, course_code)
);

create table if not exists public.student_results (
  reg_number text not null,
  full_name text not null,
  course_code text not null,
  course_title text not null,
  ca integer not null check (ca between 0 and 30),
  exam integer not null check (exam between 0 and 70),
  total integer not null check (total between 0 and 100),
  grade text not null check (grade in ('A', 'B', 'C', 'D', 'E', 'F')),
  remark text not null check (remark in ('PASS', 'FAIL')),
  level text not null check (level in ('100L', '200L', '300L', '400L')),
  primary key (reg_number, course_code)
);

alter table public.course_catalog enable row level security;
alter table public.student_results enable row level security;

revoke all on public.course_catalog from anon, authenticated;
revoke all on public.student_results from anon, authenticated;
