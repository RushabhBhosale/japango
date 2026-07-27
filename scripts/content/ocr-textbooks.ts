import { spawn, spawnSync } from "node:child_process";
import { unlink } from "node:fs/promises";
import path from "node:path";

import { OCR_CACHE_ROOT, SOURCE_ROOT, TEXTBOOKS } from "./config";
import { ensureDirectory, pathExists, writeText } from "./lib/fs-utils";
import { isDirectExecution, runCli } from "./lib/cli";

interface OcrOptions {
  book: string | null;
  startPage: number;
  endPage: number | null;
  force: boolean;
  verticalPages: Set<number>;
}

function parseOptions(arguments_: string[]): OcrOptions {
  const valueAfter = (flag: string): string | null => {
    const index = arguments_.indexOf(flag);
    return index >= 0 ? arguments_[index + 1] ?? null : null;
  };
  const startPage = Number.parseInt(valueAfter("--start") ?? "1", 10);
  const endValue = valueAfter("--end");
  const verticalPages = new Set(
    (valueAfter("--vertical-pages") ?? "")
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter(Number.isFinite),
  );
  return {
    book: valueAfter("--book"),
    startPage: Number.isFinite(startPage) && startPage > 0 ? startPage : 1,
    endPage: endValue ? Number.parseInt(endValue, 10) : null,
    force: arguments_.includes("--force"),
    verticalPages,
  };
}

function hasCommand(command: string): boolean {
  return spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  }).status === 0;
}

function run(command: string, arguments_: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
      } else {
        reject(
          new Error(
            `${command} exited with ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`,
          ),
        );
      }
    });
  });
}

async function pdfPageCount(pdfPath: string): Promise<number> {
  const info = await run("pdfinfo", [pdfPath]);
  const pages = Number.parseInt(info.match(/^Pages:\s+(\d+)/mu)?.[1] ?? "", 10);
  if (!Number.isFinite(pages) || pages < 1) {
    throw new Error(`pdfinfo did not return a page count for ${pdfPath}`);
  }
  return pages;
}

function selectedBooks(bookOption: string | null): typeof TEXTBOOKS[number][] {
  if (!bookOption || bookOption === "all") {
    return [...TEXTBOOKS];
  }
  const normalized = bookOption.toLocaleLowerCase("en-US");
  const matches = TEXTBOOKS.filter(
    (book) =>
      book.fileName.toLocaleLowerCase("en-US") === normalized ||
      book.fileName.replace(/\.pdf$/u, "").toLocaleLowerCase("en-US") === normalized ||
      book.displayName.toLocaleLowerCase("en-US") === normalized,
  );
  if (matches.length === 0) {
    throw new Error(`Unknown --book value: ${bookOption}`);
  }
  return [...matches];
}

export async function ocrTextbooks(options: OcrOptions): Promise<void> {
  const missing = ["pdfinfo", "pdftoppm", "tesseract"].filter(
    (command) => !hasCommand(command),
  );
  if (missing.length > 0) {
    throw new Error(
      [
        `Missing local OCR commands: ${missing.join(", ")}.`,
        "Install the minimum toolchain on macOS with:",
        "  brew install poppler ocrmypdf tesseract-lang",
        "The source PDFs were not modified and no cloud OCR service was used.",
      ].join("\n"),
    );
  }
  const languages = await run("tesseract", ["--list-langs"]);
  if (!/^jpn$/mu.test(languages) || !/^eng$/mu.test(languages)) {
    throw new Error(
      "Tesseract Japanese and English language data are required. Install with: brew install tesseract-lang",
    );
  }

  for (const book of selectedBooks(options.book)) {
    const pdfPath = path.join(SOURCE_ROOT, book.fileName);
    const pageCount = await pdfPageCount(pdfPath);
    const endPage = Math.min(options.endPage ?? pageCount, pageCount);
    const cacheDirectory = path.join(
      OCR_CACHE_ROOT,
      book.fileName.replace(/\.pdf$/u, ""),
    );
    const pageDirectory = path.join(cacheDirectory, "pages");
    const workDirectory = path.join(cacheDirectory, "work");
    await ensureDirectory(pageDirectory);
    await ensureDirectory(workDirectory);
    for (let page = options.startPage; page <= endPage; page += 1) {
      const pageLabel = String(page).padStart(4, "0");
      const outputPath = path.join(pageDirectory, `page-${pageLabel}.txt`);
      if (!options.force && (await pathExists(outputPath))) {
        continue;
      }
      const imagePrefix = path.join(workDirectory, `page-${pageLabel}`);
      const imagePath = `${imagePrefix}.png`;
      await run("pdftoppm", [
        "-f",
        String(page),
        "-l",
        String(page),
        "-r",
        "300",
        "-png",
        "-singlefile",
        pdfPath,
        imagePrefix,
      ]);
      const vertical = options.verticalPages.has(page) && /^jpn_vert$/mu.test(languages);
      const language = vertical ? "jpn_vert+eng" : "jpn+eng";
      const text = await run("tesseract", [
        imagePath,
        "stdout",
        "-l",
        language,
        "--psm",
        vertical ? "5" : "6",
      ]);
      await writeText(outputPath, text);
      await unlink(imagePath).catch(() => undefined);
      console.log(`${book.fileName}: cached OCR page ${page}/${pageCount}`);
    }
    await writeText(
      path.join(cacheDirectory, "README.txt"),
      [
        `Source: ${book.fileName}`,
        `Pages: ${pageCount}`,
        "OCR languages: jpn+eng (jpn_vert+eng only for explicitly selected pages)",
        "This cache is private, ignored by Git, and must not be redistributed.",
      ].join("\n"),
    );
  }
}

if (isDirectExecution(import.meta.url)) {
  runCli(() => ocrTextbooks(parseOptions(process.argv.slice(2))));
}

