-- FoldBook AI course materials: Gemini Embedding 001 vectors at 768 dimensions.
-- Run once in the Supabase SQL editor before using material indexing or RAG.
create extension if not exists vector with schema public;

create table if not exists public.course_materials (
  id bigint generated always as identity primary key,
  level text not null check (level in ('100L', '200L', '300L', '400L')),
  course_code text not null,
  title text not null,
  content text not null,
  embedding_768 public.vector(768) not null,
  created_at timestamptz not null default now()
);

-- Keep existing installations usable while adding vectors to a previously text-only table.
alter table public.course_materials
  add column if not exists embedding_768 public.vector(768),
  add column if not exists created_at timestamptz not null default now();

alter table public.course_materials enable row level security;
revoke all on public.course_materials from anon, authenticated;
grant all on public.course_materials to service_role;

create index if not exists course_materials_course_level_idx
  on public.course_materials (level, course_code);
create index if not exists course_materials_embedding_hnsw_idx
  on public.course_materials using hnsw (embedding_768 public.vector_cosine_ops);

create or replace function public.match_course_materials (
  match_embedding public.vector(768),
  match_course text,
  match_level text,
  match_count integer default 5
)
returns table (title text, content text, similarity double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select materials.title,
         materials.content,
         1 - (materials.embedding_768 OPERATOR(public.<=>) match_embedding) as similarity
  from public.course_materials as materials
  where materials.level = match_level
    and materials.embedding_768 is not null
    and upper(regexp_replace(materials.course_code, '\s+', ' ', 'g'))
      = upper(regexp_replace(match_course, '\s+', ' ', 'g'))
  order by materials.embedding_768 OPERATOR(public.<=>) match_embedding asc
  limit least(greatest(coalesce(match_count, 5), 1), 8);
$$;

revoke all on function public.match_course_materials(public.vector, text, text, integer) from public, anon, authenticated;
grant execute on function public.match_course_materials(public.vector, text, text, integer) to service_role;

-- Harden the legacy three-argument RPC while existing clients finish upgrading.
alter function public.match_course_materials(text, text, integer) set search_path = '';
