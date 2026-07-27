export interface AdaptiveQuestionRequest { learnerKey: string; level: 'N5' | 'N4'; canonicalTargetIds: string[]; requestedCount: number; }
export interface ValidatedAdaptiveQuestion { id: string; provenance: 'adaptive-user-specific'; canonicalTargetIds: string[]; discardable: true; }
export interface AdaptiveQuestionProvider { generateAdditionalQuestions(input: AdaptiveQuestionRequest): Promise<ValidatedAdaptiveQuestion[]>; }

export class CanonicalOnlyAdaptiveQuestionProvider implements AdaptiveQuestionProvider {
  async generateAdditionalQuestions(_input: AdaptiveQuestionRequest): Promise<ValidatedAdaptiveQuestion[]> { return []; }
}
