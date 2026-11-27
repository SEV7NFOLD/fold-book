-- Forgot / reset password for student accounts, delivered by WhatsApp.
-- Apply once in the FoldBook Supabase SQL Editor (after student_auth.sql and
-- student_jamb_onboarding.sql) BEFORE deploying the matching api/student/auth.js and
-- worker/worker.js changes.
--
-- Student accounts only store a WhatsApp number (no email), so the 6-digit reset code is
-- queued in a private outbox that the Render WhatsApp worker drains and sends.

alter table public.student_accounts
  add column if not exists password_changed_at timestamptz;

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
-- Private outbox of one-off WhatsApp text messages for the Render worker.
-- The body (which contains the code) is erased as soon as the job is processed.
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_bot_outbox (
  id bigint generated always as identity primary key,
  phone_number text not null check (phone_number ~ '^234[789][0-9]{9}$'),
  kind text not null check (kind in ('password_reset')),
  body text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed')),
  detail text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  processing_at timestamptz,
  processed_at timestamptz
);

create index if not exists whatsapp_bot_outbox_pending_idx
  on public.whatsapp_bot_outbox (id)
  where status in ('queued', 'processing');

alter table public.whatsapp_bot_outbox enable row level security;
revoke all on public.whatsapp_bot_outbox from public, anon, authenticated;
grant all on public.whatsapp_bot_outbox to service_role;
grant usage, select on sequence public.whatsapp_bot_outbox_id_seq to service_role;

-- Atomically claim the next job. Jobs whose code has already expired are failed and
-- scrubbed instead of being sent, and a job abandoned mid-send by a worker restart is
-- picked up again after two minutes.
create or replace function public.claim_whatsapp_bot_outbox()
returns setof public.whatsapp_bot_outbox
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.whatsapp_bot_outbox
  set status = 'failed', detail = 'Expired before it could be sent.', body = null, processed_at = now()
  where status in ('queued', 'processing') and expires_at <= now();

  return query
  with next_job as (
    select id
    from public.whatsapp_bot_outbox
    where status = 'queued'
       or (status = 'processing' and processing_at < now() - interval '2 minutes')
    order by id
    for update skip locked
    limit 1
  )
  update public.whatsapp_bot_outbox as queued
  set status = 'processing', processing_at = now()
  from next_job
  where queued.id = next_job.id
  returning queued.*;
end;
$$;

revoke execute on function public.claim_whatsapp_bot_outbox() from public, anon, authenticated;
grant execute on function public.claim_whatsapp_bot_outbox() to service_role;

-- ---------------------------------------------------------------------------
-- Issue a reset code: rate limit, store the hash, queue the WhatsApp message.
-- Returns 'queued', 'rate_limited' or 'unknown'. The API never tells the browser which.
-- ---------------------------------------------------------------------------
create or replace function public.request_foldbook_student_password_reset(
  p_reg_number text,
  p_code_hash text,
  p_message text
) returns text
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_phone text;
  v_recent integer;
begin
  -- Housekeeping so these tables never grow without bound.
  delete from public.student_password_resets where created_at < now() - interval '1 day';
  delete from public.whatsapp_bot_outbox where created_at < now() - interval '1 day';

  select phone_number into v_phone
  from public.student_accounts
  where reg_number = p_reg_number;
  if v_phone is null or v_phone !~ '^234[789][0-9]{9}$' then
    return 'unknown';
  end if;

  -- At most 3 codes per account per 15 minutes...
  select count(*) into v_recent
  from public.student_password_resets
  where reg_number = p_reg_number and created_at > now() - interval '15 minutes';
  if v_recent >= 3 then
    return 'rate_limited';
  end if;

  -- ...and a global ceiling, so the form cannot be used to spam many students' phones
  -- (or get the bot's WhatsApp number flagged).
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

  insert into public.whatsapp_bot_outbox (phone_number, kind, body, expires_at)
  values (v_phone, 'password_reset', p_message, now() + interval '10 minutes');

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
