-- Audio Lessons are versioned and independent from Lessons V2. They are always
-- served by backend routes; no service-role key is exposed to the mobile app.

create table if not exists public.audio_lessons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  level text not null check (level in ('N5', 'N4')),
  lesson_type text not null check (lesson_type in (
    'grammar_explanation', 'vocabulary_review', 'dialogue_practice',
    'sentence_pattern_drill', 'listening_comprehension', 'short_story',
    'jlpt_listening_practice', 'lesson_summary', 'kanji_in_context_review',
    'weak_topic_review', 'mixed_review', 'shadowing_practice'
  )),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  current_published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audio_lesson_versions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.audio_lessons(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  title text not null,
  objectives jsonb not null default '[]'::jsonb,
  estimated_minutes integer not null check (estimated_minutes between 5 and 12),
  content jsonb not null,
  content_hash text not null check (char_length(content_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  unique (lesson_id, version),
  unique (lesson_id, content_hash)
);

alter table public.audio_lessons
  add constraint audio_lessons_current_published_version_fk
  foreign key (current_published_version_id) references public.audio_lesson_versions(id) on delete restrict;

create index if not exists audio_lesson_versions_lesson_status_idx
  on public.audio_lesson_versions (lesson_id, status, version desc);
create index if not exists audio_lessons_library_filter_idx
  on public.audio_lessons (status, level, lesson_type, updated_at desc);

create table if not exists public.audio_lesson_version_dependencies (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.audio_lesson_versions(id) on delete cascade,
  dependency_type text not null check (dependency_type in ('vocabulary', 'kanji', 'grammar', 'related_lesson', 'source_chunk', 'question_pattern')),
  dependency_id text not null,
  resolution_status text not null default 'resolved' check (resolution_status in ('resolved', 'needs_review', 'missing')),
  created_at timestamptz not null default now(),
  unique (lesson_version_id, dependency_type, dependency_id)
);
create index if not exists audio_lesson_version_dependencies_lookup_idx
  on public.audio_lesson_version_dependencies (lesson_version_id, resolution_status, dependency_type);

create table if not exists public.audio_lesson_source_references (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.audio_lesson_versions(id) on delete cascade,
  reference_id text not null,
  source_chunk_id uuid not null references public.japanese_ocr_chunks(id) on delete restrict,
  source_path text not null,
  source_role text not null check (source_role in ('lesson_grounding', 'question_pattern', 'answer_key', 'quality_warning')),
  note text,
  excerpt_hash text check (excerpt_hash is null or char_length(excerpt_hash) = 64),
  created_at timestamptz not null default now(),
  unique (lesson_version_id, reference_id)
);
create index if not exists audio_lesson_source_references_chunk_idx
  on public.audio_lesson_source_references (source_chunk_id);

create table if not exists public.audio_lesson_audio_files (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.audio_lesson_versions(id) on delete cascade,
  section_id text not null,
  audio_url text,
  provider text not null,
  voice text,
  duration_ms integer not null check (duration_ms >= 0),
  content_hash text not null check (char_length(content_hash) = 64),
  status text not null check (status in ('pending', 'ready', 'failed', 'system_speech')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, section_id)
);
create index if not exists audio_lesson_audio_files_ready_idx
  on public.audio_lesson_audio_files (lesson_version_id, status);

create table if not exists public.audio_lesson_validation_issues (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.audio_lesson_versions(id) on delete cascade,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  subject_id text not null,
  issue_type text not null,
  message text not null,
  suggested_fix text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists audio_lesson_validation_issues_open_idx
  on public.audio_lesson_validation_issues (lesson_version_id, severity, resolved_at);

create table if not exists public.audio_lesson_generation_runs (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid references public.audio_lesson_versions(id) on delete set null,
  kind text not null check (kind in ('script_draft', 'tts_sections', 'combined_audio')),
  input jsonb not null,
  output jsonb,
  status text not null check (status in ('planned', 'running', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.audio_lesson_playlists (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text not null,
  level text check (level in ('N5', 'N4')),
  lesson_type text check (lesson_type in (
    'grammar_explanation', 'vocabulary_review', 'dialogue_practice',
    'sentence_pattern_drill', 'listening_comprehension', 'short_story',
    'jlpt_listening_practice', 'lesson_summary', 'kanji_in_context_review',
    'weak_topic_review', 'mixed_review', 'shadowing_practice'
  )),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audio_lesson_playlist_entries (
  playlist_id uuid not null references public.audio_lesson_playlists(id) on delete cascade,
  lesson_id uuid not null references public.audio_lessons(id) on delete restrict,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (playlist_id, lesson_id),
  unique (playlist_id, position)
);

-- Delivery uses a backend service-role client. RLS is left enabled so a future
-- authenticated policy can be introduced without moving content ownership.
alter table public.audio_lessons enable row level security;
alter table public.audio_lesson_versions enable row level security;
alter table public.audio_lesson_version_dependencies enable row level security;
alter table public.audio_lesson_source_references enable row level security;
alter table public.audio_lesson_audio_files enable row level security;
alter table public.audio_lesson_validation_issues enable row level security;
alter table public.audio_lesson_generation_runs enable row level security;
alter table public.audio_lesson_playlists enable row level security;
alter table public.audio_lesson_playlist_entries enable row level security;
