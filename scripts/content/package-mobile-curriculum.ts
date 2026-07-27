import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

interface ReleaseRecord extends JsonRecord {
  id: string;
  type: 'vocabulary' | 'grammar' | 'kanji';
  level: 'N5' | 'N4';
  title: string;
  meaning: string;
  reading?: string;
  tags: string[];
  releaseReady: boolean;
}

interface CanonicalVocabulary extends JsonRecord {
  id: string;
  partOfSpeech: string[];
  kanjiIds: string[];
  releaseReady: boolean;
}

interface CanonicalGrammar extends JsonRecord {
  id: string;
  pattern: string;
  meanings: string[];
  formation: Array<{ base: string; structure: string }>;
  relatedGrammarIds: string[];
  notes: string | null;
  releaseReady: boolean;
}

interface CanonicalKanji extends JsonRecord {
  id: string;
  meanings: string[];
  readings: { on: string[]; kun: string[] };
  strokeCount: number | null;
  vocabularyIds: string[];
  similarKanjiIds: string[];
  components: string[];
  releaseReady: boolean;
}

interface ReleaseQuestion extends JsonRecord {
  id: string;
  domain: string;
  presentation: string;
  responseType: string;
  prompt: { text: string; language: string };
  explanation: string | null;
  difficulty: { jlptLevel: 'N5' | 'N4'; rank: number };
  correctOptionIds: string[];
  releaseReady: boolean;
}

interface ReleaseOption extends JsonRecord {
  id: string;
  questionId: string;
  position: number;
  content: { type: string; text?: string; sentenceId?: string; language?: string };
  feedback: string | null;
  releaseReady: boolean;
}

interface TargetRelationship extends JsonRecord {
  questionId: string;
  targetType: string;
  targetId: string;
  role: string;
  releaseReady: boolean;
}

interface ReleaseSentence extends JsonRecord {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  difficulty: { jlptLevel: 'N5' | 'N4'; rank: number };
  releaseReady: boolean;
}

interface VocabularyExample extends JsonRecord {
  id: string;
  vocabularyId: string;
  sentenceId: string;
  role: 'focus' | 'supporting';
  releaseReady: boolean;
}

interface GrammarExample extends JsonRecord {
  id: string;
  grammarId: string;
  sentenceId: string;
  role: 'focus' | 'supporting';
  releaseReady: boolean;
}

interface CompactReleaseContent {
  schemaVersion: string;
  contentVersion: string;
  profile: 'release';
  releaseReadyOnly: true;
  records: ReleaseRecord[];
  learningContent: {
    sentences: ReleaseSentence[];
    grammarExampleViews: GrammarExample[];
    vocabularyExampleViews: VocabularyExample[];
    questions: ReleaseQuestion[];
    questionOptions: ReleaseOption[];
    questionTargetRelationships: TargetRelationship[];
    kanjiExampleViews: Array<JsonRecord & { id: string; kanjiId: string; sentenceId: string; role: 'focus' | 'supporting'; releaseReady: boolean }>;
    readingPassages?: Array<JsonRecord & {
      id: string; level: 'N5' | 'N4'; title: string | null; japanese: string; reading: string; english: string;
      passageType: string; difficulty: { jlptLevel: 'N5' | 'N4'; rank: number }; estimatedReadingSeconds: number;
      vocabularyIds: string[]; grammarIds: string[]; kanjiIds: string[]; questionIds: string[]; releaseReady: boolean;
    }>;
    listeningSpeakers?: Array<JsonRecord & { id: string; label: string; releaseReady: boolean }>;
    listeningActivities?: Array<JsonRecord & {
      id: string; level: 'N5' | 'N4'; title: string; activityType: string; transcript: string; learnerTranscript: string | null;
      speechNormalizedTranscript: string; english: string; difficulty: { jlptLevel: 'N5' | 'N4'; rank: number };
      estimatedDurationSeconds: number; vocabularyIds: string[]; grammarIds: string[]; kanjiIds: string[]; questionIds: string[];
      turns: Array<{ id: string; position: number; speakerId: string; displayText: string; speechNormalizedText: string; reading: string; english: string; pauseAfterMs: number }>;
      releaseReady: boolean;
    }>;
  };
}

interface MobileVocabularyQuestion {
  id: string;
  vocabularyId: string;
  level: 'N5' | 'N4';
  presentation: string;
  responseType: string;
  prompt: string;
  explanation: string | null;
  correctOptionId: string;
  options: Array<{ id: string; label: string; feedback: string | null }>;
}

interface MobileCurriculumBundle {
  schemaVersion: 2;
  contentVersion: string;
  sourceSchemaVersion: string;
  checksum: string;
  counts: {
    vocabulary: number; questions: number; sentences: number; grammar: number; kanji: number;
    grammarQuestions: number; kanjiQuestions: number; readingPassages: number; readingQuestions: number;
    listeningActivities: number; listeningQuestions: number;
  };
  items: Array<ReleaseRecord | MobileContentItem>;
  vocabularyDetails: Array<{ id: string; partOfSpeech: string[]; kanjiIds: string[] }>;
  grammarDetails: MobileGrammarDetail[];
  kanjiDetails: MobileKanjiDetail[];
  sentences: ReleaseSentence[];
  vocabularyExamples: VocabularyExample[];
  grammarExamples: GrammarExample[];
  kanjiExamples: Array<{ id: string; kanjiId: string; sentenceId: string; role: 'focus' | 'supporting' }>;
  vocabularyQuestions: MobileVocabularyQuestion[];
  practiceQuestions: MobilePracticeQuestion[];
  readingPassages: MobileReadingPassage[];
  listeningActivities: MobileListeningActivity[];
}

interface MobileContentItem extends JsonRecord {
  id: string;
  type: 'reading' | 'listening';
  level: 'N5' | 'N4';
  title: string;
  meaning: string;
  reading: string;
  tags: string[];
  releaseReady: true;
}

interface MobileGrammarDetail {
  id: string;
  meanings: string[];
  formation: Array<{ base: string; structure: string }>;
  relatedGrammarIds: string[];
  notes: string | null;
}

interface MobileKanjiDetail {
  id: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  strokeCount: number | null;
  vocabularyIds: string[];
  relatedKanjiIds: string[];
  components: string[];
}

interface MobilePracticeQuestion {
  id: string;
  itemId: string;
  domain: 'grammar' | 'kanji' | 'reading' | 'listening';
  level: 'N5' | 'N4';
  presentation: string;
  responseType: 'single-select';
  prompt: string;
  explanation: string | null;
  correctOptionId: string;
  options: Array<{ id: string; label: string; feedback: string | null }>;
}

interface MobileReadingPassage {
  id: string;
  level: 'N5' | 'N4';
  title: string;
  japanese: string;
  reading: string;
  english: string;
  passageType: string;
  difficultyRank: number;
  estimatedReadingSeconds: number;
  vocabularyIds: string[];
  grammarIds: string[];
  kanjiIds: string[];
  questionIds: string[];
}

interface MobileListeningActivity {
  id: string;
  level: 'N5' | 'N4';
  title: string;
  activityType: string;
  transcript: string;
  learnerTranscript: string | null;
  speechText: string;
  english: string;
  difficultyRank: number;
  estimatedDurationSeconds: number;
  vocabularyIds: string[];
  grammarIds: string[];
  kanjiIds: string[];
  questionIds: string[];
  turns: Array<{ id: string; position: number; speakerLabel: string; displayText: string; speechText: string; reading: string; english: string; pauseAfterMs: number }>;
}

const root = process.cwd();
const compactReleasePath = resolve(root, 'assets/generated-content-compact/release/content.json');
const n5VocabularyPath = resolve(root, 'assets/generated-content/vocabulary/n5.json');
const n4VocabularyPath = resolve(root, 'assets/generated-content/vocabulary/n4.json');
const n5GrammarPath = resolve(root, 'assets/generated-content/grammar/n5.json');
const n4GrammarPath = resolve(root, 'assets/generated-content/grammar/n4.json');
const n5KanjiPath = resolve(root, 'assets/generated-content/kanji/n5.json');
const n4KanjiPath = resolve(root, 'assets/generated-content/kanji/n4.json');
const outputPath = resolve(root, 'assets/mobile-curriculum/release.json');
const metadataOutputPath = resolve(root, 'assets/mobile-curriculum/version.json');

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id, 'en');
}

function stableStringArray(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function createMobileBundle(
  compact: CompactReleaseContent,
  canonicalVocabulary: CanonicalVocabulary[],
  canonicalGrammar: CanonicalGrammar[],
  canonicalKanji: CanonicalKanji[],
): MobileCurriculumBundle {
  if (compact.profile !== 'release' || compact.releaseReadyOnly !== true) {
    throw new Error('Mobile curriculum must be packaged from the release-ready compact bundle.');
  }

  const vocabularyDetailsById = new Map(canonicalVocabulary.map((record) => [record.id, record]));
  const canonicalItems = compact.records.filter((record) => record.releaseReady).sort(compareById);
  const vocabulary = canonicalItems.filter((record) => record.type === 'vocabulary');
  if (vocabulary.length !== 1740) {
    throw new Error(`Expected 1,740 release-ready vocabulary records, found ${vocabulary.length}.`);
  }

  const vocabularyDetails = vocabulary.map((record) => {
    const canonical = vocabularyDetailsById.get(record.id);
    if (!canonical?.releaseReady) {
      throw new Error(`Release vocabulary ${record.id} is missing canonical detail data.`);
    }
    return {
      id: record.id,
      partOfSpeech: [...canonical.partOfSpeech].sort(),
      kanjiIds: [...canonical.kanjiIds].sort(),
    };
  }).sort(compareById);

  const grammar = canonicalItems.filter((record) => record.type === 'grammar');
  const kanji = canonicalItems.filter((record) => record.type === 'kanji');
  const grammarIds = new Set(grammar.map(({ id }) => id));
  const kanjiIds = new Set(kanji.map(({ id }) => id));
  const vocabularyIds = new Set(vocabulary.map((record) => record.id));
  const grammarById = new Map(canonicalGrammar.map((record) => [record.id, record]));
  const kanjiById = new Map(canonicalKanji.map((record) => [record.id, record]));
  const grammarDetails = grammar.map((record) => {
    const canonical = grammarById.get(record.id);
    if (!canonical?.releaseReady) throw new Error(`Release grammar ${record.id} is missing canonical detail data.`);
    return {
      id: record.id,
      meanings: [...canonical.meanings],
      formation: canonical.formation.map((formation) => ({ ...formation })),
      relatedGrammarIds: canonical.relatedGrammarIds.filter((id) => grammarIds.has(id)).sort(),
      notes: canonical.notes,
    };
  }).sort(compareById);
  const kanjiDetails = kanji.map((record) => {
    const canonical = kanjiById.get(record.id);
    if (!canonical?.releaseReady) throw new Error(`Release kanji ${record.id} is missing canonical detail data.`);
    return {
      id: record.id,
      meanings: [...canonical.meanings],
      onReadings: [...canonical.readings.on],
      kunReadings: [...canonical.readings.kun],
      strokeCount: canonical.strokeCount,
      vocabularyIds: canonical.vocabularyIds.filter((id) => vocabularyIds.has(id)).sort(),
      relatedKanjiIds: canonical.similarKanjiIds.filter((id) => kanjiIds.has(id)).sort(),
      components: [...canonical.components],
    };
  }).sort(compareById);

  const primaryVocabularyTargetByQuestionId = new Map<string, string>();
  for (const relationship of compact.learningContent.questionTargetRelationships) {
    if (
      relationship.releaseReady
      && relationship.targetType === 'vocabulary'
      && relationship.role === 'primary'
    ) {
      if (primaryVocabularyTargetByQuestionId.has(relationship.questionId)) {
        throw new Error(`Question ${relationship.questionId} has more than one primary vocabulary target.`);
      }
      primaryVocabularyTargetByQuestionId.set(relationship.questionId, relationship.targetId);
    }
  }

  const vocabularyQuestionIds = new Set(
    compact.learningContent.questions
      .filter((question) => question.releaseReady && question.domain === 'vocabulary')
      .map((question) => question.id),
  );
  const vocabularyOptionsByQuestionId = new Map<string, ReleaseOption[]>();
  for (const option of compact.learningContent.questionOptions) {
    if (!option.releaseReady || !vocabularyQuestionIds.has(option.questionId)) continue;
    if (option.content.type !== 'text') {
      throw new Error(`Mobile vocabulary option ${option.id} is not text-backed.`);
    }
    const options = vocabularyOptionsByQuestionId.get(option.questionId) ?? [];
    options.push(option);
    vocabularyOptionsByQuestionId.set(option.questionId, options);
  }

  const vocabularyQuestions = compact.learningContent.questions
    .filter((question) => question.releaseReady && question.domain === 'vocabulary')
    .map((question) => {
      const vocabularyId = primaryVocabularyTargetByQuestionId.get(question.id);
      if (!vocabularyId || !vocabularyIds.has(vocabularyId)) {
        throw new Error(`Vocabulary question ${question.id} lacks a release-ready primary target.`);
      }
      const options = [...(vocabularyOptionsByQuestionId.get(question.id) ?? [])]
        .sort((left, right) => left.position - right.position)
        .map((option) => {
          if (!option.content.text) throw new Error(`Mobile vocabulary option ${option.id} has no text.`);
          return { id: option.id, label: option.content.text, feedback: option.feedback };
        });
      if (options.length < 2 || !options.some((option) => option.id === question.correctOptionIds[0])) {
        throw new Error(`Vocabulary question ${question.id} has invalid release-ready options.`);
      }
      return {
        id: question.id,
        vocabularyId,
        level: question.difficulty.jlptLevel,
        presentation: question.presentation,
        responseType: question.responseType,
        prompt: question.prompt.text,
        explanation: question.explanation,
        correctOptionId: question.correctOptionIds[0],
        options,
      };
    }).sort(compareById);
  if (vocabularyQuestions.length !== 10440) {
    throw new Error(`Expected 10,440 release-ready vocabulary questions, found ${vocabularyQuestions.length}.`);
  }

  const sentences = compact.learningContent.sentences.filter((sentence) => sentence.releaseReady).sort(compareById);
  const sentenceIds = new Set(sentences.map((sentence) => sentence.id));
  const grammarExamples = compact.learningContent.grammarExampleViews
    .filter((example) => example.releaseReady && grammarIds.has(example.grammarId) && sentenceIds.has(example.sentenceId))
    .sort(compareById);
  const vocabularyExamples = compact.learningContent.vocabularyExampleViews
    .filter((example) => example.releaseReady && vocabularyIds.has(example.vocabularyId) && sentenceIds.has(example.sentenceId))
    .sort(compareById);

  const kanjiExamples = compact.learningContent.kanjiExampleViews
    .filter((example) => example.releaseReady && kanjiIds.has(example.kanjiId) && sentenceIds.has(example.sentenceId))
    .map(({ id, kanjiId, sentenceId, role }) => ({ id, kanjiId, sentenceId, role }))
    .sort(compareById);

  const releaseQuestions = compact.learningContent.questions.filter((question) => question.releaseReady);
  const releaseQuestionIds = new Set(releaseQuestions.map(({ id }) => id));
  const optionsByQuestionId = new Map<string, ReleaseOption[]>();
  for (const option of compact.learningContent.questionOptions) {
    if (!option.releaseReady || !releaseQuestionIds.has(option.questionId)) continue;
    optionsByQuestionId.set(option.questionId, [...(optionsByQuestionId.get(option.questionId) ?? []), option]);
  }
  const sentenceById = new Map(sentences.map((sentence) => [sentence.id, sentence]));
  const primaryTargetByQuestionId = new Map<string, TargetRelationship>();
  for (const relationship of compact.learningContent.questionTargetRelationships) {
    if (!relationship.releaseReady || relationship.role !== 'primary' || !releaseQuestionIds.has(relationship.questionId)) continue;
    if (primaryTargetByQuestionId.has(relationship.questionId)) throw new Error(`Question ${relationship.questionId} has more than one primary target.`);
    primaryTargetByQuestionId.set(relationship.questionId, relationship);
  }
  const contentItems = [
    ...(compact.learningContent.readingPassages ?? []).filter((record) => record.releaseReady).map((passage): MobileContentItem => ({
      id: passage.id, type: 'reading', level: passage.level, title: passage.title ?? 'Reading', meaning: passage.english,
      reading: passage.reading, tags: stableStringArray((passage.topicTags as string[] | undefined) ?? []), releaseReady: true,
    })),
    ...(compact.learningContent.listeningActivities ?? []).filter((record) => record.releaseReady).map((activity): MobileContentItem => ({
      id: activity.id, type: 'listening', level: activity.level, title: activity.title, meaning: activity.english,
      reading: activity.speechNormalizedTranscript, tags: stableStringArray((activity.topicTags as string[] | undefined) ?? []), releaseReady: true,
    })),
  ].sort(compareById);
  const itemIds = new Set([...canonicalItems, ...contentItems].map((item) => item.id));
  const optionLabel = (option: ReleaseOption): string => {
    if (option.content.type === 'text' && option.content.text) return option.content.text;
    if (option.content.type === 'sentence-reference' && option.content.sentenceId) {
      const sentence = sentenceById.get(option.content.sentenceId);
      if (sentence) return sentence.japanese;
    }
    throw new Error(`Mobile question option ${option.id} is not displayable offline.`);
  };
  const practiceQuestions = releaseQuestions
    .filter((question): question is ReleaseQuestion & { responseType: 'single-select'; correctOptionIds: [string] } => (
      question.domain !== 'vocabulary' && question.responseType === 'single-select'
    ))
    .map((question): MobilePracticeQuestion => {
      const target = primaryTargetByQuestionId.get(question.id);
      if (!target || !itemIds.has(target.targetId) || !['grammar', 'kanji', 'reading-passage', 'listening-activity'].includes(target.targetType)) {
        throw new Error(`Practice question ${question.id} lacks a bundled primary target.`);
      }
      let domain: MobilePracticeQuestion['domain'];
      if (target.targetType === 'reading-passage') domain = 'reading';
      else if (target.targetType === 'listening-activity') domain = 'listening';
      else if (target.targetType === 'grammar' || target.targetType === 'kanji') domain = target.targetType;
      else throw new Error(`Practice question ${question.id} has an unsupported target type.`);
      const options = [...(optionsByQuestionId.get(question.id) ?? [])]
        .sort((left, right) => left.position - right.position)
        .map((option) => ({ id: option.id, label: optionLabel(option), feedback: option.feedback }));
      if (options.length < 2 || !options.some((option) => option.id === question.correctOptionIds[0])) throw new Error(`Practice question ${question.id} has invalid options.`);
      return { id: question.id, itemId: target.targetId, domain, level: question.difficulty.jlptLevel, presentation: question.presentation, responseType: 'single-select', prompt: question.prompt.text, explanation: question.explanation, correctOptionId: question.correctOptionIds[0], options };
    }).sort(compareById);
  const practiceQuestionIds = new Set(practiceQuestions.map(({ id }) => id));
  const readingPassages = (compact.learningContent.readingPassages ?? []).filter((record) => record.releaseReady).map((passage): MobileReadingPassage => ({
    id: passage.id, level: passage.level, title: passage.title ?? 'Reading', japanese: passage.japanese, reading: passage.reading,
    english: passage.english, passageType: passage.passageType, difficultyRank: passage.difficulty.rank,
    estimatedReadingSeconds: passage.estimatedReadingSeconds, vocabularyIds: passage.vocabularyIds.filter((id) => vocabularyIds.has(id)),
    grammarIds: passage.grammarIds.filter((id) => grammarIds.has(id)), kanjiIds: passage.kanjiIds.filter((id) => kanjiIds.has(id)),
    questionIds: passage.questionIds.filter((id) => practiceQuestionIds.has(id)),
  })).sort(compareById);
  const speakers = new Map((compact.learningContent.listeningSpeakers ?? []).filter((speaker) => speaker.releaseReady).map((speaker) => [speaker.id, speaker.label]));
  const listeningActivities = (compact.learningContent.listeningActivities ?? []).filter((record) => record.releaseReady).map((activity): MobileListeningActivity => ({
    id: activity.id, level: activity.level, title: activity.title, activityType: activity.activityType, transcript: activity.transcript,
    learnerTranscript: activity.learnerTranscript, speechText: activity.speechNormalizedTranscript, english: activity.english,
    difficultyRank: activity.difficulty.rank, estimatedDurationSeconds: activity.estimatedDurationSeconds,
    vocabularyIds: activity.vocabularyIds.filter((id) => vocabularyIds.has(id)), grammarIds: activity.grammarIds.filter((id) => grammarIds.has(id)),
    kanjiIds: activity.kanjiIds.filter((id) => kanjiIds.has(id)), questionIds: activity.questionIds.filter((id) => practiceQuestionIds.has(id)),
    turns: activity.turns.map((turn) => ({ id: turn.id, position: turn.position, speakerLabel: speakers.get(turn.speakerId) ?? 'Speaker', displayText: turn.displayText, speechText: turn.speechNormalizedText, reading: turn.reading, english: turn.english, pauseAfterMs: turn.pauseAfterMs })),
  })).sort(compareById);
  if (readingPassages.length !== 30 || readingPassages.reduce((count, passage) => count + passage.questionIds.length, 0) !== 120) throw new Error('Initial mobile reading release must contain 30 passages and 120 questions.');
  if (listeningActivities.length !== 30 || listeningActivities.reduce((count, activity) => count + activity.questionIds.length, 0) !== 90) throw new Error('Initial mobile listening release must contain 30 activities and 90 questions.');

  const withoutChecksum = {
    schemaVersion: 2 as const,
    contentVersion: compact.contentVersion,
    sourceSchemaVersion: compact.schemaVersion,
    counts: { vocabulary: vocabulary.length, questions: vocabularyQuestions.length, sentences: sentences.length, grammar: grammar.length, kanji: kanji.length, grammarQuestions: practiceQuestions.filter(({ domain }) => domain === 'grammar').length, kanjiQuestions: practiceQuestions.filter(({ domain }) => domain === 'kanji').length, readingPassages: readingPassages.length, readingQuestions: practiceQuestions.filter(({ domain }) => domain === 'reading').length, listeningActivities: listeningActivities.length, listeningQuestions: practiceQuestions.filter(({ domain }) => domain === 'listening').length },
    items: [...canonicalItems, ...contentItems].sort(compareById),
    vocabularyDetails,
    grammarDetails,
    kanjiDetails,
    sentences,
    grammarExamples,
    vocabularyExamples,
    kanjiExamples,
    vocabularyQuestions,
    practiceQuestions,
    readingPassages,
    listeningActivities,
  };
  return { ...withoutChecksum, checksum: checksum(withoutChecksum) };
}

async function main(): Promise<void> {
  const [compact, n5Vocabulary, n4Vocabulary, n5Grammar, n4Grammar, n5Kanji, n4Kanji] = await Promise.all([
    readJson<CompactReleaseContent>(compactReleasePath),
    readJson<CanonicalVocabulary[]>(n5VocabularyPath),
    readJson<CanonicalVocabulary[]>(n4VocabularyPath),
    readJson<CanonicalGrammar[]>(n5GrammarPath),
    readJson<CanonicalGrammar[]>(n4GrammarPath),
    readJson<CanonicalKanji[]>(n5KanjiPath),
    readJson<CanonicalKanji[]>(n4KanjiPath),
  ]);
  const bundle = createMobileBundle(compact, [...n5Vocabulary, ...n4Vocabulary], [...n5Grammar, ...n4Grammar], [...n5Kanji, ...n4Kanji]);
  const metadata = {
    schemaVersion: bundle.schemaVersion,
    contentVersion: bundle.contentVersion,
    checksum: bundle.checksum,
    counts: bundle.counts,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(bundle)}\n`),
    writeFile(metadataOutputPath, `${JSON.stringify(metadata)}\n`),
  ]);
  console.log(`Packaged mobile curriculum: ${bundle.counts.vocabulary} vocabulary, ${bundle.counts.readingPassages} reading, ${bundle.counts.listeningActivities} listening, and ${bundle.counts.questions + bundle.counts.grammarQuestions + bundle.counts.kanjiQuestions + bundle.counts.readingQuestions + bundle.counts.listeningQuestions} questions.`);
}

if (process.argv[1]?.endsWith('package-mobile-curriculum.ts')) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { createMobileBundle };
