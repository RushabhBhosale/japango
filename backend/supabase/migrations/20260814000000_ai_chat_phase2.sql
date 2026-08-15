create extension if not exists pgcrypto;

create table if not exists public.ai_chat_device_registrations (
  local_user_id text primary key,
  expo_push_token text not null unique,
  time_zone text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_proactive_contexts (
  local_user_id text primary key,
  summary text,
  weaknesses jsonb not null default '[]'::jsonb,
  scenario jsonb,
  last_active_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_proactive_jobs (
  id uuid primary key default gen_random_uuid(),
  local_user_id text not null references public.ai_chat_device_registrations(local_user_id) on delete cascade,
  scheduled_local_date date not null,
  message text,
  teaching_target text,
  status text not null check (status in ('generating', 'sent', 'skipped', 'failed')),
  generated_at timestamptz,
  sent_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_user_id, scheduled_local_date)
);
create index if not exists ai_chat_proactive_jobs_status_idx
  on public.ai_chat_proactive_jobs(status, created_at desc);

alter table public.ai_chat_device_registrations enable row level security;
alter table public.ai_chat_proactive_contexts enable row level security;
alter table public.ai_chat_proactive_jobs enable row level security;

revoke all on table public.ai_chat_device_registrations, public.ai_chat_proactive_contexts, public.ai_chat_proactive_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_chat_device_registrations, public.ai_chat_proactive_contexts, public.ai_chat_proactive_jobs to service_role;
