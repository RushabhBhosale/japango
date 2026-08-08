import { askAiTeacher } from '@/features/ai/teacher-service';

import { evaluateAcceptanceDeterministically, type FreeResponseEvaluation } from './free-response-fallback';

export interface FreeResponseEvaluator {
  evaluate(answer: string, intent: 'accept-invitation'): Promise<FreeResponseEvaluation>;
}

export const v3FreeResponseEvaluator: FreeResponseEvaluator = {
  async evaluate(answer, intent) {
    const fallback = evaluateAcceptanceDeterministically(answer);
    if (intent !== 'accept-invitation' || !fallback.accepted || !process.env.EXPO_PUBLIC_API_BASE_URL) return fallback;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const result = await askAiTeacher('writing_check', {
        learnerLevel: 'N5',
        question: {
          prompt: 'Accept a friendly invitation for tomorrow in a casual message.',
          userAnswer: answer,
          correctAnswer: 'うん、ひまだよ！ / いいね、行こう！',
          canonicalExplanation: 'Evaluate intended meaning, grammar, naturalness, and casual-friendly register.',
        },
      }, answer, controller.signal);
      const correction = result.response.corrections?.[0];
      if (result.source !== 'network' || !correction) return fallback;
      return {
        accepted: true,
        title: correction.category === 'incorrect' ? 'I understood you' : 'Almost there',
        feedback: correction.explanation,
        suggestedResponse: correction.corrected,
        source: 'ai',
      };
    } catch {
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  },
};
