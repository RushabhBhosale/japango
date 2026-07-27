# Phase 9 curriculum audit

Phase 9 adds a deterministic, audit-first quality pass to the JapanGo N5/N4 content platform.

- 55 N4 kanji scope candidates are normalized in the local reference manifest. They are all `review-required`; validation does not promote them to release content.
- N5 now has 992 original, standalone grammar questions, plus the 30 retained Phase 8 bridge questions. The new corpus is `review-required`, so only the prior bridge remains assessment-eligible during editorial review.
- The vocabulary audit confirms 598 N5 + 554 new N4 records (1,152 cumulative). This is below the non-authoritative comparison ranges in the local manifest. No vocabulary was added without a normalized local evidence ledger, preventing count inflation and provenance drift.
- Phase 9 reports are generated under `assets/generated-content/reports/phase9-*.json`. They record coverage, lifecycle, density, orphaning, TTS state, assessment status, and explicit manual-review gaps.
- SQLite migration 7 introduces append-only curriculum-audit provenance records. Canonical learning records and question relationships retain the existing import path.

The production compact bundle remains empty for Phase 9 content. Approval and release promotion remain an editorial action, not an effect of passing validation.
