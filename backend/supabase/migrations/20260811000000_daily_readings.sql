CREATE TABLE IF NOT EXISTS public.daily_readings (
  id text PRIMARY KEY,
  reading_date date NOT NULL,
  level text NOT NULL CHECK (level IN ('N5', 'N4')),
  reading_type text NOT NULL CHECK (reading_type IN (
    'slice-of-life', 'conversation', 'diary', 'travel', 'mystery',
    'school-work', 'fictional-news', 'culture', 'story-episode'
  )),
  title text NOT NULL,
  payload jsonb NOT NULL,
  series_id text,
  episode_number integer CHECK (episode_number IS NULL OR episode_number > 0),
  previous_episode_id text REFERENCES public.daily_readings(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reading_date, level)
);

CREATE INDEX IF NOT EXISTS daily_readings_recent_idx
  ON public.daily_readings(reading_date DESC, level);

CREATE TABLE IF NOT EXISTS public.daily_reading_generation_claims (
  reading_date date NOT NULL,
  level text NOT NULL CHECK (level IN ('N5', 'N4')),
  lock_token text NOT NULL,
  status text NOT NULL CHECK (status IN ('generating', 'published')),
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (reading_date, level)
);

-- Stores only bounded, non-identifying curriculum context. The most recent
-- context lets the scheduled job generate without receiving a full history.
CREATE TABLE IF NOT EXISTS public.daily_reading_generation_contexts (
  level text PRIMARY KEY CHECK (level IN ('N5', 'N4')),
  context_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

-- Reserved for authenticated progress sync. Guest progress remains local and
-- can migrate here without changing the challenge schema.
CREATE TABLE IF NOT EXISTS public.daily_reading_completions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reading_id text NOT NULL REFERENCES public.daily_readings(id) ON DELETE CASCADE,
  reading_date date NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  score integer CHECK (score BETWEEN 0 AND 100),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  vocabulary_tapped jsonb NOT NULL DEFAULT '{}'::jsonb,
  saved_vocabulary_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reading_id)
);

ALTER TABLE public.daily_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reading_generation_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reading_generation_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reading_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own Daily Reading completions"
  ON public.daily_reading_completions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert their own Daily Reading completions"
  ON public.daily_reading_completions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own Daily Reading completions"
  ON public.daily_reading_completions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
