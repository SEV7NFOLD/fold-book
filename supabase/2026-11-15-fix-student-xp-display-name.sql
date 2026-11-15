-- Fixes the Ranks tab: the live student_xp table is missing the display_name column
-- that the app writes (error PGRST204 "Could not find the 'display_name' column").
-- Safe to run more than once. Run it in Supabase > SQL Editor.

alter table public.student_xp
  add column if not exists display_name text;

update public.student_xp
  set display_name = 'Learner-' || upper(right(id::text, 4))
  where display_name is null or char_length(display_name) = 0;

alter table public.student_xp
  alter column display_name set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_xp_display_name_length' and conrelid = 'public.student_xp'::regclass
  ) then
    alter table public.student_xp
      add constraint student_xp_display_name_length check (char_length(display_name) between 1 and 32);
  end if;
end $$;

-- Make the API see the new column straight away.
notify pgrst, 'reload schema';
