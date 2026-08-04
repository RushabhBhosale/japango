-- Audio Lessons now contain eight integrated listening checks. Their measured
-- scripts run longer than the original preview pilots, while remaining bounded
-- independently from Lessons V2.

alter table public.audio_lesson_versions
  drop constraint if exists audio_lesson_versions_estimated_minutes_check;

alter table public.audio_lesson_versions
  add constraint audio_lesson_versions_estimated_minutes_check
  check (estimated_minutes between 5 and 18);
