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
- A full-content audit scans dialogues, examples, reading passages, exercises, question prompts, answer choices, explanations, speaking prompts, review cards, listening text, and non-archived generated mock-test questions. It covers the current draft and the published snapshot when they differ, while ignoring superseded revisions of the same lesson.
- Exact repeated content and text similarity of 0.86 or higher are critical and block publication. Similarity from 0.72 through 0.85 is a review warning; replace it when the repeated structure is unnecessary.
- The audit never normalizes or rewrites learner-visible text. Any editorial revision must preserve canonical Japanese `raw` text, verified furigana/token boundaries, vocabulary and kanji links, audio alignment, and the answer explanation.
- Publishing is blocked for critical validation issues, unresolved dependencies, corrupted OCR reliance, repeated content, or source similarity of 0.82 or higher.
- OCR corrections and answer-key mapping are separate from the original Markdown source files.
- Generated questions are drafts. They are never automatically published.

## Management endpoints

The V2 lesson collection is at `/api/admin/lessons-v2`; `GET /api/admin/lessons-v2/audit` returns the read-only cross-lesson content report. Individual drafts support update, validation, dependency resolution, duplicate, publish, archive, generation planning, and conservative token regeneration. Publish, archive, duplicate, generated-question status changes, and token regeneration require a `confirm: true` request and matching UI confirmation.

Run `npm run lessons-v2:content-audit` from `backend` to audit the configured Supabase corpus from the terminal. It exits with code 2 if any publication-blocking content issue remains.

Generated mock-test questions must pass the same audit before they can be approved or published, because both statuses can be selected for learner practice.

`/api/admin/jlpt/question-papers` imports already-ingested private OCR chunks and extracts reviewable patterns. It is not an OCR file editor. Review source corrections, official-answer status, patterns, generated questions, and similarity warnings before publication.
