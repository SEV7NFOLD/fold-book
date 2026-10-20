-- Persist per-question results for each student's personalized path.
-- Safe to run on existing FoldBook databases.
alter table public.student_learning_profiles
  add column if not exists module_attempts jsonb not null default '{}'::jsonb;

alter table public.student_learning_profiles
  drop constraint if exists student_learning_profiles_module_attempts_check;

alter table public.student_learning_profiles
  add constraint student_learning_profiles_module_attempts_check
  check (jsonb_typeof(module_attempts) = 'object');
