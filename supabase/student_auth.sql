-- Private credential store for student sign-in. Only server functions using the
-- Supabase service role can read or write this table.
create table if not exists public.student_accounts (
  reg_number text primary key,
  full_name text not null,
  phone_number text not null,
  academic_level text not null default '100L' check (academic_level in ('100L', '200L', '300L', '400L')),
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.student_accounts enable row level security;
revoke all on public.student_accounts from anon, authenticated;
grant select, insert, update, delete on public.student_accounts to service_role;

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
  insert into public.student_accounts (reg_number, full_name, phone_number, academic_level, password_salt, password_hash)
  values (p_reg_number, p_full_name, p_phone_number, p_academic_level, p_password_salt, p_password_hash);

  insert into public.whatsapp_optins (
    phone_number, whatsapp_number, reg_number, full_name, opted_in,
    streak_count, activity_count, referral_count
  ) values (
    p_phone_number, p_phone_number, p_reg_number, p_full_name, true, 1, 0, 0
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
