-- Quiz storage for admin-created FoldBook challenges and live contests.
create table if not exists public.foldbook_quizzes (
  id uuid primary key default gen_random_uuid(),
  join_code text not null check (join_code ~ '^[A-Z0-9]{6}$'),
  title text not null check (char_length(title) between 1 and 120),
  course_code text not null default '',
  target_type text not null default 'all' check (target_type in ('all', 'level', 'students')),
  target_level text,
  target_registrations text[] not null default '{}',
  quiz_type text not null default 'open' check (quiz_type in ('open', 'contest')),
  status text not null default 'draft' check (status in ('draft', 'lobby', 'live', 'finished')),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  current_question integer not null default -1,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.foldbook_quiz_participants (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.foldbook_quizzes(id) on delete cascade,
  reg_number text not null,
  display_name text not null default '',
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now()
);

create table if not exists public.foldbook_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.foldbook_quizzes(id) on delete cascade,
  reg_number text not null,
  question_index integer not null check (question_index >= 0),
  answer_index integer not null check (answer_index >= 0),
  is_correct boolean not null default false,
  answered_at timestamptz not null default now()
);
