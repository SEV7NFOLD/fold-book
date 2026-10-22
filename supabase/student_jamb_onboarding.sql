-- Allow newly admitted students to create FoldBook accounts with a JAMB number,
-- then link their UNIUYO matric number later without changing their account key.
-- Apply once in the FoldBook project's Supabase SQL Editor before deploying the
-- matching student-auth code.

alter table public.student_accounts
  add column if not exists jamb_reg_number text,
  add column if not exists matric_number text;

-- Preserve existing student identity and let older matric-based accounts use
-- the new alias field without changing any profile, upload, or reminder links.
update public.student_accounts
set matric_number = reg_number
where matric_number is null
  and reg_number ~ '^[0-9]{2}/SS/EC/[0-9]{1,4}$';

update public.student_accounts
set jamb_reg_number = reg_number
where jamb_reg_number is null
  and reg_number ~ '^[0-9]{12}[A-Z]{2}$';

create unique index if not exists student_accounts_jamb_reg_number_uidx
  on public.student_accounts (jamb_reg_number)
  where jamb_reg_number is not null;

create unique index if not exists student_accounts_matric_number_uidx
  on public.student_accounts (matric_number)
  where matric_number is not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'student_accounts_jamb_reg_number_format_check'
      and conrelid = 'public.student_accounts'::regclass
  ) then
    alter table public.student_accounts
      add constraint student_accounts_jamb_reg_number_format_check
      check (jamb_reg_number is null or jamb_reg_number ~ '^[0-9]{12}[A-Z]{2}$');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'student_accounts_matric_number_format_check'
      and conrelid = 'public.student_accounts'::regclass
  ) then
    alter table public.student_accounts
      add constraint student_accounts_matric_number_format_check
      check (matric_number is null or matric_number ~ '^[0-9]{2}/SS/EC/[0-9]{1,4}$');
  end if;
end
$$;

create or replace function public.create_foldbook_student_account(
  p_reg_number text,
  p_full_name text,
  p_phone_number text,
  p_academic_level text,
  p_password_salt text,
  p_password_hash text
) returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if p_academic_level not in ('100L', '200L', '300L', '400L') then
    raise exception 'Invalid academic level.';
  end if;

  if p_reg_number !~ '^(?:[0-9]{12}[A-Z]{2}|[0-9]{2}/SS/EC/[0-9]{1,4})$' then
    raise exception 'Invalid student registration number.';
  end if;

  if exists (
    select 1 from public.student_accounts as existing
    where existing.matric_number = p_reg_number
       or existing.jamb_reg_number = p_reg_number
  ) then
    raise exception 'Registration number already belongs to another FoldBook account.';
  end if;

  insert into public.student_accounts (
    reg_number, full_name, phone_number, academic_level, password_salt, password_hash,
    jamb_reg_number, matric_number
  ) values (
    p_reg_number, p_full_name, p_phone_number, p_academic_level, p_password_salt, p_password_hash,
    case when p_reg_number ~ '^[0-9]{12}[A-Z]{2}$' then p_reg_number else null end,
    case when p_reg_number ~ '^[0-9]{2}/SS/EC/[0-9]{1,4}$' then p_reg_number else null end
  );

  insert into public.whatsapp_optins (
    phone_number, whatsapp_number, reg_number, full_name, opted_in,
    streak_count, activity_count, referral_count
  ) values (
    p_phone_number, p_phone_number, p_reg_number, p_full_name, true, 0, 0, 0
  )
  on conflict (phone_number) do update set
    whatsapp_number = excluded.whatsapp_number,
    reg_number = excluded.reg_number,
    full_name = excluded.full_name,
    opted_in = true
  where public.whatsapp_optins.reg_number is null
     or public.whatsapp_optins.reg_number = excluded.reg_number;

  if not found then
    raise exception 'WhatsApp number is already connected to another student account.';
  end if;
end;
$$;

revoke all on function public.create_foldbook_student_account(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_foldbook_student_account(text, text, text, text, text, text)
  to service_role;

create or replace function public.attach_foldbook_student_matric_number(
  p_reg_number text,
  p_matric_number text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_matric_number !~ '^[0-9]{2}/SS/EC/[0-9]{1,4}$' then
    raise exception 'Invalid matric number.';
  end if;

  if not exists (
    select 1 from public.student_accounts as current_account
    where current_account.reg_number = p_reg_number
  ) then
    raise exception 'Student account not found.';
  end if;

  if exists (
    select 1 from public.student_accounts as other_account
    where other_account.reg_number <> p_reg_number
      and (
        other_account.reg_number = p_matric_number
        or other_account.jamb_reg_number = p_matric_number
        or other_account.matric_number = p_matric_number
      )
  ) then
    raise exception 'Matric number already belongs to another account.';
  end if;

  update public.student_accounts as account
  set matric_number = p_matric_number,
      updated_at = pg_catalog.now()
  where account.reg_number = p_reg_number;

  return pg_catalog.jsonb_build_object('matricRegistration', p_matric_number);
end;
$$;

revoke all on function public.attach_foldbook_student_matric_number(text, text)
  from public, anon, authenticated;
grant execute on function public.attach_foldbook_student_matric_number(text, text)
  to service_role;
