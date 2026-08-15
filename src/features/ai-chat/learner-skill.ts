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

/** Applies bounded, deterministic updates; the model only supplies evidence. */
export function applyChatLearningSignals(
  userId: string,
  existingSkills: readonly LearnerSkill[],
  signals: readonly AiChatLearningSignal[],
  now: string,
): LearnerSkill[] {
  const skills = new Map(existingSkills.map((skill) => [skill.id, { ...skill, recentMistakes: [...skill.recentMistakes] }]));

  for (const signal of signals) {
    const id = skillId(signal.type, signal.key);
    const previous = skills.get(id) ?? createSkill(userId, signal.type, signal.key);
    const base = { ...previous, encounters: previous.encounters + 1, lastEncounteredAt: now };
    const delta = signal.result === 'strong'
      ? 0.045
      : signal.result === 'weak'
        ? -0.05
        : -0.075;
    skills.set(id, {
      ...base,
      mastery: clampMastery(base.mastery + delta),
      correctUses: base.correctUses + (signal.result === 'strong' ? 1 : 0),
      mistakes: base.mistakes + (signal.result === 'strong' ? 0 : 1),
      lastMistakeAt: signal.result === 'strong' ? base.lastMistakeAt : now,
    });
  }

  return [...skills.values()];
}

export function isMeaningfulChatMistake(mistake: AiChatDetectedMistake): boolean {
  return mistake.confidence >= meaningfulConfidence && mistake.category !== 'other';
}
