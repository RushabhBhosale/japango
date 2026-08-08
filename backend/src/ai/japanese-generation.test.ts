import { describe, expect, it, vi } from 'vitest';

import {
  JAPANESE_SENTENCE_CRITIC_PROMPT,
  JapaneseSentenceGenerationPipeline,
  deterministicJapaneseNaturalnessIssues,
  japaneseQualityGate,
  type JapaneseSentenceCritic,
} from './japanese-generation';

const passingCritic: JapaneseSentenceCritic = {
  grammar: 99,
  naturalness: 94,
  semanticPlausibility: 97,
  collocation: 96,
  levelAppropriate: 93,
  accepted: true,
  targetGrammarPreserved: true,
  issues: [],
  correctedSentence: null,
};

const input = {
  level: 'N4' as const,
  targetGrammar: { id: 'grammar-n4-tame-ni-purpose', pattern: '〜ために', meaning: 'in order to' },
  vocabulary: [
    { id: 'vocab-kaigi', japanese: '会議', reading: 'かいぎ', meaning: 'meeting' },
    { id: 'vocab-densha', japanese: '電車', reading: 'でんしゃ', meaning: 'train' },
  ],
  preferredRegister: 'polite' as const,
  references: [],
};

describe('deterministic Japanese naturalness preflight', () => {
  it.each([
    ['彼が計画を救ったと言ってもいいです。', '計画を救う'],
    ['この布は水みたいに冷たい。', 'comparison'],
    ['旅行には京都とか奈良とかへ行きたいです。', 'particle'],
    ['仕事をし終わるまで、電話に出られません。', '仕事が終わるまで'],
    ['おはようを見ましょう。', 'おはよう'],
  ])('flags the regression sentence %s', (japanese, expectedIssue) => {
    expect(deterministicJapaneseNaturalnessIssues(japanese).join(' ')).toContain(expectedIssue);
  });

  it.each([
    '仕事が終わるまで、電話に出られません。',
    '会議に間に合うために、一本早い電車に乗りました。',
    '旅行では、京都とか奈良とかに行きたいです。',
    'この薬は涼しい所に保管する必要があります。',
    '昨日は雨だったので、家で映画を見ました。',
  ])('does not flag the reviewed sentence %s', (japanese) => {
    expect(deterministicJapaneseNaturalnessIssues(japanese)).toEqual([]);
  });
});

describe('Japanese quality gate', () => {
  it('requires every threshold and target-grammar preservation', () => {
    expect(japaneseQualityGate(passingCritic)).toEqual({ accepted: true, issues: [] });
    const failed = japaneseQualityGate({ ...passingCritic, naturalness: 84 });
    expect(failed.accepted).toBe(false);
    expect(failed.issues).toContain('naturalness scored 84, below 85.');
  });

  it('rejects a deterministic issue even when the model critic says accepted', () => {
    const result = japaneseQualityGate(passingCritic, ['Unnatural collocation.']);
    expect(result.accepted).toBe(false);
    expect(result.issues).toContain('Unnatural collocation.');
  });
});

describe('Japanese sentence generation pipeline', () => {
  it('plans meaning first, revises a rejected sentence, and re-runs the independent critic', async () => {
    const responses = [
      {
        compatible: true,
        reason: null,
        situation: 'An employee is choosing a train before a morning meeting.',
        speaker: 'employee',
        listener: 'coworker',
        communicativeIntent: 'Explain why the speaker left earlier than usual.',
        targetGrammar: '〜ために',
        targetVocabulary: ['会議', '電車'],
        rejectedVocabulary: [],
        register: 'polite',
        level: 'N4',
      },
      {
        japanese: '会議に間に合うために、早い電車に乗りました。',
        reading: 'かいぎにまにあうために、はやいでんしゃにのりました。',
        translation: 'I took an early train to make the meeting.',
        targetGrammarPreserved: true,
      },
      {
        ...passingCritic,
        naturalness: 72,
        collocation: 70,
        accepted: false,
        issues: ['一本早い電車 is the natural choice for an earlier train.'],
        correctedSentence: '会議に間に合うために、一本早い電車に乗りました。',
      },
      {
        japanese: '会議に間に合うために、一本早い電車に乗りました。',
        reading: 'かいぎにまにあうために、いっぽんはやいでんしゃにのりました。',
        translation: 'I took an earlier train so I would arrive in time for the meeting.',
        targetGrammarPreserved: true,
      },
      passingCritic,
    ];
    const systems: string[] = [];
    const complete = vi.fn(async (call: { system: string }) => {
      systems.push(call.system);
      return JSON.stringify(responses.shift());
    });
    const rejected = vi.fn();
    const result = await new JapaneseSentenceGenerationPipeline({ complete }, rejected)
      .generate(input, new AbortController().signal);

    expect(result).toMatchObject({
      compatible: true,
      japanese: '会議に間に合うために、一本早い電車に乗りました。',
      metadata: {
        attempts: 2,
        quality: {
          grammar: 99,
          naturalness: 94,
          semanticPlausibility: 97,
          collocation: 96,
          levelAppropriate: 93,
        },
      },
    });
    expect(complete).toHaveBeenCalledTimes(5);
    expect(systems[2]).toBe(JAPANESE_SENTENCE_CRITIC_PROMPT);
    expect(systems[4]).toBe(JAPANESE_SENTENCE_CRITIC_PROMPT);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({
      sentence: '会議に間に合うために、早い電車に乗りました。',
    }));
  });

  it('returns an explicit compatibility failure without generating Japanese', async () => {
    const complete = vi.fn(async () => JSON.stringify({
      compatible: false,
      reason: 'The supplied constraint cannot demonstrate the target grammar naturally.',
      situation: null,
      speaker: null,
      listener: null,
      communicativeIntent: null,
      targetGrammar: '〜ために',
      targetVocabulary: [],
      rejectedVocabulary: [{ japanese: 'おはよう', reason: 'It cannot express a purpose with the requested action.' }],
      register: 'polite',
      level: 'N4',
    }));
    const result = await new JapaneseSentenceGenerationPipeline({ complete })
      .generate(input, new AbortController().signal);

    expect(result).toEqual({
      compatible: false,
      reason: 'The supplied constraint cannot demonstrate the target grammar naturally.',
      rejectedVocabulary: [{ japanese: 'おはよう', reason: 'It cannot express a purpose with the requested action.' }],
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
