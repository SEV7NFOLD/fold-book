-- Live quiz flow: drafts with preview, host-paced phases, per-question timers and speed scoring.

alter table public.foldbook_quizzes
  add column if not exists question_seconds integer not null default 20,
  add column if not exists phase text not null default 'question',
  add column if not exists question_started_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'foldbook_quizzes_question_seconds_check') then
    alter table public.foldbook_quizzes
      add constraint foldbook_quizzes_question_seconds_check check (question_seconds between 5 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'foldbook_quizzes_phase_check') then
    alter table public.foldbook_quizzes
      add constraint foldbook_quizzes_phase_check check (phase in ('question', 'reveal', 'leaderboard'));
  end if;
end $$;

alter table public.foldbook_quiz_participants
  add column if not exists answered_count integer not null default 0,
  add column if not exists correct_count integer not null default 0,
  add column if not exists last_answered_at timestamptz;

alter table public.foldbook_quiz_answers
  add column if not exists points integer not null default 0,
  add column if not exists response_ms integer;

create index if not exists foldbook_quiz_answers_quiz_question_idx
  on public.foldbook_quiz_answers (quiz_id, question_index);

-- Adds one answer's result to a participant in a single statement, so quick taps can't lose points.
create or replace function public.foldbook_quiz_record_result(
  p_quiz_id uuid,
  p_reg_number text,
  p_points integer,
  p_correct boolean
) returns integer
language sql
security definer
set search_path = public
as $$
  update public.foldbook_quiz_participants
     set score = score + greatest(p_points, 0),
         answered_count = answered_count + 1,
         correct_count = correct_count + case when p_correct then 1 else 0 end,
         last_answered_at = now()
   where quiz_id = p_quiz_id and reg_number = p_reg_number
  returning score;
$$;

revoke all on function public.foldbook_quiz_record_result(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.foldbook_quiz_record_result(uuid, text, integer, boolean) to service_role;
