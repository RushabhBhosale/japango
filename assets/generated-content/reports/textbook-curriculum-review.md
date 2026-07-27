# Textbook curriculum map review

## Verification result

All lesson boundaries now come from an explicit, reviewed page-anchor manifest over the cached OCR. The previous anywhere-on-page carry-forward regex was removed because contents pages, examples, indexes, and cross-references produced impossible assignments. No full or targeted OCR rerun was needed.

The map records bounded canonical token occurrences, **not verified first introductions**. Vocabulary, grammar, and kanji IDs can legitimately repeat in examples and reviews, so every placement remains `needsReview: true` / `releaseReady: false`. The map may guide deterministic staging but cannot itself authorize production content.

“Placement / unique / repeated” below counts ID appearances across lesson rows, distinct IDs in the book, and extra appearances beyond the first.

| Book | Lessons mapped/expected | Detected headings | Inferred headings | Low confidence | Vocabulary p/u/r | Grammar p/u/r | Kanji p/u/r |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Genki I | 12/12 | 12 | 0 | 0 | 594/353/241 | 309/65/244 | 188/89/99 |
| Genki II | 11/11 | 11 | 0 | 0 | 581/337/244 | 283/53/230 | 179/78/101 |
| Minna no Nihongo I Grammar | 25/25 | 23 | 2 | 2 | 530/348/182 | 354/53/301 | 117/71/46 |
| Minna no Nihongo I | 25/25 | 24 | 1 | 1 | 687/228/459 | 581/51/530 | 230/60/170 |
| Minna no Nihongo II Grammar | 25/25 | 25 | 0 | 0 | 480/282/198 | 413/45/368 | 150/55/95 |
| Minna no Nihongo II | 25/25 | 16 | 9 | 9 | 850/266/584 | 653/49/604 | 230/67/163 |

### Genki I

- Expected lesson range: 1–12
- Lesson rows mapped: 12
- Headings directly detected: 12
- Headings inferred from reviewed cadence: 0
- Lessons missing: none
- Impossible lesson assignments: none
- Low-confidence lesson rows: 0
- Empty or out-of-window page ranges: 0
- Vocabulary placements / unique IDs / repeated placements: 594 / 353 / 241
- Grammar placements / unique IDs / repeated placements: 309 / 65 / 244
- Kanji placements / unique IDs / repeated placements: 188 / 89 / 99
- Confidence policy: 0.7 for detected headings

### Genki II

- Expected lesson range: 13–23
- Lesson rows mapped: 11
- Headings directly detected: 11
- Headings inferred from reviewed cadence: 0
- Lessons missing: none
- Impossible lesson assignments: none
- Low-confidence lesson rows: 0
- Empty or out-of-window page ranges: 0
- Vocabulary placements / unique IDs / repeated placements: 581 / 337 / 244
- Grammar placements / unique IDs / repeated placements: 283 / 53 / 230
- Kanji placements / unique IDs / repeated placements: 179 / 78 / 101
- Confidence policy: 0.7 for detected headings

### Minna no Nihongo I Grammar

- Expected lesson range: 1–25
- Lesson rows mapped: 25
- Headings directly detected: 23
- Headings inferred from reviewed cadence: 2 (11, 12)
- Lessons missing: none
- Impossible lesson assignments: none
- Low-confidence lesson rows: 2
- Empty or out-of-window page ranges: 0
- Vocabulary placements / unique IDs / repeated placements: 530 / 348 / 182
- Grammar placements / unique IDs / repeated placements: 354 / 53 / 301
- Kanji placements / unique IDs / repeated placements: 117 / 71 / 46
- Confidence policy: 0.7 for detected headings; 0.5 for inferred headings

### Minna no Nihongo I

- Expected lesson range: 1–25
- Lesson rows mapped: 25
- Headings directly detected: 24
- Headings inferred from reviewed cadence: 1 (2)
- Lessons missing: none
- Impossible lesson assignments: none
- Low-confidence lesson rows: 1
- Empty or out-of-window page ranges: 0
- Vocabulary placements / unique IDs / repeated placements: 687 / 228 / 459
- Grammar placements / unique IDs / repeated placements: 581 / 51 / 530
- Kanji placements / unique IDs / repeated placements: 230 / 60 / 170
- Confidence policy: 0.7 for detected headings; 0.5 for inferred headings

### Minna no Nihongo II Grammar

- Expected lesson range: 26–50
- Lesson rows mapped: 25
- Headings directly detected: 25
- Headings inferred from reviewed cadence: 0
- Lessons missing: none
- Impossible lesson assignments: none
- Low-confidence lesson rows: 0
- Empty or out-of-window page ranges: 0
- Vocabulary placements / unique IDs / repeated placements: 480 / 282 / 198
- Grammar placements / unique IDs / repeated placements: 413 / 45 / 368
- Kanji placements / unique IDs / repeated placements: 150 / 55 / 95
- Confidence policy: 0.7 for detected headings

### Minna no Nihongo II

- Expected lesson range: 26–50
- Lesson rows mapped: 25
- Headings directly detected: 16
- Headings inferred from reviewed cadence: 9 (32, 33, 34, 35, 36, 38, 41, 43, 47)
- Lessons missing: none
- Impossible lesson assignments: none
- Low-confidence lesson rows: 9
- Empty or out-of-window page ranges: 0
- Vocabulary placements / unique IDs / repeated placements: 850 / 266 / 584
- Grammar placements / unique IDs / repeated placements: 653 / 49 / 604
- Kanji placements / unique IDs / repeated placements: 230 / 67 / 163
- Confidence policy: 0.7 for detected headings; 0.5 for inferred headings

## Remaining review

Confirm the inferred heading pages first, then resolve vocabulary-only identity ambiguities and dedicated grammar-book ambiguities from `textbook-ocr-review-queue.json`. Page references are physical PDF page numbers. Duplicate placements are review exposures, not new-content assignments.
