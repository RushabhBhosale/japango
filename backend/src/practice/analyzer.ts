import { AiServerError } from '../ai/errors';
import type { AiProvider } from '../ai/types';
import {
  practiceAnalysisBatchSchema,
  type PracticeAnalysisBatch,
  type PracticeAnalysisRequest,
} from './schemas';

function extractJson(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/u);
    if (!match) throw new AiServerError('INVALID_RESPONSE', true, 'Practice analysis returned invalid data.');
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      throw new AiServerError('INVALID_RESPONSE', true, 'Practice analysis returned invalid data.');
    }
  }
}

function normalizeEvidence(value: string): string {
  return value.toLocaleLowerCase('ja-JP').replace(/[\s。、！？!?「」『』"'.,]/gu, '');
}

function learnerText(transcript: string): string {
  const rolePattern = /^(USER|ASSISTANT):\s*$/gimu;
  const matches = [...transcript.matchAll(rolePattern)];
  return matches.flatMap((match, index) => {
    if (match[1]?.toUpperCase() !== 'USER') return [];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? transcript.length;
    return [transcript.slice(start, end)];
  }).join('\n');
}

export function practiceAnalysisSystemPrompt(): string {
  return `You analyze Japanese practice conversations for JapanGo. Return JSON only, exactly matching the requested shape.

Rules:
- Analyze only learner text marked USER. Assistant replies are evidence about corrections, not learner performance.
- Preserve explicit structured metadata when it is supported by the transcript, but do not depend on metadata being present.
- A correction may be recorded as a mistake, but do not label every one-off correction as a weak skill.
- Put an item in weakGrammar, weakVocabulary, or weakKanji only when it repeats in supplied history, appears more than once in the new sessions, or has strong direct evidence. Repeated mistakes matter significantly more than a single mistake.
- Use confidence conservatively. Do not invent corrections, readings, meanings, strengths, or topics.
- curriculumLinks may reference only an exact ID from curriculumCandidates. Omit a link when no candidate is clearly supported. Each weak or strong link's key must be the human-readable analyzed skill, not the ID.
- A strong link requires clear correct learner usage; assistant text is not successful learner usage.
- recurringMistakes must reflect repetition across the supplied existingEvidence or new sessions.
- Keep suggestedReview specific, short, and useful.

Return: {"analyses":[{"sessionId":"...","analysis":{"mistakes":[{"original":"...","corrected":"...","category":"grammar|vocabulary|kanji|particle|conjugation|naturalness","explanation":"...","confidence":0.0}],"weakGrammar":[],"weakVocabulary":[],"weakKanji":[],"learnedVocabulary":[{"word":"...","reading":"...","meaning":"..."}],"strengths":[],"recurringMistakes":[],"suggestedReview":[],"topics":[]},"curriculumLinks":[{"type":"grammar|vocabulary|kanji","key":"...","curriculumItemId":"candidate-id","evidence":"weak|strong"}]}]}. Include exactly one analysis for every input session and no others.`;
}

function validateAgainstRequest(value: PracticeAnalysisBatch, request: PracticeAnalysisRequest): PracticeAnalysisBatch {
  const sessionById = new Map(request.sessions.map((session) => [session.id, session]));
  const candidateById = new Map(request.curriculumCandidates.map((candidate) => [candidate.id, candidate]));
  const returned = new Set<string>();
  for (const result of value.analyses) {
    const session = sessionById.get(result.sessionId);
    if (!session || returned.has(result.sessionId)) {
      throw new AiServerError('INVALID_RESPONSE', true, 'Practice analysis referenced an unexpected conversation.');
    }
    returned.add(result.sessionId);
    const normalizedLearnerText = normalizeEvidence(learnerText(session.transcript));
    for (const mistake of result.analysis.mistakes) {
      const original = normalizeEvidence(mistake.original);
      if (!original || !normalizedLearnerText.includes(original)) {
        throw new AiServerError('INVALID_RESPONSE', true, 'Practice analysis attributed unsupported text to the learner.');
      }
    }
    for (const link of result.curriculumLinks) {
      const candidate = candidateById.get(link.curriculumItemId);
      if (!candidate || candidate.type !== link.type) {
        throw new AiServerError('INVALID_RESPONSE', true, 'Practice analysis referenced unsupported curriculum.');
      }
    }
  }
  if (returned.size !== sessionById.size) {
    throw new AiServerError('INVALID_RESPONSE', true, 'Practice analysis was incomplete.');
  }
  return value;
}

export async function analyzePracticeSessions(
  request: PracticeAnalysisRequest,
  providers: readonly AiProvider[],
  signal: AbortSignal,
): Promise<{ response: PracticeAnalysisBatch; fallbackUsed: boolean }> {
  let lastError: unknown;
  for (const [providerIndex, provider] of providers.entries()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await provider.complete({
          system: practiceAnalysisSystemPrompt(),
          user: JSON.stringify({
            ...request,
            correctionContext: attempt ? 'The prior response failed strict validation. Return the complete exact schema with only supplied session and curriculum IDs.' : undefined,
          }),
          signal,
          maxTokens: 4_000,
          temperature: 0.15,
        });
        const parsed = practiceAnalysisBatchSchema.parse(extractJson(raw));
        return { response: validateAgainstRequest(parsed, request), fallbackUsed: providerIndex > 0 };
      } catch (error) {
        lastError = error;
        if (signal.aborted) throw new AiServerError('CANCELLED', false, 'Practice analysis was cancelled.');
      }
    }
  }
  if (lastError instanceof AiServerError && !lastError.retryable) throw lastError;
  throw new AiServerError('ALL_PROVIDERS_FAILED', true, 'Practice analysis is temporarily unavailable. Nothing was imported.');
}
