import type { AiChatDetectedMistake, AiChatLearningSignal, LearnerSkill, LearnerSkillType } from '@/types/ai-chat';

const initialMastery = 0.5;
const meaningfulConfidence = 0.72;

function clampMastery(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function skillId(type: LearnerSkillType, key: string): string {
  return `${type}:${key.trim().toLocaleLowerCase('en-US')}`;
}

function createSkill(
  userId: string,
  type: LearnerSkillType,
  key: string,
): LearnerSkill {
  return {
    id: skillId(type, key),
    userId,
    type,
    key: key.trim(),
    mastery: initialMastery,
    encounters: 0,
    correctUses: 0,
    mistakes: 0,
    recentMistakes: [],
  };
}

function targetType(mistake: AiChatDetectedMistake): LearnerSkillType | undefined {
  if (!mistake.target) return undefined;
  if (mistake.category === 'kanji') return 'kanji';
  if (mistake.category === 'vocabulary') return 'vocabulary';
  return 'grammar';
}

/** Applies bounded, deterministic updates; the model only supplies evidence. */
export function applyChatLearningSignals(
  userId: string,
  existingSkills: readonly LearnerSkill[],
  signals: readonly AiChatLearningSignal[],
  mistakes: readonly AiChatDetectedMistake[],
  now: string,
): LearnerSkill[] {
  const skills = new Map(existingSkills.map((skill) => [skill.id, { ...skill, recentMistakes: [...skill.recentMistakes] }]));

  for (const signal of signals) {
    if (signal.confidence < meaningfulConfidence) continue;
    const id = skillId(signal.type, signal.target);
    const previous = skills.get(id) ?? createSkill(userId, signal.type, signal.target);
    const base = { ...previous, encounters: previous.encounters + 1, lastEncounteredAt: now };
    const delta = signal.result === 'strong'
      ? 0.055 * signal.confidence
      : signal.result === 'weak'
        ? -0.075 * signal.confidence
        : -0.012 * signal.confidence;
    skills.set(id, {
      ...base,
      mastery: clampMastery(base.mastery + delta),
      correctUses: base.correctUses + (signal.result === 'strong' ? 1 : 0),
      mistakes: base.mistakes + (signal.result === 'weak' ? 1 : 0),
      lastMistakeAt: signal.result === 'weak' ? now : base.lastMistakeAt,
    });
  }

  for (const mistake of mistakes) {
    if (mistake.confidence < meaningfulConfidence) continue;
    const type = targetType(mistake);
    if (!type || !mistake.target) continue;
    const id = skillId(type, mistake.target);
    const previous = skills.get(id) ?? createSkill(userId, type, mistake.target);
    const recentMistakes = [mistake.original, ...previous.recentMistakes.filter((value) => value !== mistake.original)].slice(0, 8);
    skills.set(id, {
      ...previous,
      encounters: previous.encounters + 1,
      mistakes: previous.mistakes + 1,
      mastery: clampMastery(previous.mastery - (0.05 * mistake.confidence)),
      lastEncounteredAt: now,
      lastMistakeAt: now,
      recentMistakes,
    });
  }

  return [...skills.values()];
}

export function isMeaningfulChatMistake(mistake: AiChatDetectedMistake): boolean {
  return mistake.confidence >= meaningfulConfidence && mistake.category !== 'naturalness';
}
