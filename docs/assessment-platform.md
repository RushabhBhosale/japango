# Deterministic assessment platform

Phase 8 assembles original JLPT-aligned N5/N4 assessments from canonical JapanGo questions. It does not reproduce or claim to be official JLPT material.

## Architecture

`AssessmentEngine` accepts a validated blueprint, configuration, content version, seed, and optional exposure/mastery input. The engine filters lifecycle-ineligible, review-required, unresolved-target, invalid-answer, and incompatible-level records before selection. SHA-256 ranks equally eligible candidates, so identical content version, normalized configuration, and seed produce identical output.

The platform supports full mock, section, quick, daily, weak-area, mixed review, curriculum-unit, grammar mastery, vocabulary mastery, kanji mastery, reading practice, and listening practice assessments. Reading passages and listening activities are selected as complete parent groups. Safe constraint relaxation never relaxes lifecycle, answer validity, unresolved-target exclusion, level compatibility, or parent coherence.

## Full mocks and seeds

Five N5 and five N4 development mocks are generated from fixed seeds in `assets/docs-reference/japango-assessments/bundled-mock-exam-seeds.json`. N5 uses 90 questions in 90 minutes. N4 uses 112 questions in 115 minutes. These counts were selected from the available coherent parent-group sizes and app usability, not copied from an official form.

The Phase 8 pre-audit found no standalone N5 grammar questions. It therefore authorized exactly 30 original bridge questions over existing canonical N5 grammar and sentence records. The bridge adds no grammar, vocabulary, kanji, passage, or listening inventory.

## Snapshots, scoring, and readiness

Snapshots store question and parent IDs, exact ordering, configuration, section/timing/scoring rules, constraint relaxations, content and pipeline versions, generation timestamp, lifecycle, and a checksum. Restoration validates the checksum and fails if referenced content is absent; it never substitutes content silently.

Scoring awards one point per ordinary correct answer, zero for unanswered answers, and applies no negative marking. Results include section, domain, and target breakdowns and review references. Readiness is explicitly a JapanGo estimate. Strong evidence requires 180 answered questions or two full-mock equivalents, and a low major-domain score limits the label.

## Daily challenges and exposure

Daily identity includes installation key, local/UTC date representation supplied by the caller, timezone, level, and content version. Persist the returned snapshot to preserve the challenge across upgrades. Exposure input tracks counts, last-seen timestamps, recency, parent exposure, confidence, mistakes, and mastery; weak targets are prioritized while soft target limits prevent overload.

## Lifecycle and SQLite

All 80 curriculum units remain non-release, so every Phase 8 snapshot is development-only and the release compact bundle contains an empty assessment collection. Engine code can ship independently, but release content generation stays disabled until dependent curriculum, questions, reading, and listening content is approved.

SQLite migration v6 adds normalized assessment blueprints, presets, snapshots, sections, question/parent placements, scoring/timing/readiness rules, and derived views. The verification importer uses parent-before-child ordering, foreign keys, one transaction, bundle checksum identity, and checksum-identical rerun skipping.

## Commands

```bash
npm run content:assessments:audit
npm run content:assessments:author
npm run content:build
npm run content:assessments:validate
npm run content:assessments:sqlite
```
