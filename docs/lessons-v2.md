# Lessons V2

Lessons V2 is a versioned, isolated lesson system. It does not alter the existing SQLite course tables, course unlocks, mastery engine, or lesson renderer.

## Development mode

`LESSONS_V2_AUTH_MODE=disabled` means one local operator can use all management routes and `/admin` pages without a session. This mode is local-development only and is unsafe on a public deployment. The route handlers call an authorization adapter rather than embedding this decision in lesson services; a future `supabase` adapter can replace it without changing versioning, validation, dependency, or generation logic.

Never send `SUPABASE_SERVICE_ROLE_KEY` to the browser or Expo client. Published V2 reading happens through `GET /api/lessons-v2`; Supabase mutations remain in backend services. The mobile app keeps separate SQLite V2 cache, progress, attempts, and word-action tables for offline work.

## Content rules

- A published version is immutable. The management UI creates a new draft version on the same lesson before any revision.
- `raw` Japanese text is canonical: token surfaces must concatenate exactly to it.
- Any automatic fallback tokenization has `needs_review` status and invents neither readings nor vocabulary links.
- Every published Japanese token, choice, prompt, passage, and explanation must be verified.
- Publishing is blocked for critical validation issues, unresolved dependencies, corrupted OCR reliance, or source similarity of 0.82 or higher.
- OCR corrections and answer-key mapping are separate from the original Markdown source files.
- Generated questions are drafts. They are never automatically published.

## Management endpoints

The V2 lesson collection is at `/api/admin/lessons-v2`; individual drafts support update, validation, dependency resolution, duplicate, publish, archive, generation planning, and conservative token regeneration. Publish, archive, duplicate, generated-question status changes, and token regeneration require a `confirm: true` request and matching UI confirmation.

`/api/admin/jlpt/question-papers` imports already-ingested private OCR chunks and extracts reviewable patterns. It is not an OCR file editor. Review source corrections, official-answer status, patterns, generated questions, and similarity warnings before publication.
