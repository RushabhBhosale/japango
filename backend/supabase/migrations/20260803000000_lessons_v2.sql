-- Lessons V2 is deliberately isolated from the existing local course system.
-- This migration has no authentication tables: LESSONS_V2_AUTH_MODE=disabled
-- is for a single local-development operator only.

create table if not exists public.lesson_v2_lessons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  level text not null check (level in ('N5', 'N4')),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  current_published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_v2_lesson_versions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lesson_v2_lessons(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  title text not null,
  objectives jsonb not null default '[]'::jsonb,
  estimated_minutes integer not null check (estimated_minutes between 1 and 120),
  content jsonb not null,
  content_hash text not null check (char_length(content_hash) = 64),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  unique (lesson_id, version),
  unique (lesson_id, content_hash)
);

alter table public.lesson_v2_lessons
  add constraint lesson_v2_lessons_current_published_version_fk
  foreign key (current_published_version_id) references public.lesson_v2_lesson_versions(id) on delete restrict;

create index if not exists lesson_v2_lesson_versions_lesson_status_idx
  on public.lesson_v2_lesson_versions (lesson_id, status, version desc);

create table if not exists public.lesson_v2_vocabulary (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('N5', 'N4')),
  written text not null,
  reading text not null,
  meaning text not null,
  part_of_speech jsonb not null default '[]'::jsonb,
  canonical_curriculum_item_id text,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (written, reading)
);

create table if not exists public.lesson_v2_kanji (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('N5', 'N4')),
  character text not null check (char_length(character) = 1),
  meanings jsonb not null default '[]'::jsonb,
  readings jsonb not null default '[]'::jsonb,
  canonical_curriculum_item_id text,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (character)
);

create table if not exists public.lesson_v2_version_dependencies (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_v2_lesson_versions(id) on delete cascade,
  dependency_type text not null check (dependency_type in ('vocabulary', 'kanji', 'grammar', 'source_chunk', 'question_pattern', 'generated_question')),
  dependency_id text not null,
  token_id text,
  resolution_status text not null default 'resolved' check (resolution_status in ('resolved', 'needs_review', 'missing')),
  created_at timestamptz not null default now(),
  unique (lesson_version_id, dependency_type, dependency_id, token_id)
);
create index if not exists lesson_v2_version_dependencies_lookup_idx
  on public.lesson_v2_version_dependencies (lesson_version_id, resolution_status, dependency_type);

create table if not exists public.lesson_v2_source_references (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid references public.lesson_v2_lesson_versions(id) on delete cascade,
  generated_question_id uuid,
  source_chunk_id uuid not null references public.japanese_ocr_chunks(id) on delete restrict,
  source_path text not null,
  source_role text not null check (source_role in ('lesson_grounding', 'question_pattern', 'answer_key', 'quality_warning')),
  note text,
  excerpt_hash text check (excerpt_hash is null or char_length(excerpt_hash) = 64),
  created_at timestamptz not null default now()
);
create index if not exists lesson_v2_source_references_chunk_idx on public.lesson_v2_source_references (source_chunk_id);

create table if not exists public.lesson_v2_validation_issues (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid references public.lesson_v2_lesson_versions(id) on delete cascade,
  generated_question_id uuid,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  subject_id text not null,
  issue_type text not null,
  message text not null,
  suggested_fix text,
  source_pattern_id uuid,
  source_chunk_id uuid references public.japanese_ocr_chunks(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lesson_v2_validation_issues_open_idx
  on public.lesson_v2_validation_issues (lesson_version_id, severity, resolved_at);

create table if not exists public.lesson_v2_generation_runs (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid references public.lesson_v2_lesson_versions(id) on delete set null,
  kind text not null check (kind in ('lesson_plan', 'lesson_draft', 'question_draft', 'distractor_regeneration')),
  input jsonb not null,
  output jsonb,
  status text not null check (status in ('planned', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Raw OCR stays private to management tooling. Corrections never overwrite OCR.
create table if not exists public.lesson_v2_jlpt_papers (
  id uuid primary key default gen_random_uuid(),
  source_path_prefix text not null unique,
  level text not null check (level in ('N5', 'N4')),
  edition text,
  status text not null default 'needs_review' check (status in ('needs_review', 'approved', 'archived')),
  audit jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_v2_jlpt_source_questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.lesson_v2_jlpt_papers(id) on delete cascade,
  source_chunk_id uuid not null references public.japanese_ocr_chunks(id) on delete restrict,
  source_transcription text not null,
  corrected_transcription text,
  normalized jsonb,
  level text not null check (level in ('N5', 'N4')),
  section text check (section in ('vocabulary_kanji', 'grammar', 'reading', 'listening')),
  question_number text,
  source_quality text not null default 'needs_review' check (source_quality in ('verified', 'needs_review', 'corrupted', 'rejected')),
  official_answer text,
  ai_suggested_answer text,
  answer_status text not null default 'unknown' check (answer_status in ('official', 'unknown', 'ai_suggested', 'rejected')),
  created_at timestamptz not null default now(),
  unique (paper_id, source_chunk_id, question_number)
);
create index if not exists lesson_v2_jlpt_source_questions_paper_idx
  on public.lesson_v2_jlpt_source_questions (paper_id, source_quality, section);

create table if not exists public.lesson_v2_jlpt_answer_keys (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.lesson_v2_jlpt_papers(id) on delete cascade,
  source_chunk_id uuid not null references public.japanese_ocr_chunks(id) on delete restrict,
  section text,
  question_number text not null,
  answer_choice text,
  status text not null check (status in ('official', 'needs_review', 'unreadable')),
  created_at timestamptz not null default now(),
  unique (paper_id, section, question_number)
);

create table if not exists public.lesson_v2_jlpt_patterns (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('N5', 'N4')),
  section text not null check (section in ('vocabulary_kanji', 'grammar', 'reading', 'listening')),
  type text not null,
  instruction_pattern text not null,
  structure jsonb not null,
  source_question_ids uuid[] not null default '{}',
  source_chunk_ids uuid[] not null default '{}',
  confidence numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  status text not null default 'needs_review' check (status in ('needs_review', 'approved', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists lesson_v2_jlpt_patterns_lookup_idx
  on public.lesson_v2_jlpt_patterns (level, section, type, status);

create table if not exists public.lesson_v2_generated_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid references public.lesson_v2_lesson_versions(id) on delete set null,
  level text not null check (level in ('N5', 'N4')),
  question_type text not null,
  section text not null check (section in ('vocabulary_kanji', 'grammar', 'reading', 'listening')),
  content jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'archived')),
  similarity_score numeric(5,4),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.lesson_v2_source_references
  add constraint lesson_v2_source_references_generated_question_fk
  foreign key (generated_question_id) references public.lesson_v2_generated_questions(id) on delete cascade;
alter table public.lesson_v2_validation_issues
  add constraint lesson_v2_validation_issues_generated_question_fk
  foreign key (generated_question_id) references public.lesson_v2_generated_questions(id) on delete cascade;

create table if not exists public.lesson_v2_question_exposures (
  id uuid primary key default gen_random_uuid(),
  local_user_id text not null,
  generated_question_id uuid not null references public.lesson_v2_generated_questions(id) on delete cascade,
  seen_at timestamptz not null default now(),
  unique (local_user_id, generated_question_id, seen_at)
);
create index if not exists lesson_v2_question_exposures_recent_idx
  on public.lesson_v2_question_exposures (local_user_id, seen_at desc);

create table if not exists public.lesson_v2_progress (
  local_user_id text not null,
  lesson_version_id uuid not null references public.lesson_v2_lesson_versions(id) on delete restrict,
  current_section_id text,
  completed_section_ids jsonb not null default '[]'::jsonb,
  completed_question_ids jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (local_user_id, lesson_version_id)
);

create or replace function public.prevent_lesson_v2_published_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' then
    raise exception 'Published Lessons V2 versions are immutable; create a new version instead.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists lesson_v2_published_version_immutable on public.lesson_v2_lesson_versions;
create trigger lesson_v2_published_version_immutable
before update or delete on public.lesson_v2_lesson_versions
for each row execute function public.prevent_lesson_v2_published_version_mutation();

alter table public.lesson_v2_lessons enable row level security;
alter table public.lesson_v2_lesson_versions enable row level security;
alter table public.lesson_v2_vocabulary enable row level security;
alter table public.lesson_v2_kanji enable row level security;
alter table public.lesson_v2_version_dependencies enable row level security;
alter table public.lesson_v2_source_references enable row level security;
alter table public.lesson_v2_validation_issues enable row level security;
alter table public.lesson_v2_generation_runs enable row level security;
alter table public.lesson_v2_jlpt_papers enable row level security;
alter table public.lesson_v2_jlpt_source_questions enable row level security;
alter table public.lesson_v2_jlpt_answer_keys enable row level security;
alter table public.lesson_v2_jlpt_patterns enable row level security;
alter table public.lesson_v2_generated_questions enable row level security;
alter table public.lesson_v2_question_exposures enable row level security;
alter table public.lesson_v2_progress enable row level security;

-- The original migration is already applied. Replace the retrieval function in
-- this new migration so V2 can retain stable source chunk UUIDs.
drop function if exists public.search_japanese_ocr(text, halfvec, integer, text, text);
create function public.search_japanese_ocr(
  p_query text,
  p_embedding halfvec(2560),
  p_limit integer default 8,
  p_book text default null,
  p_source_type text default null
)
returns table (
  chunk_id uuid,
  content text,
  score double precision,
  book text,
  page integer,
  source_type text,
  filename text
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      chunks.id as chunk_id,
      chunks.content,
      greatest(0::double precision, 1 - (chunks.embedding <=> p_embedding)) as vector_score,
      ts_rank_cd(chunks.content_tsv, websearch_to_tsquery('simple', p_query))::double precision as full_text_score,
      similarity(chunks.content, p_query)::double precision as trigram_score,
      chunks.book,
      chunks.page_number as page,
      chunks.source_type,
      chunks.filename
    from public.japanese_ocr_chunks as chunks
    where (p_book is null or chunks.book = p_book)
      and (p_source_type is null or chunks.source_type = p_source_type)
  )
  select
    ranked.chunk_id,
    ranked.content,
    (0.72 * ranked.vector_score + 0.18 * least(1::double precision, ranked.full_text_score) + 0.10 * greatest(0::double precision, ranked.trigram_score)) as score,
    ranked.book,
    ranked.page,
    ranked.source_type,
    ranked.filename
  from ranked
  where ranked.vector_score > 0.15 or ranked.full_text_score > 0 or ranked.trigram_score > 0.05
  order by score desc, ranked.page nulls last, ranked.filename
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.search_japanese_ocr(text, halfvec, integer, text, text) from public, anon, authenticated;
grant execute on function public.search_japanese_ocr(text, halfvec, integer, text, text) to service_role;
