# Reading content pipeline

Phase 6 adds JapanGo's original JLPT N5/N4-aligned reading passage and reading-comprehension corpus to the shared versioned learning-content model.

Passage text is canonical in `readingPassages`; questions reference a passage ID and do not duplicate the Japanese text. Passage relationships to grammar, vocabulary, kanji, and curriculum are embedded in the portable JSON model and normalized into SQLite relationship tables during import. No passage `Sentence` records are created.

Run the stages in this order:

```sh
npm run content:reading:audit
npm run content:reading:author
npm run content:build
npm run content:reading:validate
npm run content:sentences:sqlite
```

All current N5 and N4 curriculum units are non-release. The 146 approved-quality passages and their 508 questions therefore remain in canonical and development outputs and are excluded from the release bundle. This lifecycle exclusion is not a content-quality failure.

The canonical corpus is under `assets/docs-reference/japango-reading/`. Generated records, ID-only views, reports, and review queues are under `assets/generated-content/`. The development SQLite verification imports passages before their questions and verifies foreign keys, transactions, stable ordering, checksum identity, and idempotent skipping.
