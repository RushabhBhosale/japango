import { spawnSync } from "node:child_process";
import { access, open, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { CACHE_ROOT, SOURCE_ROOT, TEXTBOOKS } from "./config";
import { pathExists, writeJson } from "./lib/fs-utils";
import type { PdfInspection } from "./types";

const PDF_INSPECTION_CACHE = path.join(
  CACHE_ROOT,
  "inspection",
  "pdfs.json",
);

const JAPANESE_CHARACTER = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff]/gu;
const TEXT_LAYER_CHARACTER_THRESHOLD_PER_PAGE = 20;

const VISUALLY_VERIFIED_LAYOUT: Readonly<
  Record<
    string,
    {
      verticalText: PdfInspection["verticalText"];
      multiColumn: PdfInspection["multiColumn"];
      note: string;
    }
  >
> = {
  "genki-1.pdf": {
    verticalText: "not-detected",
    multiColumn: "detected",
    note: "Rendered-page sampling found horizontal Japanese with bilingual tables and aligned columns; no sustained vertical Japanese was seen.",
  },
  "genki-2.pdf": {
    verticalText: "not-detected",
    multiColumn: "detected",
    note: "Rendered-page sampling found horizontal Japanese and multi-column glossary/index layouts; no sustained vertical Japanese was seen.",
  },
  "minna-no-nihongo-1-grammer.pdf": {
    verticalText: "not-detected",
    multiColumn: "detected",
    note: "Rendered-page sampling found horizontal bilingual text with side-by-side examples and tables; no sustained vertical Japanese was seen.",
  },
  "minna-no-nihongo-1-textbook.pdf": {
    verticalText: "unknown",
    multiColumn: "detected",
    note: "Rendered-page sampling found two-column indexes and a visually rotated page despite zero PDF rotation flags; vertical-page handling requires OCR review.",
  },
  "minna-no-nihongo-2-grammer.pdf": {
    verticalText: "not-detected",
    multiColumn: "detected",
    note: "Rendered-page sampling found horizontal bilingual/grid layouts; no sustained vertical Japanese was seen.",
  },
  "minna-no-nihongo-2-textbook.pdf": {
    verticalText: "not-detected",
    multiColumn: "detected",
    note: "Rendered-page sampling found horizontal text with boxed and tabular multi-column layouts; no sustained vertical Japanese was seen.",
  },
};

interface PdfToolAvailability {
  file: boolean;
  osascript: boolean;
  pdfinfo: boolean;
  pdftotext: boolean;
  tesseract: boolean;
  ocrmypdf: boolean;
}

interface PdfInfoResult {
  author: string | null;
  creationDate: string | null;
  creator: string | null;
  modificationDate: string | null;
  pageCount: number | null;
  pdfVersion: string | null;
  producer: string | null;
  title: string | null;
}

interface NativePdfResult {
  attributes: Record<string, unknown>;
  characters: number;
  japaneseCharacters: number;
  pageCount: number;
  pagesWithText: number;
}

interface ExtractedTextResult {
  characters: number;
  japaneseCharacters: number;
}

function executableCandidates(command: string): string[] {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT")
        .split(";")
        .filter(Boolean)
    : [""];
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((directory) =>
      extensions.map((extension) => path.join(directory, `${command}${extension}`)),
    );
}

async function commandExists(command: string): Promise<boolean> {
  for (const candidate of executableCandidates(command)) {
    try {
      await access(candidate);
      return true;
    } catch {
      // Continue searching PATH.
    }
  }
  return false;
}

async function detectTools(): Promise<PdfToolAvailability> {
  const commands = [
    "file",
    "osascript",
    "pdfinfo",
    "pdftotext",
    "tesseract",
    "ocrmypdf",
  ] as const;
  const available = await Promise.all(commands.map(commandExists));
  return Object.fromEntries(
    commands.map((command, index) => [command, available[index]]),
  ) as unknown as PdfToolAvailability;
}

function nullable(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/u.test(value.trim())) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : null;
}

function runPdfInfo(filePath: string): PdfInfoResult | null {
  const result = spawnSync("pdfinfo", [filePath], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    timeout: 30_000,
  });
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  const fields = new Map<string, string>();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  return {
    author: nullable(fields.get("Author")),
    creationDate: nullable(fields.get("CreationDate")),
    creator: nullable(fields.get("Creator")),
    modificationDate: nullable(fields.get("ModDate")),
    pageCount: parsePositiveInteger(fields.get("Pages")),
    pdfVersion: nullable(fields.get("PDF version")),
    producer: nullable(fields.get("Producer")),
    title: nullable(fields.get("Title")),
  };
}

function runFileInspection(filePath: string): {
  pageCount: number | null;
  pdfVersion: string | null;
} | null {
  const result = spawnSync("file", ["-b", filePath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
  if (result.status !== 0 || !result.stdout.includes("PDF document")) {
    return null;
  }
  return {
    pageCount: parsePositiveInteger(
      result.stdout.match(/,\s*(\d+)\s+pages?\b/iu)?.[1],
    ),
    pdfVersion: nullable(
      result.stdout.match(/PDF document,\s*version\s+([^,\s]+)/iu)?.[1],
    ),
  };
}

const PDFKIT_JXA = String.raw`
ObjC.import("Foundation");
ObjC.import("PDFKit");

function run(argv) {
  var filePath = argv[0];
  var document = $.PDFDocument.alloc.initWithURL(
    $.NSURL.fileURLWithPath(filePath)
  );
  if (!document) {
    return JSON.stringify({ error: "PDFKit could not open the document" });
  }

  var characters = 0;
  var japaneseCharacters = 0;
  var pagesWithText = 0;
  for (var pageIndex = 0; pageIndex < document.pageCount; pageIndex += 1) {
    var pageText = document.pageAtIndex(pageIndex).string;
    var length = 0;
    try {
      length = Number(pageText.length);
    } catch (_error) {
      length = 0;
    }
    if (!isFinite(length) || length <= 0) {
      continue;
    }
    pagesWithText += 1;
    characters += length;
    try {
      var unwrapped = ObjC.unwrap(pageText) || "";
      var matches = unwrapped.match(/[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff]/g);
      japaneseCharacters += matches ? matches.length : 0;
    } catch (_error) {
      // Character totals still establish that a text layer exists.
    }
  }

  return JSON.stringify({
    attributes: ObjC.deepUnwrap(document.documentAttributes) || {},
    characters: characters,
    japaneseCharacters: japaneseCharacters,
    pageCount: Number(document.pageCount),
    pagesWithText: pagesWithText
  });
}
`;

function runMacOsPdfKit(filePath: string): NativePdfResult | null {
  if (process.platform !== "darwin") {
    return null;
  }
  const result = spawnSync(
    "osascript",
    ["-l", "JavaScript", "-e", PDFKIT_JXA, filePath],
    {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    if (
      "error" in parsed ||
      typeof parsed.pageCount !== "number" ||
      !Number.isInteger(parsed.pageCount) ||
      parsed.pageCount <= 0
    ) {
      return null;
    }
    return {
      attributes:
        typeof parsed.attributes === "object" && parsed.attributes !== null
          ? (parsed.attributes as Record<string, unknown>)
          : {},
      characters:
        typeof parsed.characters === "number" ? parsed.characters : 0,
      japaneseCharacters:
        typeof parsed.japaneseCharacters === "number"
          ? parsed.japaneseCharacters
          : 0,
      pageCount: parsed.pageCount,
      pagesWithText:
        typeof parsed.pagesWithText === "number" ? parsed.pagesWithText : 0,
    };
  } catch {
    return null;
  }
}

function runPdfToText(filePath: string): ExtractedTextResult | null {
  const result = spawnSync(
    "pdftotext",
    ["-enc", "UTF-8", "-nopgbrk", filePath, "-"],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    },
  );
  if (result.status !== 0) {
    return null;
  }
  const normalized = result.stdout.replace(/\s/gu, "");
  return {
    characters: [...normalized].length,
    japaneseCharacters: normalized.match(JAPANESE_CHARACTER)?.length ?? 0,
  };
}

async function inspectPdfHeader(filePath: string): Promise<boolean> {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return header.subarray(0, bytesRead).toString("ascii").startsWith("%PDF-");
  } finally {
    await handle.close();
  }
}

function detectEdition(title: string | null): string | null {
  if (!title) {
    return null;
  }
  const edition = title.match(
    /\b(first|second|third|fourth|fifth|\d+(?:st|nd|rd|th))\s+edition\b/iu,
  )?.[0];
  if (!edition) {
    return null;
  }
  return edition.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function classifyTextLayer(
  characters: number,
  pageCount: number | null,
): PdfInspection["textLayer"] {
  if (characters === 0) {
    return "unavailable";
  }
  if (
    pageCount !== null &&
    characters < pageCount * TEXT_LAYER_CHARACTER_THRESHOLD_PER_PAGE
  ) {
    return "sparse";
  }
  return "usable";
}

function metadataValue(
  attributes: Record<string, unknown> | undefined,
  key: string,
): string | null {
  return nullable(attributes?.[key]);
}

async function inspectOnePdf(
  fileName: string,
  displayName: string,
  tools: PdfToolAvailability,
): Promise<PdfInspection | null> {
  const filePath = path.join(SOURCE_ROOT, fileName);
  if (!(await pathExists(filePath))) {
    return null;
  }
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    return null;
  }
  if (!(await inspectPdfHeader(filePath))) {
    throw new Error(`${fileName} does not have a valid PDF header.`);
  }

  const pdfInfo = tools.pdfinfo ? runPdfInfo(filePath) : null;
  const fileInfo = tools.file ? runFileInspection(filePath) : null;
  const nativeInfo = tools.osascript ? runMacOsPdfKit(filePath) : null;
  const extractedText = tools.pdftotext ? runPdfToText(filePath) : null;

  const pageCount = pdfInfo?.pageCount ?? nativeInfo?.pageCount ?? fileInfo?.pageCount ?? null;
  const pageCountMethod: PdfInspection["pageCountMethod"] = pdfInfo?.pageCount
    ? "pdfinfo"
    : nativeInfo?.pageCount || fileInfo?.pageCount
      ? "pdf-structure"
      : "unknown";
  const extractedCharacters =
    extractedText?.characters ?? nativeInfo?.characters ?? 0;
  const japaneseCharacters =
    extractedText?.japaneseCharacters ?? nativeInfo?.japaneseCharacters ?? 0;
  const textInspectionWasAvailable = extractedText !== null || nativeInfo !== null;
  const textLayer = textInspectionWasAvailable
    ? classifyTextLayer(extractedCharacters, pageCount)
    : "unknown";
  const title =
    pdfInfo?.title ?? metadataValue(nativeInfo?.attributes, "Title");
  const creator =
    pdfInfo?.creator ?? metadataValue(nativeInfo?.attributes, "Creator");
  const creationDate =
    pdfInfo?.creationDate ?? metadataValue(nativeInfo?.attributes, "CreationDate");
  const modificationDate =
    pdfInfo?.modificationDate ?? metadataValue(nativeInfo?.attributes, "ModDate");
  const pdfVersion = pdfInfo?.pdfVersion ?? fileInfo?.pdfVersion;
  const notes: string[] = [];
  const visualLayout = VISUALLY_VERIFIED_LAYOUT[fileName];

  if (pdfVersion) {
    notes.push(`PDF version ${pdfVersion}.`);
  }
  if (creator) {
    notes.push(`Creator metadata: ${creator}.`);
  }
  if (creationDate) {
    notes.push(`Creation date metadata: ${creationDate}.`);
  }
  if (modificationDate) {
    notes.push(`Modification date metadata: ${modificationDate}.`);
  }
  if (nativeInfo && nativeInfo.pagesWithText === 0) {
    notes.push(
      `macOS PDFKit found no text on any of ${nativeInfo.pageCount.toLocaleString("en-US")} pages.`,
    );
  }
  if (!textInspectionWasAvailable) {
    notes.push(
      "Neither pdftotext nor the macOS PDFKit fallback was available; text-layer status is unverified.",
    );
  }
  if (!tools.ocrmypdf || !tools.tesseract) {
    const missing = [
      !tools.ocrmypdf ? "ocrmypdf" : null,
      !tools.tesseract ? "tesseract" : null,
    ].filter((tool): tool is string => tool !== null);
    notes.push(`Local OCR tools not detected: ${missing.join(", ")}.`);
  }
  notes.push(
    visualLayout?.note ??
      "Vertical text and multi-column layout were not manually verified; OCR layout data is unavailable.",
  );

  return {
    fileName,
    displayName,
    sizeBytes: fileStat.size,
    format: "PDF",
    pageCount,
    pageCountMethod,
    title,
    author:
      pdfInfo?.author ?? metadataValue(nativeInfo?.attributes, "Author"),
    producer:
      pdfInfo?.producer ?? metadataValue(nativeInfo?.attributes, "Producer"),
    edition: detectEdition(title),
    textLayer,
    extractedCharacters,
    japaneseCharacters,
    ocrRequired: textLayer !== "usable",
    verticalText: visualLayout?.verticalText ?? "unknown",
    multiColumn: visualLayout?.multiColumn ?? "unknown",
    notes,
  };
}

export async function inspectPdfs(): Promise<PdfInspection[]> {
  const tools = await detectTools();
  const inspections: PdfInspection[] = [];
  for (const textbook of TEXTBOOKS) {
    const inspection = await inspectOnePdf(
      textbook.fileName,
      textbook.displayName,
      tools,
    );
    if (inspection) {
      inspections.push(inspection);
    }
  }
  await writeJson(PDF_INSPECTION_CACHE, inspections);
  return inspections;
}

async function main(): Promise<void> {
  const inspections = await inspectPdfs();
  console.log(`Inspected ${inspections.length} textbook PDF(s).`);
  for (const inspection of inspections) {
    const pages = inspection.pageCount?.toLocaleString("en-US") ?? "unknown";
    console.log(
      `- ${inspection.fileName}: ${pages} pages; text layer ${inspection.textLayer}; OCR ${inspection.ocrRequired ? "required" : "not required"}`,
    );
  }
  console.log(`Cached PDF metadata at ${PDF_INSPECTION_CACHE}`);
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entryPoint === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`PDF inspection failed: ${message}`);
    process.exitCode = 1;
  });
}
