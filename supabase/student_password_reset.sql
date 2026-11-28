-- Forgot / reset password for student accounts, delivered by EMAIL.
-- Apply once in the FoldBook Supabase SQL Editor (after student_auth.sql and
-- student_jamb_onboarding.sql). Safe to run more than once, and safe to run after the
-- earlier WhatsApp version of this file: it removes the WhatsApp outbox.
--
-- Students add a recovery email at signup (or later in Profile). A reset code is only
-- issued when the typed email matches the one saved on the account, and the API emails it.

alter table public.student_accounts
  add column if not exists email text;
alter table public.student_accounts
  add column if not exists password_changed_at timestamptz;
create index if not exists student_accounts_email_idx on public.student_accounts (lower(email));

-- ---------------------------------------------------------------------------
-- One row per issued reset code. Only a keyed hash of the code is stored.
-- ---------------------------------------------------------------------------
create table if not exists public.student_password_resets (
  id bigint generated always as identity primary key,
  reg_number text not null references public.student_accounts (reg_number) on delete cascade,
  code_hash text not null,
  attempts integer not null default 0,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists student_password_resets_account_idx
  on public.student_password_resets (reg_number, created_at desc);

alter table public.student_password_resets enable row level security;
revoke all on public.student_password_resets from public, anon, authenticated;
grant all on public.student_password_resets to service_role;

-- ---------------------------------------------------------------------------
-- The earlier WhatsApp version queued codes in an outbox for the Render bot. Not used now.
-- ---------------------------------------------------------------------------
drop function if exists public.claim_whatsapp_bot_outbox();
drop table if exists public.whatsapp_bot_outbox;

-- ---------------------------------------------------------------------------
-- Issue a reset code when the account number and the recovery email both match.
-- Returns 'queued', 'rate_limited' or 'unknown'. The API never tells the browser which.
-- ---------------------------------------------------------------------------
drop function if exists public.request_foldbook_student_password_reset(text, text, text);
create function public.request_foldbook_student_password_reset(
  p_reg_number text,
  p_email text,
  p_code_hash text
) returns text
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_email text;
  v_recent integer;
begin
  -- Housekeeping so the table never grows without bound.
  delete from public.student_password_resets where created_at < now() - interval '1 day';

  select email into v_email
  from public.student_accounts
  where reg_number = p_reg_number;
  if v_email is null or lower(trim(v_email)) <> lower(trim(p_email)) then
    return 'unknown';
  end if;

  -- At most 3 codes per account per 15 minutes...
  select count(*) into v_recent
  from public.student_password_resets
  where reg_number = p_reg_number and created_at > now() - interval '15 minutes';
  if v_recent >= 3 then
    return 'rate_limited';
  end if;

  -- ...and a global ceiling, so the form cannot flood inboxes or use up the daily email limit.
  select count(*) into v_recent
  from public.student_password_resets
  where created_at > now() - interval '15 minutes';
  if v_recent >= 100 then
    return 'rate_limited';
  end if;

  -- A newer code replaces any older unused one.
  update public.student_password_resets
  set used = true
  where reg_number = p_reg_number and used = false;

  insert into public.student_password_resets (reg_number, code_hash, expires_at)
  values (p_reg_number, p_code_hash, now() + interval '10 minutes');

  return 'queued';
end;
$$;

revoke all on function public.request_foldbook_student_password_reset(text, text, text)
  from public, anon, authenticated;
grant execute on function public.request_foldbook_student_password_reset(text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Check a code and set the new password in one transaction.
-- Returns 'ok', 'invalid' (wrong code, attempt counted) or 'expired' (no live code,
-- too many attempts, or no such account: deliberately indistinguishable).
-- A wrong guess returns a status rather than raising, so the attempt count is kept.
-- ---------------------------------------------------------------------------
create or replace function public.reset_foldbook_student_password(
  p_reg_number text,
  p_code_hash text,
  p_password_salt text,
  p_password_hash text
) returns text
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_row public.student_password_resets%rowtype;
begin
  select * into v_row
  from public.student_password_resets
  where reg_number = p_reg_number and used = false and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found or v_row.attempts >= 5 then
    return 'expired';
  end if;

  if v_row.code_hash <> p_code_hash then
    update public.student_password_resets set attempts = attempts + 1 where id = v_row.id;
    return 'invalid';
  end if;

  update public.student_accounts
  set password_salt = p_password_salt,
      password_hash = p_password_hash,
      password_changed_at = now(),
      updated_at = now()
  where reg_number = p_reg_number;

  update public.student_password_resets
  set used = true
  where reg_number = p_reg_number and used = false;

  return 'ok';
end;
$$;

revoke all on function public.reset_foldbook_student_password(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reset_foldbook_student_password(text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
