import type { AiChatScenario, LearnerSkill } from '@/types/ai-chat';

export type AiChatScenarioBlueprint = Pick<AiChatScenario, 'title' | 'setting' | 'goal' | 'targetGrammar' | 'targetVocabulary' | 'complication'>;

const scenarios: readonly AiChatScenarioBlueprint[] = [
  {
    title: 'Weekend café plan',
    setting: 'a neighbourhood café in Tokyo',
    goal: 'make loose weekend plans with a friend',
    targetGrammar: ['〜たら', 'potential form'],
    targetVocabulary: ['予定', '雨', '駅'],
    complication: 'the weather may change',
  },
  {
    title: 'After-work movie',
    setting: 'messages after a busy workday',
    goal: 'decide whether to see a film together',
    targetGrammar: ['〜てみる', 'casual past tense'],
    targetVocabulary: ['映画', '仕事', '時間'],
    complication: 'the last screening starts soon',
  },
  {
    title: 'Kyoto wish list',
    setting: 'chatting about a future trip to Kyoto',
    goal: 'share places and food each person wants to try',
    targetGrammar: ['〜たい', '〜と思う'],
    targetVocabulary: ['旅行', 'お寺', '料理'],
    complication: 'they only have a short weekend',
  },
  {
    title: 'Rainy-day backup',
    setting: 'making a flexible plan when it might rain',
    goal: 'suggest an indoor alternative naturally',
    targetGrammar: ['〜なら', '〜てもいい'],
    targetVocabulary: ['雨', '家', 'カフェ'],
    complication: 'the original plan was outdoors',
  },
];

function normalized(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/\s+/gu, ' ').trim();
}

function relevance(blueprint: AiChatScenarioBlueprint, skill: Pick<LearnerSkill, 'type' | 'key' | 'mastery' | 'mistakes'>): number {
  const key = normalized(skill.key);
  const targets = skill.type === 'grammar' ? blueprint.targetGrammar : blueprint.targetVocabulary;
  const exactOrPartial = targets.some((target) => {
    const candidate = normalized(target);
    return candidate.includes(key) || key.includes(candidate);
  });
  if (!exactOrPartial) return 0;
  return ((1 - skill.mastery) * 3) + Math.min(skill.mistakes, 10) * 0.2;
}

/** Picks a flexible social setting; it is prompt guidance, never a user-facing script. */
export function selectNextScenario(
  weaknesses: readonly Pick<LearnerSkill, 'type' | 'key' | 'mastery' | 'mistakes'>[],
): AiChatScenarioBlueprint {
  const ranked = scenarios.map((scenario, index) => ({
    scenario,
    index,
    score: weaknesses.reduce((sum, skill) => sum + relevance(scenario, skill), 0),
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.scenario ?? scenarios[0]!;
}
