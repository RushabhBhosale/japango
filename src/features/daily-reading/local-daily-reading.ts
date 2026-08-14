import { loadBundledCurriculum } from '../curriculum/bundled-curriculum';
import type { DailyReading, DailyReadingLearningContext, DailyReadingQuestion } from '@/types/daily-reading';
import type { CurriculumLevel } from '@/types/learning';

interface ReadingOption {
  text: string;
  reading: string;
}

const localTitleReadings: Record<string, string> = {
  'reading-passage-n4-medium-001': 'あきのしやくしょへのみち・はちじのくわしいきろく',
  'reading-passage-n4-medium-002': 'えみのごごのけいかく・くじのくわしいきろく',
  'reading-passage-n4-medium-003': 'かいのやどのへや・じゅうじのくわしいきろく',
  'reading-passage-n4-medium-004': 'さきのにわへのしょうたい・じゅういちじのくわしいきろく',
  'reading-passage-n4-medium-005': 'たくのかいもののめも・いちじのくわしいきろく',
  'reading-passage-n4-medium-006': 'なおのはいしゃのじかん・にじのくわしいきろく',
  'reading-passage-n4-medium-007': 'はるのきたくのでんごん・さんじのくわしいきろく',
  'reading-passage-n4-medium-008': 'まいのあたらしいひろば・よじのくわしいきろく',
  'reading-passage-n4-medium-009': 'ゆうのよるのじゅんび・ごじのくわしいきろく',
  'reading-passage-n4-medium-010': 'りんのひるのおべんとう・ろくじのくわしいきろく',
  'reading-passage-n4-medium-011': 'あきのいちにちのじゅんばん・はちじのくわしいきろく',
  'reading-passage-n4-medium-012': 'えみのしりょうのおれい・くじのくわしいきろく',
  'reading-passage-n4-medium-013': 'かいのしゃしんのおくりかた・じゅうじのくわしいきろく',
  'reading-passage-n4-medium-014': 'さきのいえのしごと・じゅういちじのくわしいきろく',
  'reading-passage-n4-medium-015': 'たくのしずかなせき・いちじのくわしいきろく',
  'reading-passage-n4-medium-016': 'なおのやすむひのすごしかた・にじのくわしいきろく',
  'reading-passage-n4-medium-017': 'はるのくやくしょのてつづき・さんじのくわしいきろく',
  'reading-passage-n4-medium-018': 'まいのみじかいふくしゅう・よじのくわしいきろく',
  'reading-passage-n5-medium-001': 'はるのやすむひのすごしかた・さんじのやさしいきろく',
  'reading-passage-n5-medium-002': 'まいのくやくしょのてつづき・よじのやさしいきろく',
  'reading-passage-n5-medium-003': 'ゆうのみじかいふくしゅう・ごじのやさしいきろく',
  'reading-passage-n5-medium-004': 'りんのそぼへのてがみ・ろくじのやさしいきろく',
  'reading-passage-n5-medium-005': 'あきのやさいのすーぷ・はちじのやさしいきろく',
  'reading-passage-n5-medium-006': 'えみのかぜのつよいひ・くじのやさしいきろく',
  'reading-passage-n5-medium-007': 'かいのまちのおんがくかい・じゅうじのやさしいきろく',
  'reading-passage-n5-medium-008': 'さきのなまえのなおしかた・じゅういちじのやさしいきろく',
  'reading-passage-n5-medium-009': 'たくのこうえんのやくそく・いちじのやさしいきろく',
  'reading-passage-n5-medium-010': 'なおのあさのばす・にじのやさしいきろく',
  'reading-passage-n5-medium-011': 'はるのしゃしんのせいり・さんじのやさしいきろく',
  'reading-passage-n5-medium-012': 'まいのほんのよやく・よじのやさしいきろく',
};

const localGrammarReadings: Record<string, string> = {
  'grammar-n4-ato-de': '～あとで',
  'grammar-n4-baai-wa': '～ばあいは',
};

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function sentences(content: string): string[] {
  return content.match(/[^。！？]+[。！？]?/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [content];
}

function sentencePairs(text: string, reading: string): ReadingOption[] {
  const writtenSentences = sentences(text);
  const readingSentences = sentences(reading);
  if (writtenSentences.length !== readingSentences.length) {
    throw new Error('The local passage and its reviewed reading do not have matching sentences.');
  }
  return writtenSentences.map((sentence, index) => ({ text: sentence, reading: readingSentences[index]! }));
}

function placeCorrectOption(
  correct: ReadingOption,
  candidates: ReadingOption[],
  correctIndex: number,
): { options: [string, string, string, string]; readings: [string, string, string, string] } {
  const seen = new Set([correct.text]);
  const distractors = candidates.filter((candidate) => {
    if (seen.has(candidate.text)) return false;
    seen.add(candidate.text);
    return true;
  }).slice(0, 3);
  const fallback = [
    { text: 'これはかかれていません。', reading: 'これはかかれていません。' },
    { text: 'このことはでてきません。', reading: 'このことはでてきません。' },
    { text: 'このせつめいはありません。', reading: 'このせつめいはありません。' },
  ];
  while (distractors.length < 3) distractors.push(fallback[distractors.length]!);
  const options = [...distractors];
  options.splice(correctIndex, 0, correct);
  return {
    options: options.map((option) => option.text) as [string, string, string, string],
    readings: options.map((option) => option.reading) as [string, string, string, string],
  };
}

function vocabularyIdsInSentence(sentence: string, vocabulary: DailyReading['targetVocabulary']): string[] {
  return vocabulary
    .filter((item) => sentence.includes(item.word))
    .map((item) => item.sourceItemId)
    .slice(0, 4);
}

/**
 * Builds an offline Daily Reading exclusively from the approved curriculum
 * bundle. Selection is stable for a learner's local date and JLPT level.
 */
export function buildLocalDailyReading(
  date: string,
  level: CurriculumLevel,
  context: DailyReadingLearningContext,
): DailyReading {
  const bundle = loadBundledCurriculum();
  const passages = bundle.readingPassages.filter((passage) => passage.level === level);
  if (!passages.length) throw new Error('No local reading is available for this level.');

  const seed = Math.abs(dayNumber(date));
  const passage = passages[seed % passages.length]!;
  const titleReading = localTitleReadings[passage.id];
  if (!titleReading) throw new Error(`The local title reading is missing for ${passage.id}.`);
  const otherPassages = passages.filter((candidate) => candidate.id !== passage.id);
  const passageSentences = sentencePairs(passage.japanese, passage.reading);
  const itemById = new Map(bundle.items.map((item) => [item.id, item]));
  const newVocabularyIds = new Set(context.newVocabularyCandidates.map((item) => item.id));

  const targetVocabulary = passage.vocabularyIds.flatMap((id) => {
    const item = itemById.get(id);
    if (!item || item.type !== 'vocabulary' || !item.reading || !item.meaning) return [];
    return [{
      sourceItemId: item.id,
      word: item.title,
      reading: item.reading,
      meaning: item.meaning,
      isNew: newVocabularyIds.has(item.id),
    }];
  }).slice(0, 9);

  const targetGrammar = passage.grammarIds.flatMap((id) => {
    const item = itemById.get(id);
    if (!item || item.type !== 'grammar' || !item.meaning) return [];
    return [{ sourceItemId: item.id, pattern: item.title, reading: item.reading ?? localGrammarReadings[item.id], meaning: item.meaning }];
  }).slice(0, 2);

  const wholePassage = { text: passage.japanese, reading: passage.reading };
  const firstSentence = passageSentences[0] ?? wholePassage;
  const lastSentence = passageSentences.at(-1) ?? wholePassage;
  const middleSentence = passageSentences[Math.floor(passageSentences.length / 2)] ?? wholePassage;
  const outsideSentences = otherPassages
    .slice(0, 6)
    .map((candidate) => {
      const candidateSentences = sentencePairs(candidate.japanese, candidate.reading);
      return candidateSentences[Math.floor(candidateSentences.length / 2)] ?? { text: candidate.japanese, reading: candidate.reading };
    });

  const firstOptions = placeCorrectOption(firstSentence, passageSentences.slice(1, 5), seed % 4);
  const detailOptions = placeCorrectOption(middleSentence, outsideSentences, (seed + 1) % 4);
  const lastOptions = placeCorrectOption(lastSentence, passageSentences.slice(0, 4), (seed + 2) % 4);

  const questions: DailyReadingQuestion[] = [
    {
      id: `local-${date}-${level.toLowerCase()}-first`,
      question: '文章の最初に書いてあることはどれですか。',
      questionReading: 'ぶんしょうのさいしょにかいてあることはどれですか。',
      options: firstOptions.options,
      optionReadings: firstOptions.readings,
      correctAnswer: seed % 4,
      explanation: `文章の最初には「${firstSentence.text}」と書いてあります。`,
      explanationReading: `ぶんしょうのさいしょには「${firstSentence.reading}」とかいてあります。`,
      targetVocabularyIds: vocabularyIdsInSentence(firstSentence.text, targetVocabulary),
    },
    {
      id: `local-${date}-${level.toLowerCase()}-detail`,
      question: 'この文章に書いてあることはどれですか。',
      questionReading: 'このぶんしょうにかいてあることはどれですか。',
      options: detailOptions.options,
      optionReadings: detailOptions.readings,
      correctAnswer: (seed + 1) % 4,
      explanation: `本文には「${middleSentence.text}」と書いてあります。`,
      explanationReading: `ほんぶんには「${middleSentence.reading}」とかいてあります。`,
      targetVocabularyIds: vocabularyIdsInSentence(middleSentence.text, targetVocabulary),
    },
    {
      id: `local-${date}-${level.toLowerCase()}-last`,
      question: '文章の最後に書いてあることはどれですか。',
      questionReading: 'ぶんしょうのさいごにかいてあることはどれですか。',
      options: lastOptions.options,
      optionReadings: lastOptions.readings,
      correctAnswer: (seed + 2) % 4,
      explanation: `文章の最後には「${lastSentence.text}」と書いてあります。`,
      explanationReading: `ぶんしょうのさいごには「${lastSentence.reading}」とかいてあります。`,
      targetVocabularyIds: vocabularyIdsInSentence(lastSentence.text, targetVocabulary),
    },
  ];

  return {
    id: `daily-reading-${date}-${level.toLowerCase()}`,
    date,
    level,
    type: 'diary',
    title: passage.title,
    titleReading,
    content: passage.japanese,
    contentReading: passage.reading,
    targetVocabulary,
    targetGrammar,
    questions,
    generatedAt: new Date().toISOString(),
  };
}
