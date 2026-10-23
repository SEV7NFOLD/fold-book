-- Store each learner's paths and module progress in their account profile so
-- it follows them between devices. Existing single-course columns remain for
-- compatibility with the WhatsApp reminder worker.
alter table public.student_learning_profiles
  add column if not exists study_state jsonb not null default '{}'::jsonb;

alter table public.student_learning_profiles
  drop constraint if exists student_learning_profiles_study_state_check;

alter table public.student_learning_profiles
  add constraint student_learning_profiles_study_state_check
  check (jsonb_typeof(study_state) = 'object');
