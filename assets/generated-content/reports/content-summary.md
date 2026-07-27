# JapanGo content summary

This report describes the generated source-backed snapshot. It does **not** claim complete or pedagogically reviewed JLPT coverage.

## Generated records

| Content | N5 | N4 | Supplemental |
|---|---:|---:|---:|
| Vocabulary | 598 | 554 | 0 |
| Kanji | 79 | 166 | — |
| Grammar | 124 | 113 | — |
| Curriculum units | 42 | 38 | — |

## Canonical matching

- JMdict strict form-and-reading match rate: 1152/1386 (83.1%).
- KANJIDIC2 match rate for selected JLPT kanji: 245/245 (100.0%).
- Grammar: legacy N5 mappings remain review-only; N4 records come from JapanGo's manually curated, release-ready editorial source.
- Examples from the JMdict Yomitan bundle were excluded because their separate provenance and redistribution terms were not supplied.

## Textbook OCR canonical-hit ambiguity

All six PDFs are image-only. The completed cached OCR was read without reprocessing. The extractor retains canonical-token hits inside reviewed lesson windows and every placement remains review-required. Zero-match OCR tokens were not retained by the legacy extraction, so this table is **not an OCR match-rate measurement**.

| Book | OCR status | Canonical-hit occurrences | Unambiguous hits | Unambiguous share |
|---|---|---:|---:|---:|
| Genki I | Cached OCR candidates; review required | 1481 | 996 | 67.3% |
| Genki II | Cached OCR candidates; review required | 1393 | 917 | 65.8% |
| Minna no Nihongo I Grammar | Cached OCR candidates; review required | 893 | 648 | 72.6% |
| Minna no Nihongo I | Cached OCR candidates; review required | 1855 | 1203 | 64.9% |
| Minna no Nihongo II Grammar | Cached OCR candidates; review required | 934 | 594 | 63.6% |
| Minna no Nihongo II | Cached OCR candidates; review required | 2244 | 1446 | 64.4% |

## Unresolved and review counts

- unmatchedVocabulary: 202
- ambiguousVocabulary: 32
- unmatchedKanji: 0
- unmatchedGrammar: 0
- jlptLevelConflicts: 22
- textbookOcrConflicts: 2518
- lowConfidence: 124
- missingReferences: 0
- validationErrors: 0
- validationWarnings: 0

- Duplicate/conflicting mapping records: 15.
- JLPT-level conflicts: 22.
- Missing source information: licences/provenance for the JLPT vocabulary CSV and Kotoba Brew N5 CSV; a complete local KANJIDIC2/JMdict licence copy; textbook OCR metadata.

## Validation

- Errors: 0.
- Warnings: 0.
- None.

## Recommended manual-review priorities

1. Confirm provenance and redistribution terms for the JLPT vocabulary, JLPT kanji, and Kotoba Brew mappings before publication.
2. Maintain the reviewed N4 grammar source and its deterministic editorial decision ledger as project-owned canonical metadata.
3. Review ambiguous and unmatched vocabulary by Japanese form and kana reading, never by English gloss alone.
4. Work through the reduced lesson/identity review queue; rerun OCR only for a specifically identified unreadable page.
5. Editorially review grammar identity collisions and add original JapanGo formation rules, explanations, and prerequisites.
6. Treat generated curriculum units as deterministic staging only; they are not release-ready until textbook comparison and pedagogy review are complete.
