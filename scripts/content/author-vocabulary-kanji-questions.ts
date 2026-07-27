import type {
  LearningContentCollections,
  LearningItemMetadata,
  Question,
  QuestionOption,
  QuestionTargetRelationship,
  Sentence,
} from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import { effectiveKanjiQuestionTarget } from "./vocabulary-kanji-question-corpus";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson } from "./lib/fs-utils";
import type { KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";

interface CanonicalQuestionCorpus {
  schemaVersion: 1;
  fixedTimestamp: "2026-07-26T00:00:00.000Z";
  questions: Question[];
  questionOptions: QuestionOption[];
  learningItemMetadata: LearningItemMetadata[];
  questionTargetRelationships: QuestionTargetRelationship[];
}

interface BuiltQuestion {
  question: Question;
  options: QuestionOption[];
  metadata: LearningItemMetadata;
  relationships: QuestionTargetRelationship[];
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableSlug(value: string): string {
  return [...value]
    .map((character) =>
      /^[a-z0-9-]$/u.test(character)
        ? character
        : `u${character.codePointAt(0)!.toString(16)}`,
    )
    .join("")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function primaryReading(record: VocabularyRecord): string {
  return record.readings.find(({ primary }) => primary)?.kana ?? record.readings[0]?.kana ?? "";
}

function primaryRomaji(record: VocabularyRecord): string {
  return record.readings.find(({ primary }) => primary)?.romaji ?? record.readings[0]?.romaji ?? "";
}

function primaryMeaning(record: VocabularyRecord): string {
  return record.senses[0]?.definitions[0] ?? record.primaryForm;
}

function primaryPartOfSpeech(record: VocabularyRecord): string {
  return record.partOfSpeech[0] ?? "expression";
}

function vocabularyDisplayForm(record: VocabularyRecord, character?: string): string {
  if (character) {
    return (
      record.writtenForms.find(({ primary, text }) => primary && text.includes(character))?.text ??
      record.writtenForms.find(({ common, text }) => common && text.includes(character))?.text ??
      record.writtenForms.find(({ text }) => text.includes(character))?.text ??
      record.primaryForm
    );
  }
  return record.primaryForm;
}

function uniqueDistractors<T>(
  target: T,
  candidates: readonly T[],
  value: (record: T) => string,
  preferred: (record: T) => boolean,
): T[] {
  const targetValue = value(target);
  const values = new Set([targetValue]);
  const result: T[] = [];
  for (const group of [candidates.filter(preferred), candidates.filter((record) => !preferred(record))]) {
    for (const candidate of group) {
      if (candidate === target) continue;
      const candidateValue = value(candidate);
      if (!candidateValue || values.has(candidateValue)) continue;
      values.add(candidateValue);
      result.push(candidate);
      if (result.length === 3) return result;
    }
  }
  throw new Error(`Could not select three unique distractors for ${targetValue}`);
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  const normalized = offset % values.length;
  return [...values.slice(normalized), ...values.slice(0, normalized)];
}

function optionId(questionId: string, position: number): string {
  return `question-option-${questionId.replace(/^question-/u, "")}-${position}`;
}

function relationshipId(questionId: string, suffix: string): string {
  return `question-target-${questionId.replace(/^question-/u, "")}-${suffix}`;
}

function makeOptions<T>(
  questionId: string,
  target: T,
  distractors: readonly T[],
  value: (record: T) => string,
  language: "ja" | "en",
  offset: number,
  correctFeedback: string,
  wrongFeedback: (record: T) => string,
): { options: QuestionOption[]; correctOptionId: string; orderedRecords: T[] } {
  const orderedRecords = rotate([target, ...distractors], offset);
  const options = orderedRecords.map((record, index): QuestionOption => {
    const position = index + 1;
    return {
      schemaVersion: 1,
      id: optionId(questionId, position),
      questionId,
      position,
      content: { type: "text", text: value(record), language },
      feedback: record === target ? correctFeedback : wrongFeedback(record),
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    };
  });
  return {
    options,
    correctOptionId: options[orderedRecords.indexOf(target)]!.id,
    orderedRecords,
  };
}

function metadataFor(
  questionId: string,
  level: "N5" | "N4",
  typeTag: string,
  skill: LearningItemMetadata["skills"][number],
  seconds: number,
): LearningItemMetadata {
  return {
    schemaVersion: 1,
    id: `learning-item-${questionId.replace(/^question-/u, "")}`,
    itemType: "question",
    itemId: questionId,
    reviewable: true,
    skills: [skill],
    availableModes: ["quiz"],
    estimatedReviewSeconds: seconds,
    tags: [level.toLowerCase(), typeTag].sort(compareStable),
    confidence: 0.99,
    needsReview: false,
    releaseReady: true,
  };
}

const contextLabels = [
  "a home conversation",
  "a school message",
  "a workplace note",
  "a shopping situation",
  "a travel plan",
  "a phone call",
] as const;

function vocabularyQuestion(
  target: VocabularyRecord,
  vocabulary: readonly VocabularyRecord[],
  kanjiById: ReadonlyMap<string, KanjiRecord>,
  sentence: Sentence | undefined,
  type: "meaning-recognition" | "meaning-production" | "usage-context" | "usage-choice" | "reading" | "written-form",
  ordinal: number,
  targetIndex: number,
): BuiltQuestion {
  const level = target.jlpt.level as "N5" | "N4";
  const slug = stableSlug(target.id.replace(/^vocab-/u, ""));
  const questionId = `question-vocabulary-${slug}-${type}-${ordinal}`;
  const form = target.primaryForm;
  const reading = primaryReading(target);
  const meaning = primaryMeaning(target);
  const pos = primaryPartOfSpeech(target);
  const sameLevel = vocabulary.filter(
    (record) => record.releaseReady && record.jlpt.level === target.jlpt.level,
  );
  const candidatePool = sameLevel.filter(
    (record) =>
      record.id === target.id ||
      type === "meaning-recognition" ||
      type === "reading" ||
      primaryMeaning(record) !== meaning,
  );
  const preferred = (record: VocabularyRecord) =>
    record.partOfSpeech.some((candidate) => target.partOfSpeech.includes(candidate));
  const value =
    type === "meaning-recognition"
      ? primaryMeaning
      : type === "reading"
        ? primaryReading
        : (record: VocabularyRecord) => record.primaryForm;
  const distractors = uniqueDistractors(
    target,
    rotate(candidatePool, targetIndex + ordinal * 17),
    value,
    preferred,
  );
  const context = contextLabels[targetIndex % contextLabels.length];
  const kanjiHint = [...form].filter((character) => /\p{Script=Han}/u.test(character)).join("");
  const orthographicHint = kanjiHint
    ? `uses ${kanjiHint} in its canonical spelling`
    : "is written entirely in kana";
  const prompt =
    type === "meaning-recognition"
      ? `In the primary sense of 「${form}」 (${reading}), which meaning is intended?`
      : type === "meaning-production"
        ? `Which ${level} word expresses “${meaning},” is read ${reading}, and ${orthographicHint}?`
        : type === "usage-context"
          ? sentence
            ? `In the referenced ${sentence.context.settingTags[0] ?? "everyday"} example, which word pronounced ${reading} carries the sense “${meaning}”?`
            : `In ${context}, which ${pos} pronounced ${reading} best expresses “${meaning}”?`
          : type === "usage-choice"
            ? `A learner needs a natural ${pos} pronounced ${reading} and meaning “${meaning}” for ${context}. Which choice fits that objective?`
            : type === "reading"
              ? `Which kana reading matches the pronunciation ${primaryRomaji(target)} for 「${form}」 meaning “${meaning}”?`
              : `Which canonical written form ${orthographicHint}, is read ${reading}, and means “${meaning}”?`;
  const difficultyRank =
    type === "meaning-recognition" || type === "meaning-production"
      ? 2
      : type === "written-form"
        ? 4
        : 3;
  const language = type === "meaning-recognition" ? "en" : type === "reading" ? "ja" : "ja";
  const builtOptions = makeOptions(
    questionId,
    target,
    distractors,
    value,
    language,
    targetIndex + ordinal,
    `${form} is correct: its primary reading is ${reading}, and its primary release-target sense is “${meaning}.”`,
    (record) =>
      `${record.primaryForm} is read ${primaryReading(record)} and means “${primaryMeaning(record)},” so it does not match this objective.`,
  );
  const typeTag = `type-${type}`;
  const skill =
    type === "meaning-recognition" || type === "meaning-production"
      ? "meaning-recognition"
      : type === "reading"
        ? "reading-recognition"
        : type === "written-form"
          ? "form-recognition"
          : "contextual-usage";
  const question: Question = {
    schemaVersion: 1,
    id: questionId,
    domain: "vocabulary",
    presentation: type === "reading" ? "choose-reading" : "multiple-choice",
    responseType: "single-select",
    prompt: { text: prompt, language: "en" },
    stimulusReferences:
      sentence && type === "usage-context" ? [{ type: "sentence", id: sentence.id }] : [],
    correctOptionIds: [builtOptions.correctOptionId],
    explanation: `${form} (${reading}) means “${meaning}” in sense-0 and functions here as ${pos}. Each other option has a different canonical form, reading, or primary meaning. Teaching note: use the supplied sense and context; do not infer an unlisted spelling or secondary dictionary sense.`,
    difficulty: { jlptLevel: level, rank: difficultyRank },
    examMetadata: null,
    usageContexts: ["lesson", "review"],
    tags: [
      "domain-vocabulary",
      level.toLowerCase(),
      "sense-0",
      typeTag,
      ...(type === "reading" ? ["reading-primary"] : []),
    ].sort(compareStable),
    sourceIds: ["japango-vocabulary-question-corpus"],
    attribution: ["Original JapanGo vocabulary learning question and explanation."],
    confidence: 0.99,
    needsReview: false,
    releaseReady: true,
  };
  const targetSkill: QuestionTargetRelationship["skill"] =
    type === "reading" ? "reading" : type === "meaning-recognition" || type === "meaning-production" ? "meaning" : type === "written-form" ? "form" : "usage";
  const relationships: QuestionTargetRelationship[] = [
    {
      schemaVersion: 1,
      id: relationshipId(questionId, "vocabulary-primary"),
      questionId,
      targetType: "vocabulary",
      targetId: target.id,
      role: "primary",
      skill: targetSkill,
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    },
    ...distractors.map((record, index): QuestionTargetRelationship => ({
      schemaVersion: 1,
      id: relationshipId(questionId, `vocabulary-distractor-${index + 1}`),
      questionId,
      targetType: "vocabulary",
      targetId: record.id,
      role: "distractor-source",
      skill: targetSkill,
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    })),
  ];
  if (sentence && type === "usage-context") {
    relationships.push({
      schemaVersion: 1,
      id: relationshipId(questionId, "sentence-supporting"),
      questionId,
      targetType: "sentence",
      targetId: sentence.id,
      role: "supporting",
      skill: "usage",
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    });
  }
  for (const kanjiId of target.kanjiIds.filter((id) => kanjiById.get(id)?.releaseReady)) {
    relationships.push({
      schemaVersion: 1,
      id: relationshipId(questionId, `kanji-supporting-${stableSlug(kanjiId.replace(/^kanji-/u, ""))}`),
      questionId,
      targetType: "kanji",
      targetId: kanjiId,
      role: "supporting",
      skill: type === "reading" ? "reading" : "form",
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    });
  }
  return {
    question,
    options: builtOptions.options,
    metadata: metadataFor(questionId, level, typeTag, skill, difficultyRank === 4 ? 32 : 24),
    relationships,
  };
}

function kanjiQuestion(
  target: KanjiRecord,
  kanji: readonly KanjiRecord[],
  vocabulary: readonly VocabularyRecord[],
  supportedVocabulary: readonly VocabularyRecord[],
  sentence: Sentence | undefined,
  type: "character-meaning" | "reading-context" | "vocabulary-context" | "word-distinction",
  targetIndex: number,
): BuiltQuestion {
  const level = target.jlpt.level === "N4" ? "N4" : "N5";
  const questionId = `question-kanji-${stableSlug(target.character)}-${type}-1`;
  const coreMeaning = target.meanings[0] ?? target.character;
  const correctVocabulary =
    type === "word-distinction" ? supportedVocabulary[1] ?? supportedVocabulary[0] : supportedVocabulary[0];
  const sameLevelKanji = kanji.filter(
    (record) => record.releaseReady && record.jlpt.level === target.jlpt.level,
  );
  let options: QuestionOption[];
  let correctOptionId: string;
  let distractorRelationships: QuestionTargetRelationship[] = [];
  let supportingVocabulary: VocabularyRecord | undefined;
  let prompt: string;
  if (type === "character-meaning") {
    const distractors = uniqueDistractors(
      target,
      sameLevelKanji,
      (record) => record.meanings[0] ?? record.character,
      (record) => Math.abs(record.strokeCount - target.strokeCount) <= 2,
    );
    const built = makeOptions(
      questionId,
      target,
      distractors,
      (record) => record.meanings[0] ?? record.character,
      "en",
      targetIndex,
      `${target.character} has the canonical core meaning “${coreMeaning}.”`,
      (record) => `${record.character} has the different core meaning “${record.meanings[0] ?? record.character}.”`,
    );
    options = built.options;
    correctOptionId = built.correctOptionId;
    prompt = `Which core meaning belongs to the kanji ${target.character}?`;
    distractorRelationships = distractors.map((record, index) => ({
      schemaVersion: 1,
      id: relationshipId(questionId, `kanji-distractor-${index + 1}`),
      questionId,
      targetType: "kanji",
      targetId: record.id,
      role: "distractor-source",
      skill: "meaning",
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    }));
  } else {
    if (!correctVocabulary) throw new Error(`${target.id} cannot support ${type}`);
    supportingVocabulary = correctVocabulary;
    const correctForm = vocabularyDisplayForm(correctVocabulary, target.character);
    const correctReading = primaryReading(correctVocabulary);
    const candidateVocabulary = vocabulary.filter(
      (record) => record.releaseReady && record.jlpt.level === target.jlpt.level,
    );
    const value = type === "reading-context" ? primaryReading : (record: VocabularyRecord) => vocabularyDisplayForm(record);
    const distractors = uniqueDistractors(
      correctVocabulary,
      candidateVocabulary,
      value,
      (record) =>
        type === "word-distinction"
          ? supportedVocabulary.some(({ id }) => id === record.id)
          : !record.writtenForms.some(({ text }) => text.includes(target.character)),
    );
    const built = makeOptions(
      questionId,
      correctVocabulary,
      distractors,
      value,
      "ja",
      targetIndex + (type === "reading-context" ? 1 : type === "vocabulary-context" ? 2 : 3),
      type === "reading-context"
        ? `${correctForm} is read ${correctReading}; this is the reading of the whole word in this context, not a universal reading for ${target.character}.`
        : `${correctForm} contains ${target.character} and means “${primaryMeaning(correctVocabulary)}.”`,
      (record) =>
        `${vocabularyDisplayForm(record)} is read ${primaryReading(record)} and means “${primaryMeaning(record)},” so it does not satisfy this word-specific objective.`,
    );
    options = built.options;
    correctOptionId = built.correctOptionId;
    prompt =
      type === "reading-context"
        ? `How is the whole word ${correctForm} read as a canonical example containing ${target.character}, when it means “${primaryMeaning(correctVocabulary)}”?`
        : type === "vocabulary-context"
          ? sentence
            ? `Which canonical word in the referenced example demonstrates the kanji ${target.character}?`
            : `Which canonical word contains ${target.character} and means “${primaryMeaning(correctVocabulary)}”?`
          : `Which word containing ${target.character} specifically means “${primaryMeaning(correctVocabulary)}”?`;
    distractorRelationships = distractors.map((record, index) => ({
      schemaVersion: 1,
      id: relationshipId(questionId, `vocabulary-distractor-${index + 1}`),
      questionId,
      targetType: "vocabulary",
      targetId: record.id,
      role: "distractor-source",
      skill: type === "reading-context" ? "reading" : "usage",
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    }));
  }
  const difficultyRank = type === "character-meaning" ? 2 : type === "word-distinction" ? 4 : 3;
  const typeTag = `type-${type}`;
  const primarySkill: QuestionTargetRelationship["skill"] =
    type === "character-meaning" ? "meaning" : type === "reading-context" ? "reading" : "usage";
  const question: Question = {
    schemaVersion: 1,
    id: questionId,
    domain: "kanji",
    presentation: type === "reading-context" ? "choose-reading" : "multiple-choice",
    responseType: "single-select",
    prompt: { text: prompt, language: "en" },
    stimulusReferences:
      sentence && type === "vocabulary-context" ? [{ type: "sentence", id: sentence.id }] : [],
    correctOptionIds: [correctOptionId],
    explanation:
      type === "character-meaning"
        ? `${target.character} has the canonical core meaning “${coreMeaning}.” The distractor kanji have different meanings. Teaching note: this tests meaning recognition, not an isolated reading.`
        : `${vocabularyDisplayForm(supportingVocabulary!, target.character)} is read ${primaryReading(supportingVocabulary!)} and demonstrates ${target.character} in a canonical word meaning “${primaryMeaning(supportingVocabulary!)}.” Each distractor is a different canonical word. Teaching note: the reading belongs to this specific word and is not claimed as universal.`,
    difficulty: { jlptLevel: level, rank: difficultyRank },
    examMetadata: null,
    usageContexts: ["lesson", "review"],
    tags: [
      "domain-kanji",
      level.toLowerCase(),
      typeTag,
      ...(type === "reading-context" ? ["reading-primary"] : []),
    ].sort(compareStable),
    sourceIds: ["japango-kanji-question-corpus"],
    attribution: ["Original JapanGo kanji learning question and explanation."],
    confidence: 0.99,
    needsReview: false,
    releaseReady: true,
  };
  const relationships: QuestionTargetRelationship[] = [
    {
      schemaVersion: 1,
      id: relationshipId(questionId, "kanji-primary"),
      questionId,
      targetType: "kanji",
      targetId: target.id,
      role: "primary",
      skill: primarySkill,
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    },
    ...distractorRelationships,
  ];
  if (supportingVocabulary) {
    relationships.push({
      schemaVersion: 1,
      id: relationshipId(questionId, "vocabulary-supporting"),
      questionId,
      targetType: "vocabulary",
      targetId: supportingVocabulary.id,
      role: "supporting",
      skill: primarySkill,
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    });
  }
  if (sentence && type === "vocabulary-context") {
    relationships.push({
      schemaVersion: 1,
      id: relationshipId(questionId, "sentence-supporting"),
      questionId,
      targetType: "sentence",
      targetId: sentence.id,
      role: "supporting",
      skill: "usage",
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    });
  }
  const metadataSkill =
    type === "character-meaning"
      ? "meaning-recognition"
      : type === "reading-context"
        ? "reading-recognition"
        : "contextual-usage";
  return {
    question,
    options,
    metadata: metadataFor(questionId, level, typeTag, metadataSkill, difficultyRank === 4 ? 32 : 24),
    relationships,
  };
}

function emptyCorpus(): CanonicalQuestionCorpus {
  return {
    schemaVersion: 1,
    fixedTimestamp: "2026-07-26T00:00:00.000Z",
    questions: [],
    questionOptions: [],
    learningItemMetadata: [],
    questionTargetRelationships: [],
  };
}

function addBuilt(corpus: CanonicalQuestionCorpus, built: BuiltQuestion): void {
  corpus.questions.push(built.question);
  corpus.questionOptions.push(...built.options);
  corpus.learningItemMetadata.push(built.metadata);
  corpus.questionTargetRelationships.push(...built.relationships);
}

function sortCorpus(corpus: CanonicalQuestionCorpus): void {
  corpus.questions.sort((left, right) => compareStable(left.id, right.id));
  corpus.questionOptions.sort(
    (left, right) =>
      compareStable(left.questionId, right.questionId) ||
      left.position - right.position ||
      compareStable(left.id, right.id),
  );
  corpus.learningItemMetadata.sort((left, right) => compareStable(left.id, right.id));
  corpus.questionTargetRelationships.sort((left, right) => compareStable(left.id, right.id));
}

export async function authorVocabularyKanjiQuestions(): Promise<void> {
  const [content, n5Vocabulary, n4Vocabulary, supplemental, n5Kanji, n4Kanji] = await Promise.all([
    readJson<LearningContentCollections>(`${OUTPUT_ROOT}/learning-content/index.json`),
    readJson<VocabularyRecord[]>(`${OUTPUT_ROOT}/vocabulary/n5.json`),
    readJson<VocabularyRecord[]>(`${OUTPUT_ROOT}/vocabulary/n4.json`),
    readJson<VocabularyRecord[]>(`${OUTPUT_ROOT}/vocabulary/supplemental.json`),
    readJson<KanjiRecord[]>(`${OUTPUT_ROOT}/kanji/n5.json`),
    readJson<KanjiRecord[]>(`${OUTPUT_ROOT}/kanji/n4.json`),
  ]);
  const vocabulary = [...n5Vocabulary, ...n4Vocabulary, ...supplemental].sort((left, right) => compareStable(left.id, right.id));
  const kanji = [...n5Kanji, ...n4Kanji].sort((left, right) => compareStable(left.id, right.id));
  const kanjiById = new Map(kanji.map((record) => [record.id, record]));
  const sentenceById = new Map(content.sentences.map((sentence) => [sentence.id, sentence]));
  const releaseVocabularySentence = new Map<string, Sentence>();
  for (const view of content.vocabularyExampleViews) {
    const sentence = sentenceById.get(view.sentenceId);
    if (sentence?.releaseReady && sentence.reviewStatus === "approved" && !releaseVocabularySentence.has(view.vocabularyId)) {
      releaseVocabularySentence.set(view.vocabularyId, sentence);
    }
  }
  const releaseKanjiSentence = new Map<string, Sentence>();
  for (const view of content.kanjiExampleViews) {
    const sentence = sentenceById.get(view.sentenceId);
    if (sentence?.releaseReady && sentence.reviewStatus === "approved" && !releaseKanjiSentence.has(view.kanjiId)) {
      releaseKanjiSentence.set(view.kanjiId, sentence);
    }
  }
  const vocabularyCorpus = emptyCorpus();
  const vocabularyTypes = [
    "meaning-recognition",
    "meaning-production",
    "usage-context",
    "usage-choice",
    "reading",
    "written-form",
  ] as const;
  const releaseVocabulary = vocabulary.filter(({ releaseReady }) => releaseReady);
  for (const [targetIndex, target] of releaseVocabulary.entries()) {
    for (const [index, type] of vocabularyTypes.entries()) {
      addBuilt(
        vocabularyCorpus,
        vocabularyQuestion(
          target,
          releaseVocabulary,
          kanjiById,
          releaseVocabularySentence.get(target.id),
          type,
          index + 1,
          targetIndex,
        ),
      );
    }
  }
  const kanjiCorpus = emptyCorpus();
  const releaseKanji = kanji.filter(({ releaseReady }) => releaseReady);
  for (const [targetIndex, target] of releaseKanji.entries()) {
    const supportedVocabulary = releaseVocabulary.filter(({ writtenForms }) =>
      writtenForms.some(({ text }) => text.includes(target.character)),
    );
    const effectiveTarget = effectiveKanjiQuestionTarget(supportedVocabulary.length);
    const types = [
      "character-meaning",
      ...(effectiveTarget >= 2 ? (["reading-context"] as const) : []),
      ...(effectiveTarget >= 3 ? (["vocabulary-context"] as const) : []),
      ...(effectiveTarget >= 4 ? (["word-distinction"] as const) : []),
    ] as const;
    for (const type of types) {
      addBuilt(
        kanjiCorpus,
        kanjiQuestion(
          target,
          releaseKanji,
          releaseVocabulary,
          supportedVocabulary,
          releaseKanjiSentence.get(target.id),
          type,
          targetIndex,
        ),
      );
    }
  }
  sortCorpus(vocabularyCorpus);
  sortCorpus(kanjiCorpus);
  await Promise.all([
    writeJson(SOURCE_PATHS.vocabularyQuestionCorpus, vocabularyCorpus),
    writeJson(SOURCE_PATHS.kanjiQuestionCorpus, kanjiCorpus),
  ]);
  console.log(
    `Authored ${vocabularyCorpus.questions.length} vocabulary questions and ${kanjiCorpus.questions.length} inventory-bounded kanji questions.`,
  );
}

if (isDirectExecution(import.meta.url)) runCli(authorVocabularyKanjiQuestions);
