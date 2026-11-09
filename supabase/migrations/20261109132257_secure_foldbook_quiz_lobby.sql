-- Keep quiz reads and writes behind the authenticated FoldBook server routes.
create unique index if not exists foldbook_quizzes_join_code_key
  on public.foldbook_quizzes (join_code);
create unique index if not exists foldbook_quiz_participants_quiz_id_reg_number_key
  on public.foldbook_quiz_participants (quiz_id, reg_number);
create unique index if not exists foldbook_quiz_answers_quiz_id_reg_number_question_index_key
  on public.foldbook_quiz_answers (quiz_id, reg_number, question_index);
create index if not exists foldbook_quizzes_status_created_at_idx
  on public.foldbook_quizzes (status, created_at desc);

alter table public.foldbook_quizzes enable row level security;
alter table public.foldbook_quiz_participants enable row level security;
alter table public.foldbook_quiz_answers enable row level security;

revoke all on public.foldbook_quizzes, public.foldbook_quiz_participants, public.foldbook_quiz_answers from anon, authenticated;
grant all on public.foldbook_quizzes, public.foldbook_quiz_participants, public.foldbook_quiz_answers to service_role;
