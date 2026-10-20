-- Private student-owned PDFs and study photos. Apply once in the FoldBook Supabase project.
create table if not exists public.student_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  course_code text not null check (char_length(course_code) between 2 and 20),
  course_title text not null default '',
  description text not null default '' check (char_length(description) <= 500),
  level text not null default '100L' check (level in ('100L','200L','300L','400L')),
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  extracted_text text not null default '' check (char_length(extracted_text) <= 12000),
  created_at timestamptz not null default now()
);

alter table public.student_materials enable row level security;
grant select, insert, delete on public.student_materials to authenticated;

drop policy if exists "Students manage only their own study materials" on public.student_materials;
create policy "Students manage only their own study materials"
  on public.student_materials for all to authenticated
  using ((select auth.uid()) = owner_id and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)))
  with check ((select auth.uid()) = owner_id and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-materials', 'student-materials', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "Students manage own material files" on storage.objects;
create policy "Students manage own material files"
  on storage.objects for all to authenticated
  using (bucket_id = 'student-materials'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)))
  with check (bucket_id = 'student-materials'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select coalesce((auth.jwt()->>'is_anonymous')::boolean, false)));
