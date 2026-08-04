# Audio Lessons

Audio Lessons is a versioned, audio-first N5/N4 library for listening while walking, commuting, or working. It is independent from the existing course and Lessons V2 progress: local playback state, downloads, favorites, question results, and cached playlists are stored in the Audio Lessons SQLite tables added by migration v20.

## Content and review policy

The supported types are grammar explanation, vocabulary review, dialogue practice, sentence-pattern drill, listening comprehension, short story, JLPT-style listening, lesson summary, kanji-in-context review, weak-topic review, mixed review, and shadowing practice.

Every version contains an audio script, transcripts, structured Japanese text, source references, linked vocabulary/kanji/grammar/related lesson IDs, listening questions, answer explanations, and timing metadata. The authored catalog contains 60 lessons (25 N5 and 35 N4). Rebuilt scripts run for roughly 11–15 measured minutes, contain eight checks per lesson, keep spoken English below 5%, and use Japanese for the introduction, vocabulary, grammar, examples, dialogue, guided replay, shadowing, question instructions, explanations, review, and closing. English is limited to very short question/answer cues and the concise answer needed for self-checking.

The validation boundary checks schema correctness, length, pause timing, visual-only wording, dense speech, exactly one answer, duplicates/high-similarity wording, dependency links, transcripts, and—when publishing—verified Japanese tokens plus a ready audio file for every section. The full script/question audit runs inside a lesson and across editable/published lessons. Exact duplicates and similarity at or above 0.86 block publishing.

All scripts/questions are original. OCR and JLPT sources are grounding references only; original Markdown OCR files are never edited. A published version is immutable. Create a new draft version before changing text or audio.

## Setup

Apply the Audio Lessons migration after the OCR and Lessons V2 migrations:

```bash
cd backend
npx supabase db push
```

Set the backend-only values in `backend/.env`:

```dotenv
LESSONS_V2_AUTH_MODE=disabled

# Default: device system speech, suitable for draft review only.
AUDIO_TTS_PROVIDER=system

# To generate publishable section audio through a private TTS service:
# AUDIO_TTS_PROVIDER=http
# AUDIO_TTS_BASE_URL=https://private-tts.example
# AUDIO_TTS_API_KEY=
```

The private HTTP provider receives `POST /synthesize` with `text`, `language`, `voice`, and `speakingRate`; it must return `{ "audioUrl": "https://...", "durationMs": 12345 }`. The API key remains in the backend. Neither it nor `SUPABASE_SERVICE_ROLE_KEY` is exposed to the Expo client.

To inspect the 60 pilot drafts without writes, then create them using a reviewed OCR chunk and linked dependencies:

```bash
cd backend
export AUDIO_PILOT_SOURCE_CHUNK_ID=<uuid-from-japanese_ocr_chunks>
export AUDIO_PILOT_SOURCE_PATH='assets/docs-reference/japango-ocr/...'
export AUDIO_PILOT_VOCABULARY_IDS=<comma-separated-v2-uuid-list>
export AUDIO_PILOT_KANJI_IDS=<comma-separated-v2-uuid-list>
export AUDIO_PILOT_RELATED_LESSON_IDS=<comma-separated-v2-uuid-list>
export AUDIO_PILOT_GRAMMAR_IDS=<comma-separated-curated-grammar-ids>
npm run audio-lessons:pilot -- --dry-run
npm run audio-lessons:pilot
```

The pilot set contains 25 N5 and 35 N4 lessons across grammar, vocabulary, sentence-pattern, dialogue, listening-comprehension, story, JLPT-style, and shadowing formats. Every lesson includes eight checks covering content detail, vocabulary, grammar, model-sentence recognition, reply recognition, spoken order, the pre-dialogue guide, and the complete dialogue. All are drafts. The seed pipeline records system-speech draft sections by default; configure `AUDIO_TTS_PROVIDER=http` before generating audio intended for production publication.

To validate the rebuilt catalog against the 60 existing records without writing anything:

```bash
cd backend
npm run audio-lessons:refresh
```

For the explicitly temporary single-user preview, create immutable successor versions and point the published catalog at them with:

```bash
npm run audio-lessons:refresh -- --confirm-preview-publish
```

That confirmation path intentionally permits device system speech and unverified draft token links so the catalog can be checked in the local-development app. It is restartable and skips lessons already published with the current revision marker. It must not be used as a production release process.

## Routes

- `GET /api/audio-lessons` accepts `level`, `lessonType`, `minMinutes`, and `maxMinutes`.
- `GET /api/audio-lessons/:lessonId` returns one published snapshot.
- `GET /api/audio-lessons/playlists` returns published playlists.
- Management routes under `/api/admin/audio-lessons` create/update drafts, audit, validate, generate section audio, resolve/create linked vocabulary and kanji, create a new version, archive, publish, and seed pilots. Generate, archive, new-version, publish, and seed writes require `{ "confirm": true }`. Dependency resolution creates new V2 vocabulary/kanji records in `review` state and links their IDs only to the mutable audio draft.

Management uses the existing `LESSONS_V2_AUTH_MODE` authorization adapter. With `disabled`, every management route is intentionally open for one local developer only. It is unsafe on a public deployment; enable a real authorization adapter before exposing the backend.

## Mobile playback

The mobile library has N5/N4, lesson type, duration, status, downloaded, favorite, recent, and search filters. It supports playlist navigation, resume position, per-section playback, 15-second seek controls, a tap-to-seek bar, repeat section/lesson, autoplay-next, playback modes, question scores, transcripts, optional furigana, favorites, and persistent offline downloads.

`expo-audio` is configured with background playback in `app.json`. A newly built native app is required after this configuration change. The player enables the native background session and lock-screen controls for sustained Android background/screen-off playback. `expo-file-system` stores downloaded section files in the app document directory.

## Current limitations and next milestone

- System speech is a draft-review fallback. It does not create a publishable audio file or offer exact seek/background guarantees; publication requires ready hosted section audio.
- The 60-lesson catalog may be explicitly published as a **local-development preview** to inspect the app. Those records use system speech and unverified Japanese links; archive or replace them with reviewed, hosted-audio versions before any public deployment.
- Audio is currently generated and played per section. Optional combined lesson files and gapless playlist audio can be added after the first real TTS provider is connected.
- The shadowing sequence now follows guided example → slow repeat → learner pause → natural dialogue replay. Fine-grained pronunciation scoring remains a future milestone.
- Bluetooth remote controls are deliberately not implemented.
- Audio progress remains local/offline-first. Add idempotent backend progress sync after account/authentication work is introduced.
