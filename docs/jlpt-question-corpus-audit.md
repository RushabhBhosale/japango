# JLPT N5/N4 question-paper corpus audit

The audit reads the private Markdown OCR corpus without changing it. It verifies question-booklet signals in content (section headers, instructions, answer tables, and scripts); filename year/edition is recorded as metadata, not treated as proof of question type.

| Paper | OCR files / page range | Content sections | Keys and scripts | Use status |
| --- | --- | --- | --- | --- |
| N5 2012-12 | 23 / 1–23 | vocab/kanji, grammar, reading, listening | no key or script | review only |
| N5 2013-07 | 24 / 1–24 | vocab/kanji, grammar, reading, listening | no key or script | review only |
| N5 2017-07 | 45 / 1–45 | vocab/kanji, grammar, reading, listening | answer-key pp. 44–45 | preferred template source |
| N5 2018 | 57 / 1–57 | vocab/kanji, grammar, reading, listening | key pp. 47–48; scripts detected pp. 49–55 and 57 | review key OCR before use |
| N4 2014-07 | 24 / 1–24 | vocab/kanji, grammar, reading, listening | no key or script | review only |
| N4 2017-07 | 60 / 1–60 | vocab/kanji, grammar, reading, listening | key pp. 49–50; scripts pp. 51–59 | preferred template source |
| N4 2018-12 | 24 / 1–24 | vocab/kanji, grammar, reading, listening | no key or script | review only |
| N4 2021-07 | 31 / 1–31 | partial/mixed evidence | no key or script | uncertain; do not extract automatically |
| N4 2021-12 | 20 / 1–20 | partial/mixed evidence | no key or script | uncertain; do not extract automatically |

All nine filename sequences are contiguous, but that does not prove every physical booklet page is usable. The corpus has three exact duplicate-page sets: N4 2017-07 pp. 02/13, N5 2017-07 pp. 02/29, and N5 2018 pp. 02/12/29. They are excluded from automatic extraction.

Detected quality problems include duplicated Markdown blocks, mixed Chinese glyphs, malformed answer sheets, unreadable-text markers, and malformed options. These files are marked `needs_review` or `corrupted`; the extractor never repairs them silently. No JLPT audio files are present, so scripts can inform private format analysis only, not audio-backed listening publication.

The corpus supports reading/kanji, written-form, vocabulary-cloze, similar-meaning, N4 word-usage, grammar-cloze, star-ordering, practical short reading, information-retrieval, listening-task, and quick-response templates. Templates are structural records with source chunk references, not republished paper questions.
