import type { PracticeSkillProfile } from '@/types/google-practice';

export interface PracticeSkillEvidence {
  mistakes: number;
  successfulUses: number;
  practicedAt: string;
}

const priorEvidenceFloor = 4;

function clamp(value: number): number {
  return Math.max(0.05, Math.min(0.98, value));
}

/**
 * Updates mastery from accumulated evidence. The four-observation prior means
 * one imported correction moves a neutral skill from 0.50 to 0.45, while
 * repeated evidence changes confidence progressively rather than abruptly.
 */
export function updatePracticeSkillProfile(
  current: PracticeSkillProfile,
  evidence: PracticeSkillEvidence,
): PracticeSkillProfile {
  const mistakes = Math.max(0, Math.round(evidence.mistakes));
  const successfulUses = Math.max(0, Math.round(evidence.successfulUses));
  const newEvidence = mistakes + successfulUses;
  if (!newEvidence) return current;
  const priorWeight = Math.max(priorEvidenceFloor, current.encounters);
  const mistakeValue = 0.25;
  const successValue = 0.9;
  const mastery = (
    current.mastery * priorWeight
    + mistakes * mistakeValue
    + successfulUses * successValue
  ) / (priorWeight + newEvidence);
  return {
    ...current,
    mastery: clamp(mastery),
    mistakes: current.mistakes + mistakes,
    successfulUses: current.successfulUses + successfulUses,
    encounters: current.encounters + newEvidence,
    lastPracticedAt: evidence.practicedAt,
  };
}
