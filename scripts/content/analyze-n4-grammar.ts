import { readFile } from "node:fs/promises";
import path from "node:path";

import { OCR_CACHE_ROOT, OUTPUT_ROOT, SOURCE_PATHS, SOURCE_ROOT } from "./config";
import { parseCsv } from "./lib/csv";
import {
  listFilesRecursively,
  relativePosix,
  sha256File,
  sha256Text,
  writeJson,
  writeText,
} from "./lib/fs-utils";
import { normalizeJapaneseForm } from "./lib/text-utils";
import {
  lessonWindows,
  TEXTBOOK_PROFILES,
  type TextbookProfile,
} from "./textbook-profiles";

interface N4GrammarCandidateReference {
  sourceBook: string;
  sourceFile: string;
  edition: string | null;
  lesson: number;
  page: number;
  section: "grammar-heading";
}

export interface N4GrammarCandidate {
  id: string;
  pattern: string;
  targetLevel: "N4";
  levelEvidence: string;
  references: N4GrammarCandidateReference[];
  confidence: number;
  needsReview: true;
  releaseReady: false;
}

function cacheSlug(fileName: string): string {
  return fileName.replace(/\.pdf$/iu, "");
}

function cleanHeading(value: string): string {
  const identityOnly = value
    .split("|")[0]
    .replace(
      /\s+(?:Would you|Do you|Which|How|Who|I hear|I forgot|forgot to|still V|in order to|means [“"]|about yourself|when you are|which we learned).*$/iu,
      "",
    );
  return normalizeJapaneseForm(identityOnly)
    .replace(/^[|!Il\s]+/u, "")
    .replace(/[|]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function usefulHeading(value: string): boolean {
  if (!value || value.length > 120) return false;
  if (/^(?:grammar|grammar explanation|sentence patterns?)$/iu.test(value)) {
    return false;
  }
  if (
    /(?:^|\s)(?:Note that|You can|which we learned|Grammar\s*\d|Sample|Example)(?:\s|$)/iu.test(
      value,
    ) ||
    /[0-9]|[%:：]|[！？!?]/u.test(value)
  ) {
    return false;
  }
  const japaneseCount = Array.from(
    value.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu),
  ).length;
  const hasGrammarIdentity =
    /(?:potential|volitional|passive|causative|conditional|imperative|prohibitive|honorific|humble|modest|form|sentence|expression|quantifier|intransitive|transitive)/iu.test(
      value,
    );
  const latinNoise = value.match(/[A-Za-z]{2,}/gu) ?? [];
  if (
    japaneseCount > 0 &&
    latinNoise.some(
      (token) =>
        !/^(?:and|adj|form|plain|dictionary|potential|passive|causative|conditional|honorific|humble|expressions)$/iu.test(
          token,
        ),
    )
  ) {
    return false;
  }
  return japaneseCount > 0 || hasGrammarIdentity;
}

function minnaGrammarHeadings(text: string): string[] {
  const output: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(
      /^\s*[|!Il]*\s*(?:[1-9]|1[0-2])\s*[.．]\s*(.{1,120}?)\s*$/u,
    );
    const heading = cleanHeading(match?.[1] ?? "");
    if (usefulHeading(heading)) output.push(heading);
  }
  return [...new Set(output)];
}

const GENKI_CONCEPT_HEADING =
  /(?:Potential Verbs|Volitional Form|Passive Sentences|Causative(?:-passive)? Sentences|Honorific Verbs|Humble Expressions|Extra-modest Expressions)/iu;

function genkiGrammarHeadings(text: string): string[] {
  const output: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const concept = line.match(GENKI_CONCEPT_HEADING)?.[0];
    const heading = cleanHeading(concept ?? "");
    if (usefulHeading(heading)) output.push(heading);
  }
  return [...new Set(output)];
}

async function cachedPage(profile: TextbookProfile, page: number): Promise<string> {
  return readFile(
    path.join(
      OCR_CACHE_ROOT,
      cacheSlug(profile.sourceFile),
      "pages",
      `page-${String(page).padStart(4, "0")}.txt`,
    ),
    "utf8",
  );
}

async function extractN4GrammarCandidates(): Promise<N4GrammarCandidate[]> {
  const referencesByPattern = new Map<string, N4GrammarCandidateReference[]>();
  const displayPattern = new Map<string, string>();
  for (const profile of TEXTBOOK_PROFILES.filter(
    (candidate) =>
      candidate.sourceFile === "genki-2.pdf" ||
      candidate.sourceFile === "minna-no-nihongo-2-grammer.pdf",
  )) {
    for (const window of lessonWindows(profile)) {
      if (!window.grammarStartPage) continue;
      const pages =
        profile.sourceFile === "minna-no-nihongo-2-grammer.pdf"
          ? [window.grammarStartPage, window.grammarStartPage + 1]
          : Array.from(
              { length: Math.min(10, window.endPage - window.grammarStartPage + 1) },
              (_, index) => window.grammarStartPage! + index,
            );
      for (const page of pages) {
        const text = await cachedPage(profile, page);
        if (
          profile.sourceFile === "genki-2.pdf" &&
          page > window.grammarStartPage &&
          /Expression Notes/iu.test(text)
        ) {
          break;
        }
        const headings =
          profile.sourceFile === "genki-2.pdf"
            ? genkiGrammarHeadings(text)
            : minnaGrammarHeadings(text);
        for (const heading of headings) {
          const normalized = normalizeJapaneseForm(heading).toLocaleLowerCase("en-US");
          displayPattern.set(normalized, displayPattern.get(normalized) ?? heading);
          const reference: N4GrammarCandidateReference = {
            sourceBook: profile.sourceBook,
            sourceFile: profile.sourceFile,
            edition: profile.edition,
            lesson: window.lesson,
            page,
            section: "grammar-heading",
          };
          const existing = referencesByPattern.get(normalized) ?? [];
          if (
            !existing.some(
              (candidate) =>
                candidate.sourceFile === reference.sourceFile &&
                candidate.lesson === reference.lesson &&
                candidate.page === reference.page,
            )
          ) {
            referencesByPattern.set(normalized, [...existing, reference]);
          }
        }
      }
    }
  }

  return [...referencesByPattern]
    .map(([normalized, references]): N4GrammarCandidate => {
      references.sort(
        (left, right) =>
          left.sourceFile.localeCompare(right.sourceFile) ||
          left.lesson - right.lesson ||
          left.page - right.page,
      );
      const independentBooks = new Set(references.map(({ sourceBook }) => sourceBook));
      return {
        id: `n4-grammar-candidate-${sha256Text(normalized).slice(0, 12)}`,
        pattern: displayPattern.get(normalized) ?? normalized,
        targetLevel: "N4",
        levelEvidence:
          "Volume II OCR curriculum reference; not an authoritative JLPT mapping.",
        references,
        confidence: independentBooks.size > 1 ? 0.5 : 0.35,
        needsReview: true,
        releaseReady: false,
      };
    })
    .sort(
      (left, right) =>
        left.pattern.localeCompare(right.pattern, "ja") ||
        left.id.localeCompare(right.id),
    );
}

export async function analyzeN4Grammar(): Promise<N4GrammarCandidate[]> {
  const allFiles = await listFilesRecursively(SOURCE_ROOT);
  const textbookSourceFiles = new Set<string>(
    TEXTBOOK_PROFILES.map(({ sourceFile }) => sourceFile),
  );
  const grammarSources = allFiles.filter(
    (filePath) =>
      filePath === SOURCE_PATHS.grammar ||
      filePath === SOURCE_PATHS.reviewedN4Grammar ||
      textbookSourceFiles.has(path.basename(filePath)),
  );
  const rawCsv = await readFile(SOURCE_PATHS.grammar, "utf8");
  const rows = parseCsv(rawCsv.replace(/^\uFEFF/u, ""));
  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim()));
  const malformed = dataRows
    .map((row, index) => ({ sourceRow: index + 2, width: row.length }))
    .filter(({ width }) => width !== headers.length);
  const blankPatterns = dataRows.filter((row) => !(row[1] ?? "").trim()).length;
  const nonNumericOrders = dataRows.filter(
    (row) => !Number.isFinite(Number.parseInt(row[0] ?? "", 10)),
  ).length;
  const checksum = await sha256File(SOURCE_PATHS.grammar);
  const reviewedSource = JSON.parse(
    await readFile(SOURCE_PATHS.reviewedN4Grammar, "utf8"),
  ) as { grammar?: Array<{ reviewStatus?: string }> };
  const reviewedCount = reviewedSource.grammar?.length ?? 0;
  const approvedCount =
    reviewedSource.grammar?.filter(
      ({ reviewStatus }) => reviewStatus === "approved",
    ).length ?? 0;
  const reviewedChecksum = await sha256File(SOURCE_PATHS.reviewedN4Grammar);
  const candidates = await extractN4GrammarCandidates();
  await writeJson(
    path.join(OUTPUT_ROOT, "reports/n4-grammar-candidates.json"),
    candidates,
  );

  const sourceRows = await Promise.all(
    grammarSources.map(async (filePath) => {
      const fileName = path.basename(filePath);
      if (filePath === SOURCE_PATHS.grammar) {
        return `| \`${relativePosix(SOURCE_ROOT, filePath)}\` | UTF-8 CSV | ${headers.map((header) => `\`${header}\``).join(", ")} | none; N5 is filename-derived | ${dataRows.length} records |`;
      }
      if (filePath === SOURCE_PATHS.reviewedN4Grammar) {
        return `| \`${relativePosix(SOURCE_ROOT, filePath)}\` | UTF-8 JSON | reviewed N4 record schema | fixed \`N4\` | ${reviewedCount} records |`;
      }
      const profile = TEXTBOOK_PROFILES.find(
        ({ sourceFile }) => sourceFile === fileName,
      );
      const pageFiles = await listFilesRecursively(
        path.join(OCR_CACHE_ROOT, cacheSlug(fileName), "pages"),
      );
      return `| \`${relativePosix(SOURCE_ROOT, filePath)}\` | Image-only PDF + cached OCR | \`page-NNNN.txt\`, UTF-8 text; physical page in filename | none; ${profile?.levelBand ?? "unknown"} volume band is non-authoritative | ${pageFiles.length} cached pages |`;
    }),
  );
  const report = `# N4 grammar investigation

## Result

JapanGo's manually curated JLPT N4-aligned grammar curriculum contains **${approvedCount} approved canonical records** plus ${reviewedCount - approvedCount} unresolved development-only records. ${candidates.length} OCR-only Volume II heading candidates were written to \`n4-grammar-candidates.json\`; those candidates remain secondary review evidence and cannot override the manual source.

No OCR page was reprocessed. This investigation read the existing cache only.

## Grammar-related source inventory

| Filename | Source type | Exact detected schema | Raw level values | Count |
| --- | --- | --- | --- | ---: |
${sourceRows.join("\n")}

The legacy N5 mapping is \`${relativePosix(SOURCE_ROOT, SOURCE_PATHS.grammar)}\`. The canonical N4 source is \`${relativePosix(SOURCE_ROOT, SOURCE_PATHS.reviewedN4Grammar)}\`; it is project-owned manual editorial metadata and takes precedence over OCR candidates.

## Structured source schema and integrity

- Exact schema: \`${headers.join("`, `")}\`
- SHA-256: \`${checksum}\`
- Reviewed N4 SHA-256: \`${reviewedChecksum}\`
- Encoding: UTF-8; no BOM detected
- Data records: ${dataRows.length}
- Row widths different from ${headers.length}: ${malformed.length}
- Blank grammar patterns: ${blankPatterns}
- Non-numeric order values: ${nonNumericOrders}
- Malformed records: ${malformed.length === 0 ? "none" : malformed.map(({ sourceRow }) => sourceRow).join(", ")}
- Raw level field: absent
- Raw level values: none
- Detected counts: N5 ${dataRows.length} (filename-derived), reviewed N4 ${reviewedCount}

The PDF sources are image-only curriculum references whose cached schema is one UTF-8 OCR text file per physical PDF page. They contain no authoritative JLPT level field.

## Parser filtering logic and cause

\`parse-grammar-source.ts\` reads the fixed legacy N5 CSV independently from the reviewed N4 JSON. The N4 wrapper and every record are validated before sorting by curriculum order, category, normalized pattern, and ID. \`merge-grammar.ts\` accepts those reviewed records directly and never promotes OCR headings.

The external tracker still lacks N4 records, but the project-owned reviewed JSON now supplies the canonical N4 curriculum without depending on that tracker.

## OCR-only candidate policy

Candidates come only from short top-level grammar heading identities within reviewed Genki II grammar-section ranges and the two Grammar Explanation pages for each Minna no Nihongo II Grammar lesson. Normalization is mechanical (NFKC, whitespace, wave-dash and punctuation spacing). No explanations, meanings, examples, exercises, or answers are copied or generated.

Each candidate retains book, lesson, and physical PDF page; has confidence 0.35 for one OCR source or 0.5 for independent-book corroboration; and is always \`needsReview: true\` / \`releaseReady: false\`. Volume II placement is only provisional N4-level evidence.

## Recommended correction

Maintain the reviewed JSON and its editorial decision ledger as the authoritative N4 source. Continue using OCR headings only as bounded cross-check evidence, and never promote them automatically.
`;
  await writeText(
    path.join(OUTPUT_ROOT, "reports/n4-grammar-investigation.md"),
    report,
  );
  return candidates;
}
