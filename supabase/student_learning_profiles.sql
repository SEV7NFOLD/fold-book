-- Server-only learner profile and personalized study route, used by Dr. Eco
-- and the WhatsApp reminder worker. Apply once in the Supabase SQL editor.
create table if not exists public.student_learning_profiles (
  reg_number text primary key references public.student_accounts(reg_number) on delete cascade,
  learner_goal text not null default '',
  difficulty_topics text not null default '',
  learner_note text not null default '',
  pace text not null default 'balanced' check (pace in ('gentle', 'balanced', 'quick')),
  course_code text not null default '',
  course_title text not null default '',
  study_path jsonb not null default '[]'::jsonb check (jsonb_typeof(study_path) = 'array'),
  completed_module_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_module_ids) = 'array'),
  module_attempts jsonb not null default '{}'::jsonb check (jsonb_typeof(module_attempts) = 'object'),
  path_source text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.student_learning_profiles
  add column if not exists module_attempts jsonb not null default '{}'::jsonb
  check (jsonb_typeof(module_attempts) = 'object');

alter table public.student_learning_profiles enable row level security;
revoke all on public.student_learning_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.student_learning_profiles to service_role;
