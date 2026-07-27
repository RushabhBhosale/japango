# N4 grammar investigation

## Result

JapanGo's manually curated JLPT N4-aligned grammar curriculum contains **111 approved canonical records** plus 2 unresolved development-only records. 24 OCR-only Volume II heading candidates were written to `n4-grammar-candidates.json`; those candidates remain secondary review evidence and cannot override the manual source.

No OCR page was reprocessed. This investigation read the existing cache only.

## Grammar-related source inventory

| Filename | Source type | Exact detected schema | Raw level values | Count |
| --- | --- | --- | --- | ---: |
| `genki-1.pdf` | Image-only PDF + cached OCR | `page-NNNN.txt`, UTF-8 text; physical page in filename | none; N5 volume band is non-authoritative | 392 cached pages |
| `genki-2.pdf` | Image-only PDF + cached OCR | `page-NNNN.txt`, UTF-8 text; physical page in filename | none; N4 volume band is non-authoritative | 399 cached pages |
| `japango-n4-grammar-reviewed.json` | UTF-8 JSON | reviewed N4 record schema | fixed `N4` | 113 records |
| `Kotoba_Brew_JLPT_Grammar_Tracker.xlsx - N5.csv` | UTF-8 CSV | `#`, `Grammar Point`, `Meaning`, `Status`, `Notes`, `Link` | none; N5 is filename-derived | 125 records |
| `minna-no-nihongo-1-grammer.pdf` | Image-only PDF + cached OCR | `page-NNNN.txt`, UTF-8 text; physical page in filename | none; N5 volume band is non-authoritative | 212 cached pages |
| `minna-no-nihongo-1-textbook.pdf` | Image-only PDF + cached OCR | `page-NNNN.txt`, UTF-8 text; physical page in filename | none; N5 volume band is non-authoritative | 328 cached pages |
| `minna-no-nihongo-2-grammer.pdf` | Image-only PDF + cached OCR | `page-NNNN.txt`, UTF-8 text; physical page in filename | none; N4 volume band is non-authoritative | 186 cached pages |
| `minna-no-nihongo-2-textbook.pdf` | Image-only PDF + cached OCR | `page-NNNN.txt`, UTF-8 text; physical page in filename | none; N4 volume band is non-authoritative | 271 cached pages |

The legacy N5 mapping is `Kotoba_Brew_JLPT_Grammar_Tracker.xlsx - N5.csv`. The canonical N4 source is `japango-n4-grammar-reviewed.json`; it is project-owned manual editorial metadata and takes precedence over OCR candidates.

## Structured source schema and integrity

- Exact schema: `#`, `Grammar Point`, `Meaning`, `Status`, `Notes`, `Link`
- SHA-256: `sha256:a45cf0f530dca23c7577236c06b70aeb21e5e13cbf8737ca6ac610238ba86b1f`
- Reviewed N4 SHA-256: `sha256:1458ccaa75fce947a317a341c61868da04c0991d68892b65304b1c2904c6b7a4`
- Encoding: UTF-8; no BOM detected
- Data records: 125
- Row widths different from 6: 0
- Blank grammar patterns: 0
- Non-numeric order values: 0
- Malformed records: none
- Raw level field: absent
- Raw level values: none
- Detected counts: N5 125 (filename-derived), reviewed N4 113

The PDF sources are image-only curriculum references whose cached schema is one UTF-8 OCR text file per physical PDF page. They contain no authoritative JLPT level field.

## Parser filtering logic and cause

`parse-grammar-source.ts` reads the fixed legacy N5 CSV independently from the reviewed N4 JSON. The N4 wrapper and every record are validated before sorting by curriculum order, category, normalized pattern, and ID. `merge-grammar.ts` accepts those reviewed records directly and never promotes OCR headings.

The external tracker still lacks N4 records, but the project-owned reviewed JSON now supplies the canonical N4 curriculum without depending on that tracker.

## OCR-only candidate policy

Candidates come only from short top-level grammar heading identities within reviewed Genki II grammar-section ranges and the two Grammar Explanation pages for each Minna no Nihongo II Grammar lesson. Normalization is mechanical (NFKC, whitespace, wave-dash and punctuation spacing). No explanations, meanings, examples, exercises, or answers are copied or generated.

Each candidate retains book, lesson, and physical PDF page; has confidence 0.35 for one OCR source or 0.5 for independent-book corroboration; and is always `needsReview: true` / `releaseReady: false`. Volume II placement is only provisional N4-level evidence.

## Recommended correction

Maintain the reviewed JSON and its editorial decision ledger as the authoritative N4 source. Continue using OCR headings only as bounded cross-check evidence, and never promote them automatically.
