# JapanGo content summary

This report describes the generated source-backed snapshot. It does **not** claim complete or pedagogically reviewed JLPT coverage.

## Generated records

| Content | N5 | N4 | Supplemental |
|---|---:|---:|---:|
| Vocabulary | 598 | 1142 | 0 |
| Kanji | 79 | 221 | — |
| Grammar | 124 | 113 | — |
| Curriculum units | 42 | 39 | — |

## Canonical matching

- JMdict strict form-and-reading match rate: 1860/2125 (87.5%).
- KANJIDIC2 match rate for selected JLPT kanji: 300/300 (100.0%).
- Grammar: legacy N5 mappings remain review-only; N4 records come from JapanGo's manually curated, release-ready editorial source.
- Examples from the JMdict Yomitan bundle were excluded because their separate provenance and redistribution terms were not supplied.

## Textbook OCR canonical-hit ambiguity

All six PDFs are image-only. The completed cached OCR was read without reprocessing. The extractor retains canonical-token hits inside reviewed lesson windows and every placement remains review-required. Zero-match OCR tokens were not retained by the legacy extraction, so this table is **not an OCR match-rate measurement**.

| Book | OCR status | Canonical-hit occurrences | Unambiguous hits | Unambiguous share |
|---|---|---:|---:|---:|
| Genki I | Cached OCR candidates; review required | 1504 | 1015 | 67.5% |
| Genki II | Cached OCR candidates; review required | 1453 | 975 | 67.1% |
| Minna no Nihongo I Grammar | Cached OCR candidates; review required | 922 | 674 | 73.1% |
| Minna no Nihongo I | Cached OCR candidates; review required | 1907 | 1252 | 65.7% |
| Minna no Nihongo II Grammar | Cached OCR candidates; review required | 1013 | 672 | 66.3% |
| Minna no Nihongo II | Cached OCR candidates; review required | 2304 | 1504 | 65.3% |

## Unresolved and review counts

- unmatchedVocabulary: 229
- ambiguousVocabulary: 36
- unmatchedKanji: 0
- unmatchedGrammar: 0
- jlptLevelConflicts: 22
- textbookOcrConflicts: 2518
- lowConfidence: 124
- missingReferences: 0
- validationErrors: 0
- validationWarnings: 0

- Duplicate/conflicting mapping records: 137.
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
