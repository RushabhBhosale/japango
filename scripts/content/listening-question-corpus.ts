import {
  learningContentCollectionsSchema,
  listeningActivitySchema,
  listeningSpeakerSchema,
  type LearningContentCollections,
  type ListeningActivity,
} from "../../src/features/learning-content/schemas";
import { SOURCE_PATHS } from "./config";
import { readJson } from "./lib/fs-utils";
import type { CurriculumUnit, GrammarRecord, KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";

interface ListeningQuestionFile { schemaVersion: 1; questions: LearningContentCollections["questions"]; questionOptions: LearningContentCollections["questionOptions"]; learningItemMetadata: LearningContentCollections["learningItemMetadata"]; questionTargetRelationships: LearningContentCollections["questionTargetRelationships"] }
export interface ListeningCatalog { grammar: readonly GrammarRecord[]; vocabulary: readonly VocabularyRecord[]; kanji: readonly KanjiRecord[]; curriculumUnits: readonly CurriculumUnit[] }
function compareStable(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function sorted<T extends { id: string }>(records: readonly T[]): T[] { return [...records].sort((a, b) => compareStable(a.id, b.id)); }
const TEMPLATE_TERMS = ["問題の解決", "電話の伝言", "予定の変更", "品物の比較", "公共施設", "青空センター", "若葉会館", "ひかり学校", "みどり図書館", "家族", "学校", "仕事", "買い物", "レストラン", "料理", "交通", "旅行", "道案内", "天気", "予約", "予定", "招待", "趣味", "運動", "健康", "図書館", "行事", "配達", "近所", "機械", "勉強", "間違い", "落とし物", "決まり", "お願い", "店の案内", "計画", "おすすめ", "家", "宿"] as const;
function templateNormalized(value: string): string { let result = value.normalize("NFKC").replace(/[。！？、：\s]/gu, "").replace(/午[前後]\d+時/gu, "{time}"); for (const term of TEMPLATE_TERMS) result = result.replaceAll(term, "{topic}"); return result; }
function lengthRange(activity: ListeningActivity): [number, number] {
  if (activity.level === "N5") {
    if (activity.activityType === "short-monologue") return [60, 130]; if (activity.activityType === "dialogue") return [80, 180]; if (activity.activityType === "practical-information") return [90, 190]; return [10, 45];
  }
  if (activity.activityType === "short-monologue") return [100, 220]; if (activity.activityType === "dialogue") return [150, 320]; if (activity.activityType === "practical-information") return [150, 300]; return [20, 70];
}

export function listeningCorpusErrors(content: LearningContentCollections, catalog: ListeningCatalog): string[] {
  const errors: string[] = []; const grammarIds = new Set(catalog.grammar.map(({ id }) => id)); const vocabularyIds = new Set(catalog.vocabulary.map(({ id }) => id)); const kanjiIds = new Set(catalog.kanji.map(({ id }) => id)); const units = new Map(catalog.curriculumUnits.map((unit) => [unit.id, unit])); const speakerIds = new Set(content.listeningSpeakers.map(({ id }) => id)); const questionById = new Map(content.questions.map((question) => [question.id, question])); const optionsByQuestion = new Map<string, LearningContentCollections["questionOptions"]>();
  for (const option of content.questionOptions) optionsByQuestion.set(option.questionId, [...(optionsByQuestion.get(option.questionId) ?? []), option]);
  const exact = new Map<string, string[]>(); const templates = new Map<string, string[]>(); const optionSignatures = new Map<string, string[]>(); const focusSentenceByGrammar = new Map<string, string | undefined>(); for (const view of content.grammarExampleViews) if (view.role === "focus" && !focusSentenceByGrammar.has(view.grammarId)) focusSentenceByGrammar.set(view.grammarId, content.sentences.find(({ id }) => id === view.sentenceId)?.japanese);
  for (const activity of content.listeningActivities) {
    const [minimum, maximum] = lengthRange(activity); const length = [...activity.transcript.replaceAll("\n", "")].length;
    if (length < minimum || length > maximum) errors.push(`${activity.id} length ${length} outside ${minimum}-${maximum}`);
    if (activity.turns.some(({ position }, index) => position !== index + 1)) errors.push(`${activity.id} turn order invalid`);
    if (activity.turns.some(({ speakerId }) => !speakerIds.has(speakerId))) errors.push(`${activity.id} has unresolved speaker`);
    if (/\p{Script=Han}|\d|[A-Z]|[😀-🙏]/u.test(activity.speechNormalizedTranscript)) errors.push(`${activity.id} speech normalization contains ambiguous written symbols`);
    for (const id of activity.grammarIds) if (!grammarIds.has(id)) errors.push(`${activity.id} missing grammar ${id}`);
    for (const id of activity.vocabularyIds) if (!vocabularyIds.has(id)) errors.push(`${activity.id} missing vocabulary ${id}`);
    for (const id of activity.kanjiIds) if (!kanjiIds.has(id)) errors.push(`${activity.id} missing kanji ${id}`);
    for (const id of activity.curriculumUnitIds) { const unit = units.get(id); if (!unit || unit.level !== activity.level) errors.push(`${activity.id} invalid curriculum ${id}`); if (activity.releaseReady && !unit?.releaseReady) errors.push(`${activity.id} leaks non-release curriculum`); }
    if (activity.releaseReady) errors.push(`${activity.id} must be development-only`);
    if (activity.activityType === "dialogue" && activity.speakerIds.length < 2) errors.push(`${activity.id} dialogue requires two speakers`);
    if (activity.activityType === "appropriate-response" && (activity.turns.length !== 1 || activity.questionIds.length !== 1)) errors.push(`${activity.id} appropriate response shape invalid`);
    if (activity.activityType !== "appropriate-response" && activity.grammarIds.some((id) => !activity.turns.some(({ displayText }) => displayText === focusSentenceByGrammar.get(id)))) errors.push(`${activity.id} does not genuinely contain its canonical grammar sentence`);
    for (const questionId of activity.questionIds) { const question = questionById.get(questionId); const options = optionsByQuestion.get(questionId) ?? []; if (!question || question.domain !== "listening") errors.push(`${activity.id} invalid question ${questionId}`); if (options.length !== 4 || question?.responseType !== "single-select" || question.correctOptionIds.length !== 1) errors.push(`${questionId} must have four options and one answer`); if (!question?.explanation?.includes("Each distractor") || /script supports the stated|— “/iu.test(question.explanation ?? "")) errors.push(`${questionId} explanation incomplete or placeholder-like`); const supportPosition = Number(question?.tags.find((tag) => tag.startsWith("support-turn-"))?.replace("support-turn-", "")); if (!activity.turns.some(({ position }) => position === supportPosition)) errors.push(`${questionId} supporting turn does not resolve`); if (options.some(({ content }) => content.type === "text" && /script supports the stated|— “/iu.test(content.text))) errors.push(`${questionId} contains placeholder-like option text`); if (new Set(options.map(({ content }) => content.type === "text" ? content.text : JSON.stringify(content))).size !== 4) errors.push(`${questionId} repeats an option`); const signature = options.map(({ content }) => content.type === "text" ? content.text : JSON.stringify(content)).sort(compareStable).join("\0"); optionSignatures.set(signature, [...(optionSignatures.get(signature) ?? []), questionId]); if (activity.activityType === "appropriate-response" && options.some(({ content }) => content.type !== "text" || content.language !== "ja")) errors.push(`${questionId} appropriate responses must be Japanese text`); }
    if (activity.activityType === "practical-information" && (!activity.transcript.includes("土曜日") || !activity.transcript.includes("300円") || !activity.transcript.includes("2つ") || !activity.transcript.includes("二階"))) errors.push(`${activity.id} practical information inconsistent`);
    exact.set(activity.transcript, [...(exact.get(activity.transcript) ?? []), activity.id]);
    const template = `${activity.level}|${activity.activityType}|${templateNormalized(activity.transcript)}`; templates.set(template, [...(templates.get(template) ?? []), activity.id]);
  }
  for (const ids of exact.values()) if (ids.length > 1) errors.push(`Exact duplicate listening scripts: ${ids.join(", ")}`);
  for (const ids of templates.values()) if (ids.length > 1) errors.push(`Near-template listening scripts: ${ids.join(", ")}`);
  for (const ids of optionSignatures.values()) if (ids.length > 1) errors.push(`Equivalent listening option sets: ${ids.join(", ")}`);
  if (new Set(content.listeningActivities.flatMap(({ grammarIds }) => grammarIds)).size < 40) errors.push("Listening grammar breadth is below 40 canonical records");
  return [...new Set(errors)].sort(compareStable);
}

export async function loadListeningQuestionCorpus(base: LearningContentCollections, catalog: ListeningCatalog): Promise<LearningContentCollections> {
  const [n5Raw, n4Raw, speakersRaw, questionFile] = await Promise.all([readJson<unknown[]>(SOURCE_PATHS.listeningActivityCorpusN5), readJson<unknown[]>(SOURCE_PATHS.listeningActivityCorpusN4), readJson<unknown[]>(SOURCE_PATHS.listeningSpeakerCorpus), readJson<ListeningQuestionFile>(SOURCE_PATHS.listeningQuestionCorpus)]);
  const activities = [...n5Raw, ...n4Raw].map((value) => listeningActivitySchema.parse(value)); const speakers = speakersRaw.map((value) => listeningSpeakerSchema.parse(value));
  const combined = learningContentCollectionsSchema.parse({ ...base, listeningSpeakers: sorted([...base.listeningSpeakers, ...speakers]), listeningActivities: sorted([...base.listeningActivities, ...activities]), questions: sorted([...base.questions, ...questionFile.questions]), questionOptions: [...base.questionOptions, ...questionFile.questionOptions].sort((a, b) => compareStable(a.questionId, b.questionId) || a.position - b.position), learningItemMetadata: sorted([...base.learningItemMetadata, ...questionFile.learningItemMetadata]), questionTargetRelationships: sorted([...base.questionTargetRelationships, ...questionFile.questionTargetRelationships]) });
  const errors = listeningCorpusErrors(combined, catalog); if (errors.length) throw new Error(`Listening corpus contains ${errors.length} error(s):\n${errors.slice(0, 30).join("\n")}`); return combined;
}
