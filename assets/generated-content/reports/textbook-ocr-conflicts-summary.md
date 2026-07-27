# Textbook OCR conflict cleanup

## Scope and semantics

The supplied raw file contains 2,518 ambiguous canonical matches. It does **not** contain all OCR tokens: the original extractor discarded zero-match tokens before reporting. Consequently OCR noise, valid unmatched vocabulary, unique kanji, lesson headings, and page-order transitions cannot be measured from this raw conflict file and are reported as zero primary conflicts rather than fabricated classifications.

The earlier “matched/total” figures measured unambiguous versus ambiguous canonical-hit occurrences, not OCR match coverage. The cleaned lesson map now uses a reviewed page-anchor manifest instead of the unsafe carry-forward lesson regex.

## Deduplication result

- Total raw conflicts: 2,518
- Unique conflicts after source + normalized candidate + lesson + conflict-type deduplication: 851
- Later duplicate occurrences collapsed: 1,667
- Unique groups with repeated occurrences: 505
- Reduced manual review queue: 69
- Low-value formatting/noise groups excluded: 510 unique / 1,798 raw

Pages for each unique key are aggregated into contiguous page ranges; page ranges are metadata, not separate identities.

## Counts by conflict type

| Conflict type | Raw | Unique |
| --- | --- | --- |
| OCR noise | 0 | 0 |
| valid unmatched vocabulary | 0 | 0 |
| ambiguous JMdict match | 45 | 37 |
| grammar candidate | 675 | 304 |
| kanji candidate | 0 | 0 |
| lesson-heading candidate | 0 | 0 |
| formatting artifact | 1798 | 510 |
| page-order problem | 0 | 0 |
| duplicate occurrence (secondary) | 1667 | 505 |

“Duplicate occurrence” is a secondary classification and therefore overlaps the primary rows.

## Counts by book

| Book | Raw | Unique |
| --- | --- | --- |
| Genki I | 395 | 122 |
| Genki II | 396 | 112 |
| Minna no Nihongo I Grammar | 207 | 107 |
| Minna no Nihongo I | 566 | 188 |
| Minna no Nihongo II Grammar | 239 | 151 |
| Minna no Nihongo II | 715 | 171 |

## High-priority review set

The queue contains inferred/damaged lesson headings first (P0), useful vocabulary-only identity ambiguities within a bounded lesson second (P1), and non-particle grammar ambiguities from the dedicated Minna grammar references third (P2). Repeated bare particles, preface/index hits, textbook-body grammar repetitions, and formatting artifacts are excluded.

The map records OCR token occurrences, not verified first-introduction placements. Repeated canonical IDs must not be interpreted as textbook assignments without editorial review.

## Recommended review order

1. Confirm P0 lesson headings and page boundaries because they affect every downstream placement.
2. Resolve P1 JMdict identity choices before vocabulary sequencing or SQLite transformation.
3. Review P2 grammar identities alongside the OCR-only N4 heading candidate report.
4. Revisit textbook-body grammar occurrences only when a specific curriculum decision requires them.
5. Ignore low-information particle repetitions unless a targeted page review provides syntax context.
