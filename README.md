# JapanGo

JapanGo is an Android-first Japanese learning app built with Expo, React Native, and TypeScript. Phase 1 is fully local: onboarding, a resumable JLPT N5 assessment, curated curriculum, deterministic mastery and review scheduling, and progress screens backed by SQLite.

No account, backend, analytics service, notification service, or AI provider is connected in this phase.

## Run the app

```bash
npm install
npm start
```

Use `npm run android` to open the Android target from Expo. Application routes live in `src/app` and use Expo Router.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
```

## Local architecture

- `src/features` contains validated curriculum seeds and deterministic assessment/mastery logic.
- `src/services/database` owns SQLite initialization, migrations, row validation, and repositories.
- `src/store` holds the small shared app session; SQLite remains the persisted source of truth.
- `src/components` contains the reusable design system and focused learning UI.

The app creates `japango.db` with migrations for learner profiles, curriculum, assessment questions, attempts, mastery, and settings. Seeded and stored data is validated with Zod. Assessment position and every confirmed answer are persisted so the skill check resumes after an app restart.

## Phase 1 learning model

Mastery is calculated locally in `src/features/progress/mastery-engine.ts`. Correct answers add mastery, incorrect answers reduce it, confidence combines accuracy and exposure, and the next review interval grows from hours to days. An item cannot become mastered after a single correct answer. The algorithm is intentionally documented, deterministic, and covered by unit tests so it can be replaced without changing screens.

## Deterministic content pipeline

The local N5/N4 content pipeline lives in `scripts/content`. It treats JMdict and KANJIDIC2 as canonical language sources, the supplied JLPT files as level mappings, KanjiVG as the stroke/component source, and textbook PDFs only as private curriculum references. It does not use AI or cloud OCR.

```bash
npm run content:inspect
npm run content:build
```

Generated, validated JSON is written in focused files under `assets/generated-content`. Compact app-facing bundles are separated into `assets/generated-content-compact/development/content.json` and `assets/generated-content-compact/release/content.json`; each embeds its profile, `releaseReadyOnly` setting, deterministic `contentVersion`, and payload `checksum`. Legacy N5 grammar mappings and generated curriculum units remain development-only, while approved records from `assets/docs-reference/japango-n4-grammar-reviewed.json` enter both bundles. That project-owned manual source has canonical priority over OCR-only candidates; its companion editorial ledger makes every merge, rejection, vocabulary move, N5 overlap, and unresolved row reproducible.

The compact schema includes reusable sentences and example views, reading passages, listening activities and speakers, questions and options, static learning metadata, target relationships, and deterministic assessment collections. `src/features/curriculum/generated-content-import.ts` defines the release/development guard and transactional import contract. SQLite migrations through v6 normalize learning, reading, listening, and assessment records without inserting authored content during schema migration. See [Learning content architecture](docs/learning-content-architecture.md), [Reading content](docs/reading-content.md), [Listening content](docs/listening-content.md), and [Assessment platform](docs/assessment-platform.md).

Intermediate normalized data and private OCR text are cached under `.cache/japango-content`, which is ignored by Git. `content:build` reads an existing OCR cache but never invokes OCR. Set `SOURCE_DATE_EPOCH` or `JAPANGO_GENERATED_AT` for a reproducible manifest timestamp. Curriculum cleanup reports cover N4 grammar sources/candidates, OCR conflict deduplication, textbook placement review, and assignment coverage under `assets/generated-content/reports`.

All supplied textbook PDFs are image-only. To opt into incremental local OCR, install the minimum macOS toolchain and select a book/page range:

```bash
brew install poppler ocrmypdf tesseract-lang
npm run content:ocr -- --book genki-1 --start 1 --end 20
```

OCR cache data is only used to propose book/lesson/page-to-canonical-ID metadata. It is never used for canonical readings, meanings, explanations, examples, or answers, and it must not be committed or redistributed.
