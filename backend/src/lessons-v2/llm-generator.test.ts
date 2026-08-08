import { describe, expect, it, vi } from 'vitest';

import type { AiProvider } from '../ai/types';
import {
  LESSON_CONTENT_CRITIC_PROMPT,
  LESSON_CONTENT_GENERATION_PROMPT,
  LESSON_SEMANTIC_PLANNING_PROMPT,
  LessonsV2LlmGenerator,
  generatedLessonContentSchema,
  lessonQualityGate,
  lessonSemanticPlanSchema,
  type LessonCriticResponse,
} from './llm-generator';

const assets = [
  { id: 'intro', kind: 'introduction', situation: 'Two coworkers are planning the morning.', speaker: 'narrator', listener: null, communicativeIntent: 'Introduce arriving on time.', targetGrammar: '〜ために', targetVocabulary: ['会議'], rejectedVocabulary: [], register: 'polite', level: 'N4', questionType: null },
  { id: 'dialogue-one', kind: 'dialogue_line', situation: 'At the station before work.', speaker: '田中さん', listener: '山田さん', communicativeIntent: 'Ask why the listener came early.', targetGrammar: '〜ために', targetVocabulary: ['会議'], rejectedVocabulary: [], register: 'polite', level: 'N4', questionType: null },
  { id: 'dialogue-two', kind: 'dialogue_line', situation: 'At the station before work.', speaker: '山田さん', listener: '田中さん', communicativeIntent: 'Explain taking an earlier train.', targetGrammar: '〜ために', targetVocabulary: ['会議', '電車'], rejectedVocabulary: [], register: 'polite', level: 'N4', questionType: null },
  { id: 'example-one', kind: 'grammar_example', situation: 'A student studies for a test.', speaker: 'student', listener: null, communicativeIntent: 'Explain a study purpose.', targetGrammar: '〜ために', targetVocabulary: [], rejectedVocabulary: [], register: 'polite', level: 'N4', questionType: null },
  { id: 'example-two', kind: 'grammar_example', situation: 'A traveler checks a route.', speaker: 'traveler', listener: null, communicativeIntent: 'Explain checking a map.', targetGrammar: '〜ために', targetVocabulary: [], rejectedVocabulary: [], register: 'polite', level: 'N4', questionType: null },
  { id: 'question-one', kind: 'question', situation: 'Someone prepares for rain.', speaker: 'learner', listener: null, communicativeIntent: 'Choose a natural purpose clause.', targetGrammar: '〜ために', targetVocabulary: [], rejectedVocabulary: [], register: 'polite', level: 'N4', questionType: 'grammar_cloze' },
  { id: 'question-two', kind: 'question', situation: 'Someone reads a station notice.', speaker: 'learner', listener: null, communicativeIntent: 'Identify why a train was chosen.', targetGrammar: '〜ために', targetVocabulary: ['電車'], rejectedVocabulary: [], register: 'polite', level: 'N4', questionType: 'short_reading' },
] as const;

const plan = lessonSemanticPlanSchema.parse({
  compatible: true,
  reason: null,
  lessonSituation: 'Coworkers prepare for a morning meeting and discuss travel choices.',
  communicativeGoal: 'Explain practical purposes with 〜ために.',
  assets,
});

const content = generatedLessonContentSchema.parse({
  title: '目的を自然に説明する',
  introduction: { assetId: 'intro', japanese: '今日は、目的を説明するときの「ために」を勉強します。', reading: 'きょうわ、もくてきをせつめいするときの「ために」をべんきょうします。', translation: 'Today we will study ために for explaining a purpose.', targetGrammarPreserved: true },
  dialogue: [
    { assetId: 'dialogue-one', speaker: '田中さん', japanese: '今日はずいぶん早いですね。', reading: 'きょうわずいぶんはやいですね。', translation: 'You are quite early today.', targetGrammarPreserved: true },
    { assetId: 'dialogue-two', speaker: '山田さん', japanese: '会議に間に合うために、一本早い電車に乗りました。', reading: 'かいぎにまにあうために、いっぽんはやいでんしゃにのりました。', translation: 'I took an earlier train so I would arrive in time for the meeting.', targetGrammarPreserved: true },
  ],
  grammarExamples: [
    { assetId: 'example-one', japanese: '試験に合格するために、毎日一時間勉強しています。', reading: 'しけんにごうかくするために、まいにちいちじかんべんきょうしています。', translation: 'I study for an hour every day in order to pass the exam.', targetGrammarPreserved: true },
    { assetId: 'example-two', japanese: '道に迷わないために、出かける前に地図を確認しました。', reading: 'みちにまよわないために、でかけるまえにちずをかくにんしました。', translation: 'I checked the map before leaving so I would not get lost.', targetGrammarPreserved: true },
  ],
  questions: [
    { assetId: 'question-one', type: 'grammar_cloze', testedSkill: 'Choose the purpose marker.', instructionJapanese: '文に合うものを一つ選んでください。', passageJapanese: null, promptJapanese: '日本で働く（　）、日本語を勉強しています。', choicesJapanese: ['ために', 'ながら', 'そうで', 'まで'], correctChoiceIndex: 0, correctExplanationEnglish: 'ために naturally marks working in Japan as the purpose of studying.', distractorExplanationsEnglish: ['This is the correct purpose marker.', 'ながら means while doing.', 'そうで does not mark purpose.', 'まで marks an endpoint.'], targetGrammarPreserved: true },
    { assetId: 'question-two', type: 'short_reading', testedSkill: 'Identify a stated purpose.', instructionJapanese: '文章を読んで、答えを一つ選んでください。', passageJapanese: '佐藤さんは会議に間に合うために、いつもより早く家を出ました。', promptJapanese: '佐藤さんはどうして早く家を出ましたか。', choicesJapanese: ['会議に間に合うため', '朝ご飯を買うため', '友達に会うため', '電車で寝るため'], correctChoiceIndex: 0, correctExplanationEnglish: 'The passage directly says the purpose was arriving in time for the meeting.', distractorExplanationsEnglish: ['This is stated in the passage.', 'Buying breakfast is not mentioned.', 'Meeting a friend is not mentioned.', 'Sleeping on the train is not mentioned.'], targetGrammarPreserved: true },
  ],
});

function criticFor(assetId: string): LessonCriticResponse['evaluations'][number] {
  return { assetId, grammar: 99, naturalness: 94, semanticPlausibility: 97, collocation: 96, levelAppropriate: 93, accepted: true, targetGrammarPreserved: true, issues: [] };
}

const critic: LessonCriticResponse = {
  accepted: true,
  evaluations: assets.map(({ id }) => criticFor(id)),
  lessonIssues: [],
};

const input = {
  level: 'N4',
  title: 'Purpose with ために',
  slug: 'purpose-with-tame-ni',
  objectives: ['Explain a practical purpose with 〜ために.'],
  sourceQuery: '〜ために purpose usage',
  sourceChunkIds: [],
  targetGrammar: [{ id: 'grammar-n4-tame-ni-purpose', pattern: '〜ために', meaning: 'in order to' }],
  vocabulary: [{ id: 'vocab-kaigi', japanese: '会議', reading: 'かいぎ', meaning: 'meeting' }, { id: 'vocab-densha', japanese: '電車', reading: 'でんしゃ', meaning: 'train' }],
  estimatedMinutes: 20,
  questionCount: 2,
};

describe('Lessons V2 LLM generation', () => {
  it('uses semantic planning, generation, and an independent critic before creating a draft', async () => {
    const responses = [plan, content, critic];
    const systems: string[] = [];
    const provider: AiProvider = {
      id: 'strong-primary',
      model: 'test-model',
      capabilities: { structuredOutput: true, streaming: false, supportsJapanese: true, supportsSystemMessages: true },
      complete: vi.fn(async ({ system }) => {
        systems.push(system);
        return JSON.stringify(responses.shift());
      }),
    };
    const references = [{ source: 'corpus' as const, referenceId: 'sentence-reference', japanese: '目標のために、毎日練習しています。', context: 'reviewed usage reference' }];
    const result = await new LessonsV2LlmGenerator([provider], async () => references)
      .generate(input, new AbortController().signal);

    expect(systems).toEqual([LESSON_SEMANTIC_PLANNING_PROMPT, LESSON_CONTENT_GENERATION_PROMPT, LESSON_CONTENT_CRITIC_PROMPT]);
    expect(result.compatible).toBe(true);
    if (!result.compatible) return;
    expect(result.draft.sections.map(({ kind }) => kind)).toEqual(['introduction', 'dialogue', 'grammar', 'quiz']);
    expect(result.draft.sections[3]?.questions).toHaveLength(2);
    expect(result.draft.sections[3]?.questions.every((question) => question.validationStatus === 'draft')).toBe(true);
    expect(result.generationMetadata).toMatchObject({ provider: 'strong-primary', model: 'test-model', attempts: 1, referenceIds: ['sentence-reference'] });
    expect(JSON.stringify(result.draft)).not.toContain('目標のために、毎日練習しています。');
  });

  it('rejects a known unnatural collocation even if the critic attempts to approve it', () => {
    const badContent = structuredClone(content);
    badContent.grammarExamples[0]!.japanese = '彼が計画を救ったと言ってもいいです。';
    const result = lessonQualityGate(plan, badContent, critic);
    expect(result.accepted).toBe(false);
    expect(result.issues.join(' ')).toContain('計画を救う');
  });
});
