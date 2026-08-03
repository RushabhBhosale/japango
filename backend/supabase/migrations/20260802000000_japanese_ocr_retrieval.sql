create extension if not exists pgcrypto;
create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists public.japanese_ocr_documents (
  id uuid primary key default gen_random_uuid(),
  source_path text not null unique,
  content_hash text not null check (char_length(content_hash) = 64),
  book text not null,
  volume text,
  source_type text not null check (source_type in ('textbook', 'grammar', 'workbook', 'question-paper', 'reference')),
  filename text not null,
  page_number integer check (page_number is null or page_number > 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.japanese_ocr_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.japanese_ocr_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_hash text not null unique check (char_length(chunk_hash) = 64),
  content text not null check (char_length(content) > 0),
  heading_path jsonb not null default '[]'::jsonb,
  page_number integer check (page_number is null or page_number > 0),
  book text not null,
  volume text,
  source_type text not null check (source_type in ('textbook', 'grammar', 'workbook', 'question-paper', 'reference')),
  filename text not null,
  embedding halfvec(2560) not null,
  content_tsv tsvector generated always as (to_tsvector('simple', content)) stored,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists japanese_ocr_chunks_embedding_hnsw_idx
  on public.japanese_ocr_chunks using hnsw (embedding halfvec_cosine_ops);
create index if not exists japanese_ocr_chunks_content_tsv_idx
  on public.japanese_ocr_chunks using gin (content_tsv);
create index if not exists japanese_ocr_chunks_content_trgm_idx
  on public.japanese_ocr_chunks using gin (content gin_trgm_ops);
create index if not exists japanese_ocr_chunks_metadata_idx
  on public.japanese_ocr_chunks (book, source_type, page_number);

alter table public.japanese_ocr_documents enable row level security;
alter table public.japanese_ocr_chunks enable row level security;

create or replace function public.replace_japanese_ocr_document(
  p_source_path text,
  p_content_hash text,
  p_book text,
  p_volume text,
  p_source_type text,
  p_filename text,
  p_page_number integer,
  p_chunks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
begin
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'p_chunks must be a non-empty JSON array';
  end if;

  insert into public.japanese_ocr_documents (
    source_path, content_hash, book, volume, source_type, filename, page_number, chunk_count, updated_at
  ) values (
    p_source_path, p_content_hash, p_book, p_volume, p_source_type, p_filename, p_page_number,
    jsonb_array_length(p_chunks), now()
  )
  on conflict (source_path) do update set
    content_hash = excluded.content_hash,
    book = excluded.book,
    volume = excluded.volume,
    source_type = excluded.source_type,
    filename = excluded.filename,
    page_number = excluded.page_number,
    chunk_count = excluded.chunk_count,
    updated_at = now()
  returning id into v_document_id;

  delete from public.japanese_ocr_chunks where document_id = v_document_id;

  insert into public.japanese_ocr_chunks (
    document_id, chunk_index, chunk_hash, content, heading_path, page_number,
    book, volume, source_type, filename, embedding
  )
  select
    v_document_id,
    item.chunk_index,
    item.chunk_hash,
    item.content,
    coalesce(item.heading_path, '[]'::jsonb),
    item.page_number,
    p_book,
    p_volume,
    p_source_type,
    p_filename,
    item.embedding::text::halfvec
  from jsonb_to_recordset(p_chunks) as item(
    chunk_index integer,
    chunk_hash text,
    content text,
    heading_path jsonb,
    page_number integer,
    embedding jsonb
  );

  return v_document_id;
end;
$$;

create or replace function public.search_japanese_ocr(
  p_query text,
  p_embedding halfvec(2560),
  p_limit integer default 8,
  p_book text default null,
  p_source_type text default null
)
returns table (
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
    ranked.content,
    (
      0.72 * ranked.vector_score
      + 0.18 * least(1::double precision, ranked.full_text_score)
      + 0.10 * greatest(0::double precision, ranked.trigram_score)
    ) as score,
    ranked.book,
    ranked.page,
    ranked.source_type,
    ranked.filename
  from ranked
  where ranked.vector_score > 0.15
    or ranked.full_text_score > 0
    or ranked.trigram_score > 0.05
  order by score desc, ranked.page nulls last, ranked.filename
  limit least(greatest(p_limit, 1), 20);
$$;

revoke all on function public.replace_japanese_ocr_document(text, text, text, text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.search_japanese_ocr(text, halfvec, integer, text, text) from public, anon, authenticated;
grant execute on function public.replace_japanese_ocr_document(text, text, text, text, text, text, integer, jsonb) to service_role;
grant execute on function public.search_japanese_ocr(text, halfvec, integer, text, text) to service_role;
