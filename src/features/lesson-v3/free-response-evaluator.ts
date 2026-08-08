import { askAiTeacher } from '@/features/ai/teacher-service';

import {
  fallbackEpisodeOneLanguageFeedback,
  type EpisodeOneConversationPhase,
  type EpisodeOneLanguageFeedback,
} from './episode-one-conversation';
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

// The language evaluator is deliberately separate from Yuki's story router.
// It may refine a correction, but cannot change the learner's story path.
export async function evaluateEpisodeOneLanguage(
  answer: string,
  phase: EpisodeOneConversationPhase,
  understood: boolean,
): Promise<EpisodeOneLanguageFeedback> {
  const fallback = fallbackEpisodeOneLanguageFeedback(answer, phase, understood);
  if (!understood || !process.env.EXPO_PUBLIC_API_BASE_URL) return fallback;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const prompt = phase === 'availability'
      ? 'Reply naturally to a new friend asking whether you are free tomorrow. The reply may be free, afternoon-only, working, or unavailable.'
      : 'Tell a new friend roughly what time work finishes so you can make plans.';
    const result = await askAiTeacher('writing_check', {
      learnerLevel: 'N5',
      question: {
        prompt,
        userAnswer: answer,
        correctAnswer: phase === 'availability' ? 'うん、ひまだよ！ / 午後ならひまだよ。 / 明日は仕事がある。' : '6時に終わるよ。',
        canonicalExplanation: 'Check intended meaning, grammar, naturalness, and casual-friendly register. Do not give story advice or roleplay a character.',
      },
    }, answer, controller.signal);
    const correction = result.response.corrections?.[0];
    if (result.source !== 'network' || !correction) return fallback;
    return {
      title: correction.category === 'incorrect' ? 'Small correction' : 'A more natural option',
      feedback: correction.explanation,
      suggestedResponse: correction.corrected,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
