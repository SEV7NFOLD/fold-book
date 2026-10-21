-- Persist the six-change lifetime limit for each student account.
alter table public.student_accounts
  add column if not exists level_change_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'student_accounts_level_change_count_check'
      and conrelid = 'public.student_accounts'::regclass
  ) then
    alter table public.student_accounts
      add constraint student_accounts_level_change_count_check
      check (level_change_count between 0 and 6);
  end if;
end
$$;

create or replace function public.change_foldbook_student_level(
  p_reg_number text,
  p_academic_level text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.student_accounts%rowtype;
begin
  if p_academic_level not in ('100L', '200L', '300L', '400L') then
    raise exception 'Invalid academic level.';
  end if;

  update public.student_accounts as account
  set academic_level = p_academic_level,
      level_change_count = account.level_change_count + 1,
      updated_at = pg_catalog.now()
  where account.reg_number = p_reg_number
    and account.academic_level <> p_academic_level
    and account.level_change_count < 6
  returning account.* into v_account;

  if found then
    return pg_catalog.jsonb_build_object(
      'level', v_account.academic_level,
      'levelChangeCount', v_account.level_change_count
    );
  end if;

  select account.* into v_account
  from public.student_accounts as account
  where account.reg_number = p_reg_number;

  if not found then
    raise exception 'Student account not found.';
  end if;

  if v_account.academic_level = p_academic_level then
    return pg_catalog.jsonb_build_object(
      'level', v_account.academic_level,
      'levelChangeCount', v_account.level_change_count
    );
  end if;

  raise exception 'Student level change limit reached.';
end;
$$;

revoke all on function public.change_foldbook_student_level(text, text)
  from public, anon, authenticated;
grant execute on function public.change_foldbook_student_level(text, text)
  to service_role;
