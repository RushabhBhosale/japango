import type {
  V3Episode,
  V3JapaneseLine,
  V3JapaneseText,
  V3LearningObjective,
  V3Scene,
} from '@/types/lesson-v3';

import episodePracticeBankJson from './data/episode-grammar-practice.json';

export type FuriganaText = string;

interface SourcedSentence {
  japanese: string;
  reading: string;
  english: string;
  tokens: {
    surface: string;
    reading?: string;
  }[];
}

interface SourcedPracticeOption {
  id: string;
  sentenceId?: string;
  text?: string;
  correct: boolean;
  feedback: string;
}

interface SourcedPracticeQuestion {
  id: string;
  prompt: string;
  explanation: string;
  contextSentenceId?: string;
  options: SourcedPracticeOption[];
}

interface EpisodePracticeBank {
  questionsByGrammarId: Record<string, SourcedPracticeQuestion[]>;
  sentences: Record<string, SourcedSentence>;
}

const episodePracticeBank = episodePracticeBankJson as unknown as EpisodePracticeBank;

export interface EpisodeConcept {
  id: string;
  pattern: string;
  reading: string;
  meaning: string;
  example: FuriganaText;
  exampleMeaning: string;
  formation?: string;
  usageNote?: string;
  commonMistake?: string;
}

export interface EpisodeKeyword {
  id: string;
  japanese: string;
  reading: string;
  meaning: string;
}

export interface EpisodeSentence {
  text: FuriganaText;
  meaning?: string;
}

export interface AuthoredEpisodeDefinition {
  number: number;
  level: 'N5' | 'N4';
  titleJapanese: string;
  titleEnglish: string;
  opening: string;
  concepts: EpisodeConcept[];
  curriculumGrammarIds: string[];
  keywords: EpisodeKeyword[];
  dialogue: [EpisodeSentence, EpisodeSentence];
  comprehension: {
    prompt: string;
    correct: string;
    distractors: [string, string];
    explanation: string;
  };
  build: {
    prompt: string;
    parts: string[];
    answer: FuriganaText;
    meaning: string;
    explanation: string;
  };
  exam: {
    format: string;
    prompt: string;
    context: FuriganaText;
    options: [FuriganaText, FuriganaText, FuriganaText];
    correctIndex: 0 | 1 | 2;
    explanation: string;
  };
  continuation: EpisodeSentence;
  nextHook: string;
}

const kanjiPattern = /[\u3400-\u9fff々ヶ]/u;
const annotatedKanjiPattern = /([\u3400-\u9fff々ヶ]+)\[([^\]]+)\]/gu;

/**
 * Parses lightweight authoring markup such as `新宿[しんじゅく]へ行[い]く`.
 * Every kanji run must have an adjacent reading. Refusing incomplete markup
 * keeps missing furigana from silently reaching a learner.
 */
export function furiganaText(
  markedText: FuriganaText,
  keywords: readonly EpisodeKeyword[] = [],
): V3JapaneseText {
  const tokens: V3JapaneseText['tokens'] = [];
  let raw = '';
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of markedText.matchAll(annotatedKanjiPattern)) {
    const matchIndex = match.index ?? 0;
    const plain = markedText.slice(cursor, matchIndex);
    if (kanjiPattern.test(plain)) {
      throw new Error(`Missing furigana before “${match[0]}” in: ${markedText}`);
    }
    if (plain) {
      raw += plain;
      tokens.push({ id: `plain-${tokenIndex}`, kind: 'plain', surface: plain, kanjiIds: [] });
      tokenIndex += 1;
    }

    const surface = match[1];
    const reading = match[2];
    const keyword = keywords.find((candidate) => candidate.japanese === surface);
    raw += surface;
    tokens.push({
      id: `word-${tokenIndex}-${surface}`,
      kind: 'word',
      surface,
      reading,
      vocabularyId: keyword?.id,
      kanjiIds: [...surface].filter((character) => kanjiPattern.test(character)).map((character) => `kanji-${character}`),
    });
    tokenIndex += 1;
    cursor = matchIndex + match[0].length;
  }

  const trailing = markedText.slice(cursor);
  if (kanjiPattern.test(trailing)) {
    throw new Error(`Missing furigana in: ${markedText}`);
  }
  if (trailing) {
    raw += trailing;
    tokens.push({ id: `plain-${tokenIndex}`, kind: 'plain', surface: trailing, kanjiIds: [] });
  }

  return { raw, tokens };
}

function line(sentence: EpisodeSentence | FuriganaText, keywords: readonly EpisodeKeyword[]): V3JapaneseLine {
  const value = typeof sentence === 'string' ? { text: sentence } : sentence;
  return { text: furiganaText(value.text, keywords), englishHelp: value.meaning };
}

/** Source sentences are pre-tokenized from their reviewed corpus reading.
 * This keeps furigana directly above each kanji word, rather than above a
 * whole sentence. */
function sourcedLine(sentence: SourcedSentence): V3JapaneseLine {
  const raw = sentence.tokens.map(({ surface }) => surface).join('');
  if (raw !== sentence.japanese) {
    throw new Error(`Source tokens do not reconstruct: ${sentence.japanese}`);
  }

  return {
    text: {
      raw,
      tokens: sentence.tokens.map((token, index) => {
        const hasKanji = kanjiPattern.test(token.surface);
        if (hasKanji && !token.reading) {
          throw new Error(`Missing source furigana for “${token.surface}” in: ${sentence.japanese}`);
        }
        return hasKanji
          ? {
              id: `source-word-${index}-${token.surface}`,
              kind: 'word' as const,
              surface: token.surface,
              reading: token.reading,
              kanjiIds: [...token.surface].filter((character) => kanjiPattern.test(character)).map((character) => `kanji-${character}`),
            }
          : {
              id: `source-plain-${index}`,
              kind: 'plain' as const,
              surface: token.surface,
              kanjiIds: [],
            };
      }),
    },
    englishHelp: sentence.english,
  };
}

function shuffledChoiceIndexes(number: number): [number, number, number] {
  if (number % 3 === 0) return [1, 2, 0];
  if (number % 3 === 1) return [2, 0, 1];
  return [0, 1, 2];
}

function objectives(definition: AuthoredEpisodeDefinition): V3LearningObjective[] {
  return [
    ...definition.concepts.map((concept) => ({
      id: concept.id,
      kind: 'grammar' as const,
      japanese: concept.pattern,
      reading: concept.reading,
      meaning: concept.meaning,
    })),
    ...definition.keywords.map((keyword) => ({
      id: keyword.id,
      kind: 'vocabulary' as const,
      japanese: keyword.japanese,
      reading: keyword.reading,
      meaning: keyword.meaning,
    })),
  ];
}

function orderedLabels(
  number: number,
  correct: string,
  distractors: [string, string],
): { id: string; label: string; correct: boolean; feedback: string }[] {
  const values = [correct, ...distractors];
  return shuffledChoiceIndexes(number).map((sourceIndex, index) => ({
    id: `option-${index + 1}`,
    label: values[sourceIndex],
    correct: sourceIndex === 0,
    feedback: sourceIndex === 0
      ? 'Correct. You matched both the form and its function in context.'
      : 'Look again at the form, speaker viewpoint, and the ending of the sentence.',
  }));
}

/** Eight retrievals per target move from noticing to independent exam recall. */
function conceptPracticeScenes(
  definition: AuthoredEpisodeDefinition,
  concept: EpisodeConcept,
  conceptIndex: number,
): V3Scene[] {
  const other = definition.concepts[(conceptIndex + 1) % definition.concepts.length] ?? concept;
  const base = `pattern-${conceptIndex + 1}`;
  const context = line({ text: concept.example, meaning: concept.exampleMeaning }, definition.keywords);
  const neutralSentence = line({ text: '明日[あした]、駅[えき]で友達[ともだち]に会[あ]います。', meaning: 'Tomorrow, I will meet a friend at the station.' }, definition.keywords);
  const sentenceOrder = shuffledChoiceIndexes(definition.number + conceptIndex);
  const sentenceValues = [context, line({ text: other.example, meaning: other.exampleMeaning }, definition.keywords), neutralSentence];

  return [
    {
      id: `${base}-01-notice`, type: 'interaction', interaction: 'meaningCheck',
      prompt: `1/8 · Notice the form: which target is doing the important work here?`, context,
      learnedItemIds: [concept.id],
      options: orderedLabels(definition.number, concept.pattern, [other.pattern, 'No target pattern is present.']),
    },
    {
      id: `${base}-02-meaning`, type: 'interaction', interaction: 'meaningCheck',
      prompt: '2/8 · Choose the meaning that fits this sentence.', context,
      learnedItemIds: [concept.id],
      options: orderedLabels(definition.number + 1, concept.exampleMeaning, [other.exampleMeaning, 'The sentence gives the opposite sequence or viewpoint.']),
    },
    {
      id: `${base}-03-function`, type: 'interaction', interaction: 'meaningCheck',
      prompt: `3/8 · What job does ${concept.pattern} perform?`,
      learnedItemIds: [concept.id],
      options: orderedLabels(definition.number + 2, concept.meaning, [other.meaning, 'It only makes the sentence more polite and adds no meaning.']),
    },
    {
      id: `${base}-04-example`, type: 'interaction', interaction: 'meaningCheck',
      prompt: `4/8 · Which sentence is the clearest natural example of ${concept.pattern}?`,
      learnedItemIds: [concept.id],
      options: sentenceOrder.map((sourceIndex, index) => ({
        id: `sentence-${index + 1}`,
        line: sentenceValues[sourceIndex],
        correct: sourceIndex === 0,
        feedback: sourceIndex === 0
          ? `Exactly. This sentence uses ${concept.pattern} for “${concept.meaning}.”`
          : `That sentence is natural, but it demonstrates a different structure.`,
      })),
    },
    {
      id: `${base}-05-contrast`, type: 'interaction', interaction: 'meaningCheck',
      prompt: `5/8 · Choose ${concept.pattern}, not ${other.pattern}.`, context,
      learnedItemIds: [concept.id],
      options: orderedLabels(definition.number + 4, concept.pattern, [other.pattern, 'Both always mean exactly the same thing.']),
    },
    {
      id: `${base}-06-usage`, type: 'interaction', interaction: 'meaningCheck',
      prompt: '6/8 · In which situation would this form be the best choice?',
      learnedItemIds: [concept.id],
      options: orderedLabels(definition.number + 5, concept.usageNote ?? concept.meaning, [other.usageNote ?? other.meaning, 'When listing an unrelated name with no predicate.']),
    },
    {
      id: `${base}-07-listen`, type: 'interaction', interaction: 'meaningCheck',
      prompt: '7/8 · Listening-style check: play the line, then choose what the speaker communicates.', context,
      learnedItemIds: [concept.id],
      options: orderedLabels(definition.number + 6, concept.exampleMeaning, [other.exampleMeaning, 'The speaker asks for a word-for-word translation.']),
    },
    {
      id: `${base}-08-recall`, type: 'interaction', interaction: 'meaningCheck',
      prompt: `8/8 · Final recall: which form expresses “${concept.meaning}”?`,
      learnedItemIds: [concept.id],
      options: orderedLabels(definition.number + 7, concept.pattern, [other.pattern, 'A plain noun with no grammar ending.']),
    },
  ];
}

function conceptLessonScenes(
  definition: AuthoredEpisodeDefinition,
  concept: EpisodeConcept,
  conceptIndex: number,
): V3Scene[] {
  const other = definition.concepts[(conceptIndex + 1) % definition.concepts.length] ?? concept;
  const explanation = [
    `Core function: ${concept.meaning}.`,
    concept.formation ?? `Formation: notice exactly where ${concept.pattern} attaches in the model sentence, then keep the same verb, adjective, or noun base in your own sentence.`,
    concept.usageNote ?? `Use it when you need to ${concept.meaning}.`,
    `Contrast: ${other.pattern} is used to ${other.meaning}.`,
    `Common trap: ${concept.commonMistake ?? `do not select ${concept.pattern} only because one English keyword looks familiar; confirm the Japanese form and the relationship between both clauses.`}`,
  ].join(' ');

  return [
    {
      id: `pattern-${conceptIndex + 1}-guide`,
      type: 'teachingMoment',
      title: `${concept.pattern} — form, function, and contrast`,
      contrast: [
        line({ text: concept.example, meaning: concept.exampleMeaning }, definition.keywords),
        line({ text: other.example, meaning: other.exampleMeaning }, definition.keywords),
      ],
      explanation,
      learnedItemIds: [concept.id],
    },
    ...conceptPracticeScenes(definition, concept, conceptIndex),
    {
      id: `pattern-${conceptIndex + 1}-story-beat`,
      type: 'chat',
      learnedItemIds: [concept.id],
      messages: [{
        id: `pattern-${conceptIndex + 1}-model`,
        sender: 'yuki',
        line: line({ text: concept.example, meaning: concept.exampleMeaning }, definition.keywords),
      }],
    },
  ];
}

function canonicalGrammarPracticeScenes(definition: AuthoredEpisodeDefinition): V3Scene[] {
  return definition.curriculumGrammarIds.flatMap((grammarId, grammarIndex) => {
    const questions = episodePracticeBank.questionsByGrammarId[grammarId];
    if (!questions || questions.length < 8) {
      throw new Error(`Episode ${definition.number} requires eight questions for ${grammarId}.`);
    }
    return questions.slice(0, 8).map((question, questionIndex): V3Scene => {
      const contextSentence = question.contextSentenceId ? episodePracticeBank.sentences[question.contextSentenceId] : undefined;
      return {
        id: `canonical-${grammarIndex + 1}-${questionIndex + 1}-${question.id}`,
        type: 'interaction',
        interaction: 'meaningCheck',
        prompt: `Deep practice ${questionIndex + 1}/8 · ${question.prompt}`,
        context: contextSentence ? sourcedLine(contextSentence) : undefined,
        learnedItemIds: [grammarId],
        options: question.options.map((option) => {
          const optionSentence = option.sentenceId ? episodePracticeBank.sentences[option.sentenceId] : undefined;
          return {
            id: option.id,
            line: optionSentence ? sourcedLine(optionSentence) : undefined,
            label: optionSentence ? undefined : option.text,
            correct: option.correct,
            feedback: option.correct ? `${option.feedback} ${question.explanation}` : option.feedback,
          };
        }),
      };
    });
  });
}

export function createAuthoredEpisode(definition: AuthoredEpisodeDefinition): V3Episode {
  const learnedItemIds = [...definition.concepts.map(({ id }) => id), ...definition.keywords.map(({ id }) => id)];
  const comprehensionLabels = [definition.comprehension.correct, ...definition.comprehension.distractors];
  const comprehensionOrder = shuffledChoiceIndexes(definition.number);

  return {
    id: `episode-${definition.number}`,
    episodeNumber: definition.number,
    level: definition.level,
    arcId: definition.level === 'N5' ? 'new-life-in-japan' : 'building-a-life-in-japan',
    arcTitleJapanese: definition.level === 'N5' ? '日本での新生活' : '日本で広がる毎日',
    arcTitleEnglish: definition.level === 'N5' ? 'New Life in Japan' : 'A Wider Life in Japan',
    titleJapanese: definition.titleJapanese,
    titleEnglish: definition.titleEnglish,
    estimatedMinutes: 24 + definition.curriculumGrammarIds.length * 4,
    curriculumGrammarIds: definition.curriculumGrammarIds,
    examSkills: [definition.exam.format, 'contextual-grammar', 'listening-comprehension'],
    characters: [
      {
        id: 'yuki',
        nameJapanese: 'ゆき',
        nameEnglish: 'Yuki',
        avatarText: 'ゆ',
        description: 'A close friend who speaks naturally and adjusts to the learner without sounding like a textbook.',
      },
    ],
    learningObjectives: objectives(definition),
    scenes: [
      {
        id: 'opening',
        type: 'story',
        eyebrow: `${definition.level} · EPISODE ${definition.number}`,
        title: definition.titleEnglish,
        body: definition.opening,
      },
      {
        id: 'story-dialogue',
        type: 'chat',
        learnedItemIds,
        messages: definition.dialogue.map((message, index) => ({
          id: `dialogue-${index + 1}`,
          sender: 'yuki' as const,
          line: line(message, definition.keywords),
        })),
      },
      {
        id: 'story-check',
        type: 'interaction',
        interaction: 'meaningCheck',
        prompt: definition.comprehension.prompt,
        context: line(definition.dialogue[1], definition.keywords),
        options: comprehensionOrder.map((sourceIndex, optionIndex) => ({
          id: `meaning-${optionIndex + 1}`,
          label: comprehensionLabels[sourceIndex],
          correct: sourceIndex === 0,
          feedback: sourceIndex === 0 ? definition.comprehension.explanation : 'That detail does not match Yuki’s message. Listen again for the time, particle, and verb ending.',
        })),
      },
      ...definition.concepts.flatMap((concept, conceptIndex) => conceptLessonScenes(definition, concept, conceptIndex)),
      ...canonicalGrammarPracticeScenes(definition),
      {
        id: 'guided-production',
        type: 'sentenceBuild',
        prompt: definition.build.prompt,
        parts: definition.build.parts.map((text, index) => ({ id: `part-${index + 1}`, text })),
        correctOrder: definition.build.parts.map((_, index) => `part-${index + 1}`),
        answer: line({ text: definition.build.answer, meaning: definition.build.meaning }, definition.keywords),
        explanation: definition.build.explanation,
      },
      {
        id: 'story-continues',
        type: 'chat',
        messages: [{ id: 'continuation-1', sender: 'yuki', line: line(definition.continuation, definition.keywords) }],
      },
      {
        id: 'jlpt-check',
        type: 'interaction',
        interaction: 'meaningCheck',
        prompt: `${definition.exam.prompt} · JLPT practice: ${definition.exam.format}`,
        context: line(definition.exam.context, definition.keywords),
        options: definition.exam.options.map((option, index) => ({
          id: `exam-${index + 1}`,
          line: line(option, definition.keywords),
          correct: index === definition.exam.correctIndex,
          feedback: index === definition.exam.correctIndex ? definition.exam.explanation : 'This choice is grammatical in another context, but it does not fit the meaning and clues here.',
        })),
      },
      { id: 'complete', type: 'completion' },
    ],
    nextEpisode: {
      id: definition.number < 51 ? `episode-${definition.number + 1}` : undefined,
      titleJapanese: '次の挑戦',
      titleEnglish: 'The Next Challenge',
      setup: `The story continues after “${definition.titleEnglish}.”`,
      hook: definition.nextHook,
    },
  };
}

export function createAuthoredEpisodeSeries(definitions: readonly AuthoredEpisodeDefinition[]): V3Episode[] {
  return definitions.map((definition, index) => {
    const episode = createAuthoredEpisode(definition);
    const next = definitions[index + 1];
    if (!next) return episode;
    return {
      ...episode,
      nextEpisode: {
        ...episode.nextEpisode,
        id: `episode-${next.number}`,
        titleJapanese: next.titleJapanese,
        titleEnglish: next.titleEnglish,
      },
    };
  });
}
