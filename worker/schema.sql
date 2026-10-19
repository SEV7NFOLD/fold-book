alter table public.whatsapp_optins
  add column if not exists phone_number text,
  add column if not exists streak_count integer not null default 1,
  add column if not exists activity_count integer not null default 0,
  add column if not exists last_activity_at timestamptz,
  add column if not exists opted_in boolean not null default false,
  add column if not exists last_nudged_at timestamptz;

update public.whatsapp_optins
set phone_number = case
  when regexp_replace(coalesce(whatsapp_number, ''), '\D', '', 'g') like '0%'
    then '234' || substr(regexp_replace(whatsapp_number, '\D', '', 'g'), 2)
  else regexp_replace(coalesce(whatsapp_number, ''), '\D', '', 'g')
end,
opted_in = true
where phone_number is null
  and whatsapp_number is not null;

do $$
begin
  if exists (
    select 1
    from public.whatsapp_optins
    where phone_number is not null
    group by phone_number
    having count(*) > 1
  ) then
    raise exception 'Duplicate phone_number rows exist; merge duplicates before creating the unique index.';
  end if;
end
$$;

create unique index if not exists whatsapp_optins_phone_number_key
  on public.whatsapp_optins (phone_number);

alter table public.whatsapp_optins enable row level security;

grant insert, update (phone_number, whatsapp_number, reg_number, full_name, streak_count, activity_count, last_activity_at, course_code, grade, opted_in)
  on public.whatsapp_optins to anon;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_optins'
      and policyname = 'Allow reminder opt-in inserts'
  ) then
    create policy "Allow reminder opt-in inserts"
      on public.whatsapp_optins for insert to anon
      with check (opted_in = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_optins'
      and policyname = 'Allow reminder opt-in upserts'
  ) then
    create policy "Allow reminder opt-in upserts"
      on public.whatsapp_optins for update to anon
      using (true)
      with check (opted_in = true);
  end if;
end
$$;
