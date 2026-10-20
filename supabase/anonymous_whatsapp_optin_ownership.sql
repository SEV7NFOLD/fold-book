-- Scope authenticated anonymous-user access to its own WhatsApp opt-in row.
alter table public.whatsapp_optins
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

grant select on public.whatsapp_optins to authenticated;
grant insert, update (owner_id, phone_number, whatsapp_number, reg_number, full_name, streak_count,
  activity_count, referral_count, avatar_url, avatar_lottie, last_activity_at, course_code, grade, opted_in)
  on public.whatsapp_optins to authenticated;

drop policy if exists "Anonymous users read their own WhatsApp opt-in" on public.whatsapp_optins;
drop policy if exists "Anonymous users insert their own WhatsApp opt-in" on public.whatsapp_optins;
drop policy if exists "Anonymous users update their own WhatsApp opt-in" on public.whatsapp_optins;

create policy "Anonymous users read their own WhatsApp opt-in"
  on public.whatsapp_optins for select to authenticated
  using (owner_id = (select auth.uid())
    and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)));

create policy "Anonymous users insert their own WhatsApp opt-in"
  on public.whatsapp_optins for insert to authenticated
  with check (owner_id = (select auth.uid()) and opted_in = true
    and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)));

create policy "Anonymous users update their own WhatsApp opt-in"
  on public.whatsapp_optins for update to authenticated
  using (owner_id = (select auth.uid())
    and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)))
  with check (owner_id = (select auth.uid()) and opted_in = true
    and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)));
