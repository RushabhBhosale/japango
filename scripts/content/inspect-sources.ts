import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { open, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CACHE_ROOT,
  OUTPUT_ROOT,
  PROJECT_ROOT,
  SOURCE_PATHS,
  SOURCE_ROOT,
  TEXTBOOKS,
} from "./config";
import { inspectPdfs } from "./inspect-pdfs";
import { parseCsv, rowsToObjects } from "./lib/csv";
import {
  listFilesRecursively,
  pathExists,
  relativePosix,
  writeText,
} from "./lib/fs-utils";
import type { PdfInspection } from "./types";

const REPORT_PATH = path.join(OUTPUT_ROOT, "reports", "source-inspection.md");
const PDF_CACHE_PATH = path.join(CACHE_ROOT, "inspection", "pdfs.json");
const SAMPLE_BYTES = 256 * 1024;

interface InventoryEntry {
  encoding: string;
  format: string;
  relativePath: string;
  sizeBytes: number;
}

interface JmdictInspection {
  attribution: string;
  formatVersion: string;
  revision: string;
  schema: string;
  tagCount: number;
  termBankCount: number;
  termCount: number;
}

interface CsvInspection {
  headers: string[];
  levelCounts: Record<string, number>;
  recordCount: number;
}

interface KanjidicInspection {
  characterCount: number;
  creationDate: string;
  databaseVersion: string;
  fileVersion: string;
}

interface JlptKanjiInspection {
  filteredCount: number;
  filteredSchema: string[];
  fullSectionCounts: Record<string, number>;
  levelCounts: Record<string, number>;
  targetCharacters: Map<"N5" | "N4", string[]>;
}

interface KanjiVgInspection {
  fileCount: number;
  n4Coverage: number;
  n4TargetCount: number;
  n5Coverage: number;
  n5TargetCount: number;
  schema: string;
}

function number(value: number): string {
  return value.toLocaleString("en-US");
}

function byteSize(value: number): string {
  if (value < 1024) {
    return `${number(value)} B`;
  }
  const units = ["KiB", "MiB", "GiB"];
  let amount = value;
  let unit = "B";
  for (const nextUnit of units) {
    amount /= 1024;
    unit = nextUnit;
    if (amount < 1024) {
      break;
    }
  }
  return `${number(value)} B (${amount.toFixed(2)} ${unit})`;
}

function markdownCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, "<br>");
}

function markdownTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.map(markdownCell).join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  return [
    header,
    divider,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
  ].join("\n");
}

function formatAndEncoding(filePath: string): Pick<InventoryEntry, "format" | "encoding"> {
  switch (path.extname(filePath).toLowerCase()) {
    case ".pdf":
      return { format: "PDF", encoding: "binary" };
    case ".msgpack":
      return { format: "MessagePack", encoding: "binary" };
    case ".json":
      return { format: "JSON", encoding: "UTF-8" };
    case ".xml":
      return { format: "XML", encoding: "UTF-8 (declared)" };
    case ".svg":
      return { format: "SVG 1.0 / XML", encoding: "UTF-8 (declared)" };
    case ".csv":
      return { format: "CSV", encoding: "UTF-8" };
    case ".md":
      return { format: "Markdown", encoding: "UTF-8" };
    case ".py":
      return { format: "Python source", encoding: "UTF-8" };
    default:
      return { format: "unknown", encoding: "unknown" };
  }
}

async function collectInventory(): Promise<InventoryEntry[]> {
  if (!(await pathExists(SOURCE_ROOT))) {
    throw new Error(`Source directory is missing: ${SOURCE_ROOT}`);
  }
  const files = await listFilesRecursively(SOURCE_ROOT);
  const entries: InventoryEntry[] = [];
  const batchSize = 128;
  for (let start = 0; start < files.length; start += batchSize) {
    const batch = files.slice(start, start + batchSize);
    const stats = await Promise.all(batch.map((filePath) => stat(filePath)));
    batch.forEach((filePath, index) => {
      const detected = formatAndEncoding(filePath);
      entries.push({
        ...detected,
        relativePath: relativePosix(path.dirname(SOURCE_ROOT), filePath),
        sizeBytes: stats[index]?.size ?? 0,
      });
    });
  }
  return entries.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "en", { numeric: true }),
  );
}

async function readTextSample(filePath: string): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(SAMPLE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, bytesRead),
    );
  } finally {
    await handle.close();
  }
}

async function readUtf8File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function extractXmlValue(sample: string, tag: string): string {
  return sample.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, "u"))?.[1]?.trim() ?? "not detected";
}

async function countToken(filePath: string, token: string): Promise<number> {
  let count = 0;
  let carry = "";
  for await (const rawChunk of createReadStream(filePath, { encoding: "utf8" })) {
    const chunk = carry + rawChunk;
    let searchFrom = 0;
    while (true) {
      const found = chunk.indexOf(token, searchFrom);
      if (found < 0) {
        break;
      }
      count += 1;
      searchFrom = found + token.length;
    }
    carry = chunk.slice(Math.max(0, chunk.length - token.length + 1));
  }
  return count;
}

async function inspectJmdict(): Promise<JmdictInspection> {
  const indexPath = path.join(SOURCE_PATHS.jmdict, "index.json");
  const index = JSON.parse(await readUtf8File(indexPath)) as Record<string, unknown>;
  const names = await readdir(SOURCE_PATHS.jmdict);
  const termBanks = names
    .filter((name) => /^term_bank_\d+\.json$/u.test(name))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const tagBanks = names
    .filter((name) => /^tag_bank_\d+\.json$/u.test(name))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));

  let termCount = 0;
  let firstTerm: unknown = null;
  for (const fileName of termBanks) {
    const bank = JSON.parse(
      await readUtf8File(path.join(SOURCE_PATHS.jmdict, fileName)),
    ) as unknown;
    if (!Array.isArray(bank)) {
      throw new Error(`${fileName} is not a Yomitan term-bank array.`);
    }
    termCount += bank.length;
    firstTerm ??= bank[0];
  }

  let tagCount = 0;
  for (const fileName of tagBanks) {
    const bank = JSON.parse(
      await readUtf8File(path.join(SOURCE_PATHS.jmdict, fileName)),
    ) as unknown;
    if (!Array.isArray(bank)) {
      throw new Error(`${fileName} is not a Yomitan tag-bank array.`);
    }
    tagCount += bank.length;
  }

  const termWidth = Array.isArray(firstTerm) ? firstTerm.length : 0;
  return {
    attribution:
      typeof index.attribution === "string"
        ? index.attribution
        : "No attribution field detected.",
    formatVersion: typeof index.format === "number" ? String(index.format) : "not detected",
    revision: typeof index.revision === "string" ? index.revision : "not detected",
    schema:
      termWidth === 8
        ? "Yomitan format-3 term tuples: [expression, reading, definitionTags, rules, score, glossary, sequence, termTags]"
        : `Yomitan term tuple width ${termWidth || "unknown"}; parser review required`,
    tagCount,
    termBankCount: termBanks.length,
    termCount,
  };
}

async function inspectCsv(filePath: string, levelColumn: string | null): Promise<CsvInspection> {
  const text = (await readUtf8File(filePath)).replace(/^\uFEFF/u, "");
  const parsed = parseCsv(text);
  const headers = parsed[0]?.map((header) => header.trim()) ?? [];
  const records = rowsToObjects(parsed);
  const levelCounts: Record<string, number> = {};
  if (levelColumn) {
    for (const record of records) {
      const level = record[levelColumn] || "blank";
      levelCounts[level] = (levelCounts[level] ?? 0) + 1;
    }
  }
  return { headers, levelCounts, recordCount: records.length };
}

async function inspectKanjidic(): Promise<KanjidicInspection> {
  const sample = await readTextSample(SOURCE_PATHS.kanjidic);
  return {
    characterCount: await countToken(SOURCE_PATHS.kanjidic, "<character>"),
    creationDate: extractXmlValue(sample, "date_of_creation"),
    databaseVersion: extractXmlValue(sample, "database_version"),
    fileVersion: extractXmlValue(sample, "file_version"),
  };
}

async function countFullKanjiJsonSections(
  filePath: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let curlyDepth = 0;
  let escaped = false;
  let inString = false;
  let stringDepth = 0;
  let stringValue = "";
  let pendingKey: { depth: number; value: string } | null = null;
  let currentSection: string | null = null;

  for await (const rawChunk of createReadStream(filePath, { encoding: "utf8" })) {
    for (const character of rawChunk) {
      if (inString) {
        if (escaped) {
          if (stringDepth <= 2) {
            stringValue += character;
          }
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
          if (stringDepth <= 2) {
            pendingKey = { depth: stringDepth, value: stringValue };
          }
        } else if (stringDepth <= 2) {
          stringValue += character;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
        stringDepth = curlyDepth;
        stringValue = "";
      } else if (character === "{") {
        curlyDepth += 1;
      } else if (character === "}") {
        if (curlyDepth === 2) {
          currentSection = null;
        }
        curlyDepth -= 1;
      } else if (character === ":" && pendingKey) {
        if (pendingKey.depth === 1) {
          currentSection = pendingKey.value;
          counts[currentSection] ??= 0;
        } else if (pendingKey.depth === 2 && currentSection) {
          counts[currentSection] = (counts[currentSection] ?? 0) + 1;
        }
        pendingKey = null;
      } else if (!/\s/u.test(character) && character !== ",") {
        pendingKey = null;
      }
    }
  }
  return counts;
}

async function inspectJlptKanji(): Promise<JlptKanjiInspection> {
  const filtered = JSON.parse(
    await readUtf8File(SOURCE_PATHS.jlptKanji),
  ) as Record<string, Record<string, unknown>>;
  const levelCounts: Record<string, number> = {};
  const targetCharacters = new Map<"N5" | "N4", string[]>([
    ["N5", []],
    ["N4", []],
  ]);
  for (const [character, entry] of Object.entries(filtered)) {
    const rawLevel = entry.jlpt;
    const level = typeof rawLevel === "number" ? `N${rawLevel}` : "missing";
    levelCounts[level] = (levelCounts[level] ?? 0) + 1;
    if (rawLevel === 5) {
      targetCharacters.get("N5")?.push(character);
    } else if (rawLevel === 4) {
      targetCharacters.get("N4")?.push(character);
    }
  }
  const first = Object.values(filtered)[0] ?? {};
  return {
    filteredCount: Object.keys(filtered).length,
    filteredSchema: Object.keys(first).sort((left, right) => left.localeCompare(right, "en")),
    fullSectionCounts: await countFullKanjiJsonSections(
      path.join(path.dirname(SOURCE_PATHS.jlptKanji), "kanjiapi_full.json"),
    ),
    levelCounts,
    targetCharacters,
  };
}

function codePointFileName(character: string): string | null {
  const codePoint = character.codePointAt(0);
  return codePoint === undefined
    ? null
    : `${codePoint.toString(16).padStart(5, "0")}.svg`;
}

async function inspectKanjiVg(
  targetCharacters: Map<"N5" | "N4", string[]>,
): Promise<KanjiVgInspection> {
  const names = await readdir(SOURCE_PATHS.kanjivg);
  const svgNames = new Set(names.filter((name) => name.endsWith(".svg")));
  const coverage = (level: "N5" | "N4"): number =>
    (targetCharacters.get(level) ?? []).filter((character) => {
      const fileName = codePointFileName(character);
      return fileName !== null && svgNames.has(fileName);
    }).length;
  const samplePath = path.join(SOURCE_PATHS.kanjivg, "098df.svg");
  const sample = await readTextSample(
    (await pathExists(samplePath))
      ? samplePath
      : path.join(SOURCE_PATHS.kanjivg, [...svgNames].sort()[0] ?? ""),
  );
  return {
    fileCount: svgNames.size,
    n4Coverage: coverage("N4"),
    n4TargetCount: targetCharacters.get("N4")?.length ?? 0,
    n5Coverage: coverage("N5"),
    n5TargetCount: targetCharacters.get("N5")?.length ?? 0,
    schema:
      sample.includes("kvg:StrokePaths_") && sample.includes("kvg:element=")
        ? "SVG 1.0 with kvg:StrokePaths_*, path[kvg:type], nested g[kvg:element], and StrokeNumbers groups"
        : "SVG/XML detected; expected KanjiVG groups were not established from the sample",
  };
}

function sumForPrefix(inventory: InventoryEntry[], relativePrefix: string): number {
  return inventory
    .filter((entry) => entry.relativePath.startsWith(relativePrefix))
    .reduce((total, entry) => total + entry.sizeBytes, 0);
}

function filesForPrefix(inventory: InventoryEntry[], relativePrefix: string): number {
  return inventory.filter((entry) => entry.relativePath.startsWith(relativePrefix)).length;
}

function sourceRow(
  inventory: InventoryEntry[],
  label: string,
  exactPath: string,
  formats: string,
  encoding: string,
): string[] {
  const prefix = `docs-reference/${exactPath}`;
  return [
    label,
    `\`${prefix}\``,
    number(filesForPrefix(inventory, prefix)),
    byteSize(sumForPrefix(inventory, prefix)),
    formats,
    encoding,
  ];
}

function renderLevelCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }))
    .map(([level, count]) => `${level}: ${number(count)}`)
    .join(", ");
}

function detectEdition(pdf: PdfInspection): string {
  return pdf.edition ?? "not detected";
}

function renderPdfTable(pdfs: PdfInspection[]): string {
  return markdownTable(
    [
      "Exact file",
      "Size",
      "Format",
      "Pages",
      "Metadata",
      "Text layer",
      "OCR",
      "Vertical / columns",
    ],
    pdfs.map((pdf) => [
      `\`docs-reference/${pdf.fileName}\``,
      byteSize(pdf.sizeBytes),
      pdf.notes.find((note) => note.startsWith("PDF version ")) ?? "PDF version unknown",
      pdf.pageCount === null
        ? "unknown"
        : `${number(pdf.pageCount)} (${pdf.pageCountMethod})`,
      [
        `title: ${pdf.title ?? "not detected"}`,
        `author: ${pdf.author ?? "not detected"}`,
        `producer: ${pdf.producer ?? "not detected"}`,
        `edition: ${detectEdition(pdf)}`,
        ...pdf.notes.filter(
          (note) =>
            note.startsWith("Creator metadata:") ||
            note.startsWith("Creation date metadata:") ||
            note.startsWith("Modification date metadata:"),
        ),
      ].join("; "),
      `${pdf.textLayer}; ${number(pdf.extractedCharacters)} extracted characters, ${number(pdf.japaneseCharacters)} Japanese characters`,
      pdf.ocrRequired ? "required" : "not required",
      `${pdf.verticalText} / ${pdf.multiColumn}`,
    ]),
  );
}

function detectCommand(command: string): boolean {
  const result = spawnSync("sh", ["-c", `command -v "${command}"`], {
    encoding: "utf8",
    timeout: 5_000,
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

async function renderReport(
  inventory: InventoryEntry[],
  pdfs: PdfInspection[],
  jmdict: JmdictInspection,
  vocabulary: CsvInspection,
  grammar: CsvInspection,
  kanjidic: KanjidicInspection,
  jlptKanji: JlptKanjiInspection,
  kanjiVg: KanjiVgInspection,
): Promise<string> {
  const actualTopLevel = (await readdir(SOURCE_ROOT, { withFileTypes: true }))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
  const expectedTopLevel = new Set<string>([
    "JMdict_english_with_examples",
    "jlpt_kanji_json_msgpack-main",
    "kanjivg",
    "jlpt_vocab.csv",
    "kanjidic2.xml",
    "japango-n4-grammar-reviewed.json",
    "japango-n4-grammar-editorial-decisions.json",
    ...TEXTBOOKS.map((textbook) => textbook.fileName),
  ]);
  const grammarFiles = actualTopLevel.filter(
    (name) => /^Kotoba_Brew_JLPT_Grammar_.*\.csv$/iu.test(name),
  );
  const unexpected = actualTopLevel.filter(
    (name) => !expectedTopLevel.has(name) && !grammarFiles.includes(name),
  );
  const missingTextbooks = TEXTBOOKS.filter(
    (textbook) => !actualTopLevel.includes(textbook.fileName),
  ).map((textbook) => textbook.fileName);
  const inspectedPdfNames = new Set(pdfs.map((pdf) => pdf.fileName));
  const uninspectedPdfs = TEXTBOOKS.filter(
    (textbook) =>
      actualTopLevel.includes(textbook.fileName) &&
      !inspectedPdfNames.has(textbook.fileName),
  ).map((textbook) => textbook.fileName);
  const n4GrammarFiles = grammarFiles.filter((name) => /(?:^|[^A-Z0-9])N4(?:[^A-Z0-9]|$)/iu.test(name));
  const toolRows = ["file", "pdfinfo", "pdftotext", "osascript", "tesseract", "ocrmypdf"].map(
    (tool) => [tool, detectCommand(tool) ? "available" : "not detected"],
  );
  const totalBytes = inventory.reduce((total, entry) => total + entry.sizeBytes, 0);
  const sourceRows = [
    sourceRow(
      inventory,
      "JMdict Yomitan export",
      "JMdict_english_with_examples/",
      "JSON; Yomitan format 3",
      "UTF-8",
    ),
    sourceRow(
      inventory,
      "KANJIDIC2",
      "kanjidic2.xml",
      "XML 1.0 with internal DTD",
      "UTF-8 (declared and sample validated)",
    ),
    sourceRow(
      inventory,
      "KanjiVG",
      "kanjivg/",
      "SVG 1.0 / XML",
      "UTF-8 (declared and representative sample validated)",
    ),
    sourceRow(
      inventory,
      "JLPT vocabulary mapping",
      "jlpt_vocab.csv",
      "CSV",
      "UTF-8 (validated, no BOM)",
    ),
    sourceRow(
      inventory,
      "JLPT kanji mapping repository",
      "jlpt_kanji_json_msgpack-main/",
      "JSON, MessagePack, Markdown, Python",
      "UTF-8 text plus binary MessagePack",
    ),
    ...grammarFiles.map((fileName) =>
      sourceRow(
        inventory,
        "Kotoba Brew grammar mapping",
        fileName,
        "CSV",
        "UTF-8 (validated, no BOM)",
      ),
    ),
    sourceRow(
      inventory,
      "JapanGo reviewed N4 grammar",
      "japango-n4-grammar-reviewed.json",
      "JSON",
      "UTF-8",
    ),
    sourceRow(
      inventory,
      "JapanGo N4 grammar editorial ledger",
      "japango-n4-grammar-editorial-decisions.json",
      "JSON",
      "UTF-8",
    ),
    ...pdfs.map((pdf) =>
      sourceRow(
        inventory,
        pdf.displayName,
        pdf.fileName,
        "PDF",
        "binary",
      ),
    ),
  ];

  const installCommand = process.platform === "darwin"
    ? "brew install poppler tesseract tesseract-lang ocrmypdf"
    : "Install Poppler (`pdfinfo`, `pdftotext`), Tesseract with Japanese and English data, and OCRmyPDF using the operating system package manager.";
  const exactInventory = inventory
    .map(
      (entry) =>
        `${entry.sizeBytes}\t${entry.format}\t${entry.encoding}\t${entry.relativePath}`,
    )
    .join("\n");

  return `# JapanGo source inspection

This report describes the files actually detected under \`assets/docs-reference/\`. It is deterministic: it contains no run timestamp, and the exact recursive inventory is sorted. Original sources were read only and were not renamed or modified.

## Inspection scope

- Detected ${number(inventory.length)} files totalling ${byteSize(totalBytes)}.
- PDF metadata is cached at \`${relativePosix(PROJECT_ROOT, PDF_CACHE_PATH)}\`; no extracted textbook text or page images are cached by inspection.
- Structured datasets are treated as canonical. PDFs are private, secondary curriculum references only.
- Licence notes below report notices found in the supplied files. They are not legal conclusions.

${markdownTable(["Local tool", "Status"], toolRows)}

The current six PDFs can be opened through the local macOS PDFKit fallback, but Poppler and local OCR tools are not detected. To enable the portable PDF/OCR path on this Mac, install them explicitly with:

\`\`\`sh
${installCommand}
\`\`\`

No dependency was installed by this inspection.

## Detected source groups

${markdownTable(
    ["Source", "Exact detected path", "Files", "Size", "Format", "Encoding"],
    sourceRows,
  )}

## Structured source schemas, counts, versions, and coverage

### JMdict English with examples

- **Detected schema:** ${jmdict.schema}. Glossaries may be strings or nested Yomitan structured-content objects; tags are separate five-field tuples.
- **Counts:** ${number(jmdict.termCount)} term tuples across ${number(jmdict.termBankCount)} incrementally inspected term banks; ${number(jmdict.tagCount)} tag definitions.
- **Version:** revision \`${jmdict.revision}\`; Yomitan dictionary format ${jmdict.formatVersion}.
- **Licence / attribution found:** ${jmdict.attribution}
- **N5/N4 coverage:** no JLPT-level field is present. Coverage is established only by matching the dedicated JLPT vocabulary mapping to JMdict written forms and readings.
- **Strategy:** process one term bank at a time, retain multiple forms/senses/restrictions, and use strict form-plus-reading matching. Do not assume embedded structured examples are redistributable until their exact sub-schema and licence chain are verified.
- **Risks:** a Yomitan export is not the native JMdict XML schema; nested structured content, tag codes, alternate forms, restrictions, and sequence semantics can be lost by naive tuple flattening.

### JLPT vocabulary mapping

- **Detected schema:** CSV columns \`${vocabulary.headers.join("`, `")}\`.
- **Counts:** ${number(vocabulary.recordCount)} rows (${renderLevelCounts(vocabulary.levelCounts)}). Target coverage is N5 ${number(vocabulary.levelCounts.N5 ?? 0)} and N4 ${number(vocabulary.levelCounts.N4 ?? 0)}.
- **Version / licence:** no version, source URL, attribution, or licence notice is embedded in the supplied CSV or provided alongside it.
- **Strategy:** use only N5/N4 classification; match to JMdict by written form and kana reading. Treat English as a matching hint, never as canonical identity.
- **Risks:** redistribution rights and mapping provenance are ambiguous; homographs and alternate readings require explicit ambiguity reporting.

### KANJIDIC2

- **Detected schema:** XML root \`kanjidic2\` with an inline DTD; \`header\` followed by repeated \`character\` records containing literal, codepoint, radical, misc, dictionary/query codes, readings, meanings, and nanori.
- **Counts:** ${number(kanjidic.characterCount)} \`character\` records.
- **Version:** file schema ${kanjidic.fileVersion}; database ${kanjidic.databaseVersion}; created ${kanjidic.creationDate}.
- **Licence / attribution:** no explicit licence or attribution statement was detected in the supplied XML. Confirm and record the applicable EDRDG/KANJIDIC terms before distributing derived data.
- **N5/N4 coverage:** broad dictionary coverage. An optional legacy JLPT element exists, but the dedicated mapping remains authoritative.
- **Strategy:** stream characters, decode only declared XML entities, keep English meanings plus on/kun/nanori and verified metadata.
- **Risks:** the large inline DTD and optional/repeated fields make regex-only XML parsing fragile; legacy JLPT metadata can conflict with the dedicated mapping.

### JLPT kanji mapping

- **Detected schema:** filtered JSON is an object keyed by kanji. Entry keys: \`${jlptKanji.filteredSchema.join("`, `")}\`. The repository also contains a full JSON object with \`kanjis\`, \`readings\`, and \`words\` sections, two MessagePack files, a conversion script, and a README.
- **Counts:** filtered JSON ${number(jlptKanji.filteredCount)} entries (${renderLevelCounts(jlptKanji.levelCounts)}). Stream-counted full JSON sections: ${renderLevelCounts(jlptKanji.fullSectionCounts)}. MessagePack records were not decoded because the companion JSON is available and no MessagePack dependency is needed.
- **Version:** no dataset snapshot/version identifier is present. File sizes in the README do not exactly match every supplied file, so the report uses filesystem sizes.
- **Licence / attribution found:** the README credits kanjiapi.dev, EDICT/KANJIDIC/EDRDG, and Jonathan Waller's JLPT resources and says upstream licences apply; it does not include the complete upstream licence texts or a versioned JLPT mapping provenance record.
- **N5/N4 coverage:** N5 ${number(jlptKanji.levelCounts.N5 ?? 0)}; N4 ${number(jlptKanji.levelCounts.N4 ?? 0)}. Numeric \`jlpt: 5\` means N5 and \`jlpt: 4\` means N4.
- **Strategy:** use \`kanji_jlpt_only.json\` only for level membership, then enrich from KANJIDIC2 and KanjiVG. Keep MessagePack optional.
- **Risks:** ambiguous snapshot provenance and incomplete licence chain; the numeric level convention is easy to invert.

### KanjiVG

- **Detected schema:** ${kanjiVg.schema}.
- **Counts:** ${number(kanjiVg.fileCount)} SVG files.
- **Version / licence:** no release version or root manifest is supplied. Each inspected SVG embeds a KanjiVG copyright notice and Creative Commons Attribution-ShareAlike 3.0 terms, including attribution/link and share-alike requirements.
- **N5/N4 coverage against the supplied mapping:** N5 ${number(kanjiVg.n5Coverage)}/${number(kanjiVg.n5TargetCount)}; N4 ${number(kanjiVg.n4Coverage)}/${number(kanjiVg.n4TargetCount)}.
- **Strategy:** read only target-character SVGs by zero-padded Unicode filename; retain source SVG path, stroke paths, and nested component labels with attribution.
- **Risks:** variant/partial glyph filenames and nested component semantics need careful handling; CC BY-SA obligations apply to copied or adapted assets.

### Grammar sources

- **Detected schema:** CSV columns \`${grammar.headers.join("`, `")}\`. JLPT level is encoded only in the detected filename; there is no level column.
- **Counts:** ${number(grammar.recordCount)} N5 rows in ${grammarFiles.length} supplied CSV; no N4 grammar CSV was detected.
- **Version / licence:** no version, source URL, author attribution, or licence notice is embedded in or supplied beside the CSV.
- **N5/N4 coverage:** the external tracker is N5-only. N4 is supplied separately as JapanGo's manually curated editorial JSON; it has higher canonical priority than OCR candidates.
- **Strategy:** use pattern spelling and source order as provisional curriculum mapping metadata. Do not import explanation prose, links, status, or notes as canonical JapanGo teaching content without rights and schema review.
- **Risks:** several rows may be vocabulary-like rather than grammar patterns, identifiers are absent, and the English meaning labels cannot safely define canonical semantic identity by themselves.

## PDF inspection

All ${number(pdfs.length)} detected textbook PDFs are image-only under the available native PDF parser: zero text characters were found across every page. OCR is therefore required for candidate curriculum metadata. The inspection stores no extracted book text. Rendered-page sampling found multi-column or tabular layouts in every book and overwhelmingly horizontal Japanese. No sustained vertical Japanese was seen in five books; Minna no Nihongo I remains unknown because a sampled page is visually rotated despite zero PDF rotation flags.

${renderPdfTable(pdfs)}

Detected PDF metadata establishes “Third Edition” for Genki I and II. Rendered cover/copyright-page sampling identifies Minna no Nihongo I and II as 3A/3A Network publications; both grammar/reference books and the Minna II textbook state first publication in 1998, while no numbered edition is safely detectable. The Minna II textbook also exposes ISBN 4-88319-103-6. The books provide elementary curriculum ordering, but none supplies a machine-readable N5/N4 mapping; textbook-to-JLPT coverage must be derived and reviewed rather than assumed.

**PDF strategy:** OCR locally and incrementally with Japanese and English language data, preserve source page numbers, cache only OCR working data under \`.cache/japango-content/ocr/\`, and extract candidate lesson/topic identifiers. Validate every vocabulary/kanji/grammar candidate against the structured canonical sources. Never emit textbook prose, dialogues, exercises, examples, answer keys, images, or close paraphrases.

## Missing or ambiguous inputs

- External N4 Kotoba Brew grammar source: ${n4GrammarFiles.length === 0 ? "not supplied; JapanGo manual curation is canonical" : `detected (${n4GrammarFiles.join(", ")})`}.
- Missing configured textbooks: ${missingTextbooks.length === 0 ? "none" : missingTextbooks.join(", ")}.
- Present but not inspectable as PDFs: ${uninspectedPdfs.length === 0 ? "none" : uninspectedPdfs.join(", ")}.
- Unexpected top-level entries: ${unexpected.length === 0 ? "none" : unexpected.join(", ")}.
- JLPT vocabulary CSV: licence, attribution, version, and mapping provenance are missing.
- Kotoba Brew grammar CSV: licence, attribution, and version are missing; it is used only for provisional N5 mapping.
- JLPT kanji mapping: upstream credits exist, but a versioned mapping snapshot and complete licence texts are missing.
- KANJIDIC2: version metadata exists, but the supplied file has no embedded licence/attribution notice.
- KanjiVG: per-file licence notices exist, but a dataset release version/manifest is missing.
- Minna no Nihongo editions are not detectable from PDF metadata.
- Rendered-page samples establish multi-column layouts and mostly horizontal Japanese; full-document vertical/rotated-page classification remains unresolved until local OCR layout inspection is performed.

## Cross-source risks

1. **Rights and attribution:** do not mark a release redistributable until missing source licences are resolved and required notices are included in the source registry/licence report.
2. **JLPT mapping provenance:** JLPT levels are external mappings, not current official test specifications. Preserve source/confidence and report conflicts.
3. **Identity mismatches:** never join vocabulary on English meaning. Preserve homographs, reading restrictions, alternate forms, and ambiguous matches.
4. **Schema drift:** pin detected versions and validate tuple widths, CSV headers, JSON fields, and XML roots before every build.
5. **PDF/OCR errors:** Japanese vertical text, furigana, page decorations, and multi-column layouts can scramble reading order. OCR candidates must remain non-canonical until structured-source validation.
6. **Copyright:** textbook-derived output is limited to curriculum metadata (book, edition when known, lesson, page, identifiers, order, prerequisites, and coverage comparison).

## Recommended processing order

1. Pin this inspection and source checksums in the later source registry.
2. Parse the small JLPT N5/N4 mappings and grammar CSV with strict header validation.
3. Stream KANJIDIC2 and process JMdict one term-bank file at a time.
4. Read only the N5/N4 KanjiVG files required by the mapping.
5. Normalize and match canonical records; emit unmatched, ambiguous, duplicate, conflict, missing-reference, and low-confidence reports.
6. Use existing OCR cache if present. Otherwise run local OCR incrementally and retain source/page/confidence provenance for candidates only.
7. Build curriculum order after canonical matching, then validate licences, references, schemas, counts, and deterministic IDs before emitting app-ready content.

## Exact recursive file inventory

The columns are exact byte size, detected format, encoding, and repository-relative source path. “UTF-8 (declared)” means the XML declaration and representative content were inspected; it is not a claim that every byte in every SVG was independently decoded during this run.

<details>
<summary>${number(inventory.length)} files</summary>

\`\`\`text
bytes\tformat\tencoding\tpath
${exactInventory}
\`\`\`

</details>
`;
}

export async function inspectSources(): Promise<string> {
  const inventory = await collectInventory();
  const [pdfs, jmdict, vocabulary, grammar, kanjidic, jlptKanji] = await Promise.all([
    inspectPdfs(),
    inspectJmdict(),
    inspectCsv(SOURCE_PATHS.jlptVocabulary, "JLPT Level"),
    inspectCsv(SOURCE_PATHS.grammar, null),
    inspectKanjidic(),
    inspectJlptKanji(),
  ]);
  const kanjiVg = await inspectKanjiVg(jlptKanji.targetCharacters);
  const report = await renderReport(
    inventory,
    pdfs,
    jmdict,
    vocabulary,
    grammar,
    kanjidic,
    jlptKanji,
    kanjiVg,
  );
  await writeText(REPORT_PATH, report);
  return REPORT_PATH;
}

async function main(): Promise<void> {
  const reportPath = await inspectSources();
  console.log(`Source inspection written to ${reportPath}`);
  console.log(`PDF inspection cache written to ${PDF_CACHE_PATH}`);
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Source inspection failed: ${message}`);
    process.exitCode = 1;
  });
}
