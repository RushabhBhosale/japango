# Textbook curriculum map review

## Verification result

All lesson boundaries now come from an explicit, reviewed page-anchor manifest over the cached OCR. The previous anywhere-on-page carry-forward regex was removed because contents pages, examples, indexes, and cross-references produced impossible assignments. No full or targeted OCR rerun was needed.

The map records bounded canonical token occurrences, **not verified first introductions**. Vocabulary, grammar, and kanji IDs can legitimately repeat in examples and reviews, so every placement remains `needsReview: true` / `releaseReady: false`. The map may guide deterministic staging but cannot itself authorize production content.

“Placement / unique / repeated” below counts ID appearances across lesson rows, distinct IDs in the book, and extra appearances beyond the first.

| Book | Lessons mapped/expected | Detected headings | Inferred headings | Low confidence | Vocabulary p/u/r | Grammar p/u/r | Kanji p/u/r |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Genki I | 12/12 | 12 | 0 | 0 | 611/367/244 | 309/65/244 | 195/95/100 |
| Genki II | 11/11 | 11 | 0 | 0 | 630/382/248 | 283/53/230 | 190/86/104 |
| Minna no Nihongo I Grammar | 25/25 | 23 | 2 | 2 | 558/375/183 | 354/53/301 | 120/74/46 |
| Minna no Nihongo I | 25/25 | 24 | 1 | 1 | 710/244/466 | 581/51/530 | 261/67/194 |
| Minna no Nihongo II Grammar | 25/25 | 25 | 0 | 0 | 554/346/208 | 413/45/368 | 156/61/95 |
| Minna no Nihongo II | 25/25 | 16 | 9 | 9 | 890/291/599 | 653/49/604 | 248/73/175 |

### Genki I

- Expected lesson range: 1–12
- Lesson rows mapped: 12
- Headings directly detected: 12
- Headings inferred from reviewed cadence: 0
- Lessons missing: none
- Impossible lesson assignments: none
- Low-confidence lesson rows: 0
- Empty or out-of-window page ranges: 0
- Vocabulary placements / unique IDs / repeated placements: 611 / 367 / 244
- Grammar placements / unique IDs / repeated placements: 309 / 65 / 244
- Kanji placements / unique IDs / repeated placements: 195 / 95 / 100
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
- Vocabulary placements / unique IDs / repeated placements: 630 / 382 / 248
- Grammar placements / unique IDs / repeated placements: 283 / 53 / 230
- Kanji placements / unique IDs / repeated placements: 190 / 86 / 104
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
- Vocabulary placements / unique IDs / repeated placements: 558 / 375 / 183
- Grammar placements / unique IDs / repeated placements: 354 / 53 / 301
- Kanji placements / unique IDs / repeated placements: 120 / 74 / 46
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
- Vocabulary placements / unique IDs / repeated placements: 710 / 244 / 466
- Grammar placements / unique IDs / repeated placements: 581 / 51 / 530
- Kanji placements / unique IDs / repeated placements: 261 / 67 / 194
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
- Vocabulary placements / unique IDs / repeated placements: 554 / 346 / 208
- Grammar placements / unique IDs / repeated placements: 413 / 45 / 368
- Kanji placements / unique IDs / repeated placements: 156 / 61 / 95
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
- Vocabulary placements / unique IDs / repeated placements: 890 / 291 / 599
- Grammar placements / unique IDs / repeated placements: 653 / 49 / 604
- Kanji placements / unique IDs / repeated placements: 248 / 73 / 175
- Confidence policy: 0.7 for detected headings; 0.5 for inferred headings

## Remaining review

Confirm the inferred heading pages first, then resolve vocabulary-only identity ambiguities and dedicated grammar-book ambiguities from `textbook-ocr-review-queue.json`. Page references are physical PDF page numbers. Duplicate placements are review exposures, not new-content assignments.
