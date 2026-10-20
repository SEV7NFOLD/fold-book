-- Add course-review metadata to private student uploads. Existing owner-only RLS remains unchanged.
alter table public.student_materials
  add column if not exists description text not null default '' check (char_length(description) <= 500),
  add column if not exists level text not null default '100L' check (level in ('100L', '200L', '300L', '400L'));

comment on column public.student_materials.description is 'Student-provided summary shown to authorized admins during course-material review.';
comment on column public.student_materials.level is 'Student academic level at upload time, used as a hint for admin course review.';
