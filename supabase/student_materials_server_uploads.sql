-- Move student material ownership from Supabase Anonymous Auth to FoldBook's
-- signed student session. Run once in the Supabase SQL Editor.

alter table public.student_materials
  alter column owner_id drop not null;

alter table public.student_materials
  add column if not exists owner_registration text
    references public.student_accounts(reg_number) on delete cascade;

alter table public.student_materials
  drop constraint if exists student_materials_has_owner;
alter table public.student_materials
  add constraint student_materials_has_owner
  check (owner_id is not null or owner_registration is not null);

alter table public.student_materials enable row level security;
revoke all on public.student_materials from anon, authenticated;
grant all on public.student_materials to service_role;
drop policy if exists "Students manage only their own study materials" on public.student_materials;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-materials', 'student-materials', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "Students manage own material files" on storage.objects;

comment on column public.student_materials.owner_registration is
  'FoldBook student registration number that owns this upload; set only by the authenticated server route.';
