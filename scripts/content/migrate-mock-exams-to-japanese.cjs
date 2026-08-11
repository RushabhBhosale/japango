/*
 * Produces an immutable Japanese presentation layer for the authored mock
 * corpus. IDs, placement, answer keys and source English explanations remain
 * in the source corpus; only the text shown while taking an exam is written
 * here. This is deliberately a content-build step, never a mobile runtime
 * network request.
 *
 * Run with: node scripts/content/migrate-mock-exams-to-japanese.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sourcePath = path.join(root, 'assets/generated-content/learning-content/index.json');
const snapshotPath = path.join(root, 'assets/generated-content/assessments/bundled-mock-exams-all.json');
const outputPath = path.join(root, 'assets/mobile-curriculum/mock-exams-ja.json');
const endpoint = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const isEnglish = (value) => /[A-Za-z]/.test(value);
const marker = (index) => `<<<JAPANGO_MOCK_${index}>>>`;
const shortEnglishGlosses = new Map([['in', '中'], ['no', 'いいえ'], ['I', '私'], ['so', 'だから']]);

function removeTranslationResidue(value) {
  // The endpoint occasionally appends an English source gloss after an em dash
  // even though its Japanese translation is complete. It is never valid in an
  // exam-facing choice, so discard that residue before the strict audit.
  return value.replace(/(?:\s*[—–-]?\s*)?[A-Za-z][A-Za-z0-9 ,.'’()/:;-]*/g, '').replace(/\s{2,}/g, ' ').trim();
}

function normalizeJapanesePresentation(value) {
  return shortEnglishGlosses.get(value) ?? removeTranslationResidue(value);
}

function japaneseQuotedText(value) {
  return [...value.matchAll(/[「“]([^」”]+)[」”]/g)].map((match) => match[1]).find((part) => /[\u3040-\u30ff\u3400-\u9fff]/.test(part));
}

function kanjiFromQuestionId(id) {
  const value = id.match(/^question-kanji-u([0-9a-f]+)-/i)?.[1];
  return value ? String.fromCodePoint(Number.parseInt(value, 16)) : undefined;
}

// Source prompts were written in English. Build the Japanese instruction from
// the original item's domain and type instead of translating a pedagogical
// instruction word-for-word. This keeps it short, natural, and JLPT-like.
function japanesePrompt(question) {
  const quoted = japaneseQuotedText(question.prompt.text);
  if (question.domain === 'vocabulary') {
    if (question.id.includes('-reading-')) return `「${quoted ?? 'この ことば'}」は どう 読みますか。`;
    if (question.id.includes('-meaning-')) return `「${quoted ?? 'この ことば'}」の 意味として いちばん 近い ものは どれですか。`;
    if (question.id.includes('-written-form-')) return `つぎの ことばの 表記として いちばん いい ものは どれですか。`;
    return `「${quoted ?? 'この ことば'}」について、いちばん いい ものを 一つ えらんでください。`;
  }
  if (question.domain === 'kanji') {
    const kanji = kanjiFromQuestionId(question.id) ?? quoted ?? 'この 漢字';
    if (question.id.includes('-reading-')) return `「${quoted ?? kanji}」は どう 読みますか。`;
    if (question.id.includes('-word-distinction-') || question.id.includes('-vocabulary-context-')) return `「${kanji}」を 使う ことばとして いちばん いい ものは どれですか。`;
    return `「${kanji}」の 意味として いちばん 近い ものは どれですか。`;
  }
  if (question.domain === 'grammar') {
    if (question.presentation === 'fill-blank' || question.id.includes('-usage-')) return `（　）に 入る いちばん いい ものを 一つ えらんでください。`;
    if (question.id.includes('-meaning-')) return `「${quoted ?? 'この 表現'}」の 意味として いちばん 近い ものは どれですか。`;
    return `「${quoted ?? 'この 表現'}」を 使っている 文は どれですか。`;
  }
  if (question.domain === 'reading') return '文章を 読んで、しつもんに こたえてください。';
  return '話を 聞いて、しつもんに こたえてください。';
}

function collectStrings() {
  const content = read(sourcePath);
  const snapshots = read(snapshotPath);
  const selected = new Set(snapshots.flatMap((exam) => exam.questionPlacements.map((placement) => placement.questionId)));
  const values = [];
  const direct = new Map();
  for (const question of content.questions) {
    if (!selected.has(question.id)) continue;
    if (question.domain === 'reading' || question.domain === 'listening') {
      values.push({ key: `question:${question.id}`, text: question.prompt.text });
    } else {
      direct.set(`question:${question.id}`, normalizeJapanesePresentation(japanesePrompt(question)).replace(/\s*\+\s*/g, ''));
    }
  }
  for (const option of content.questionOptions) {
    if (selected.has(option.questionId) && option.content.type === 'text' && isEnglish(option.content.text)) values.push({ key: `choice:${option.id}`, text: option.content.text });
  }
  return { values, direct };
}

function batches(values) {
  const result = [];
  let current = [];
  let length = 0;
  for (const value of values) {
    // The public endpoint handles a little under 5k characters reliably.
    const nextLength = value.text.length + marker(current.length).length + 2;
    if (current.length && length + nextLength > 3200) {
      result.push(current);
      current = [];
      length = 0;
    }
    current.push(value);
    length += nextLength;
  }
  if (current.length) result.push(current);
  return result;
}

async function translateBatch(values) {
  const body = values.map((value, index) => `${value.text}\n${marker(index)}`).join('\n');
  const response = await fetch(`${endpoint}${encodeURIComponent(body)}`);
  if (!response.ok) throw new Error(`Translation request failed: ${response.status}`);
  const payload = await response.json();
  const translated = payload?.[0]?.map((segment) => segment?.[0] ?? '').join('');
  const parts = translated.split(/<<<JAPANGO_MOCK_(\d+)>>>/);
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const markerIndex = parts.findIndex((part, partIndex) => partIndex % 2 === 1 && Number(part) === index);
    if (markerIndex < 1) throw new Error(`Translation marker ${index} was not preserved.`);
    const value = normalizeJapanesePresentation(parts[markerIndex - 1].replace(/^\s+|\s+$/g, ''));
    if (!value || isEnglish(value)) throw new Error(`Japanese translation is invalid for ${values[index].key}: ${JSON.stringify(value)}`);
    result.set(values[index].key, value);
  }
  return result;
}

async function run() {
  const { values, direct } = collectStrings();
  const existing = fs.existsSync(outputPath) ? read(outputPath).strings : {};
  const translated = new Map(values.filter(({ key }) => typeof existing[key] === 'string' && !key.startsWith('question:')).map(({ key }) => [key, normalizeJapanesePresentation(existing[key])]));
  const pending = values.filter(({ key }) => !translated.has(key));
  const groups = batches(pending);
  const writeCheckpoint = () => {
    const strings = new Map([...direct, ...translated]);
    fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, source: 'editorial-ja-presentation-v1', strings: Object.fromEntries(strings) })}\n`);
  };
  console.log(`Translating ${pending.length} remaining mock-exam strings in ${groups.length} batches.`);
  for (let index = 0; index < groups.length; index += 1) {
    const result = await translateBatch(groups[index]);
    for (const [key, value] of result) translated.set(key, value);
    writeCheckpoint();
    console.log(`Completed ${index + 1}/${groups.length}`);
  }
  if (translated.size !== values.length) throw new Error('Mock-exam Japanese migration is incomplete.');
  writeCheckpoint();
  console.log(`Wrote ${direct.size + translated.size} Japanese presentation strings to ${path.relative(root, outputPath)}.`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
