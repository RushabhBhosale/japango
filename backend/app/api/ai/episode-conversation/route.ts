import { z } from 'zod';

import { AiOrchestrator, createServerProviderRegistry } from '../../../../src/ai/orchestrator';
import { AiServerError } from '../../../../src/ai/errors';
import { aiTeacherRequestSchema } from '../../../../src/ai/types';

const requestSchema = z.object({
  learnerReply: z.string().trim().min(1).max(240),
  availabilityTomorrow: z.enum(['free', 'afternoon-only', 'working', 'unavailable']).optional(),
  preferredMeetingTime: z.enum(['morning', 'afternoon', 'evening']).optional(),
  forceCheckpoint: z.boolean().optional(),
  requestId: z.string().min(1).max(100),
}).strict();

const responseSchema = z.object({
  replyJapanese: z.string().trim().min(1).max(240),
  next: z.enum(['follow-up', 'checkpoint']),
}).strict();

const requestsByClient = new Map<string, { count: number; resetAt: number }>();
const limitWindowMs = 60 * 60 * 1000;
const limitPerWindow = 30;

function allowed(request: Request): boolean {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const now = Date.now();
  const current = requestsByClient.get(client);
  if (!current || current.resetAt <= now) {
    requestsByClient.set(client, { count: 1, resetAt: now + limitWindowMs });
    return true;
  }
  if (current.count >= limitPerWindow) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request)) {
    return Response.json({ success: false, error: { code: 'RATE_LIMITED', retryable: true, userMessage: 'Yuki is busy right now. Please try again soon.' } }, { status: 429 });
  }

  try {
    const payload = requestSchema.parse(await request.json() as unknown);
    const storyContext = [
      'Fixed checkpoint: learner and Yuki make plans to meet at Shinjuku Station.',
      `Known availability tomorrow: ${payload.availabilityTomorrow ?? 'unknown'}.`,
      `Known preferred meeting time: ${payload.preferredMeetingTime ?? 'unknown'}.`,
      `This is the final turn before the fixed checkpoint: ${payload.forceCheckpoint ? 'yes' : 'no'}.`,
    ];
    const teacherRequest = aiTeacherRequestSchema.parse({
      feature: 'conversation',
      context: {
        learnerLevel: 'N5',
        item: {
          id: 'episode-1-yuki-meet-shinjuku',
          type: 'controlled-story-checkpoint',
          title: 'Episode 1: Making plans with Yuki',
          details: storyContext,
        },
        question: {
          prompt: 'Reply as Yuki at the current checkpoint.',
          userAnswer: payload.learnerReply,
          canonicalExplanation: 'The destination must remain a meeting at Shinjuku Station.',
        },
      },
      userInput: payload.learnerReply,
      requestId: payload.requestId,
      promptVersion: 'EPISODE_1_YUKI_CHECKPOINT_V1',
    });
    const result = await new AiOrchestrator(createServerProviderRegistry()).run(teacherRequest, request.signal);
    const action = result.response.followUpSuggestions?.[0] === 'ASK_FOLLOW_UP' ? 'follow-up' : 'checkpoint';
    const data = responseSchema.parse({ replyJapanese: result.response.answer, next: action });
    return Response.json({ success: true, data, meta: { fallbackUsed: result.fallbackUsed, latencyMs: result.latencyMs } });
  } catch (error) {
    const safe = error instanceof AiServerError ? error : new AiServerError('UNKNOWN', false, 'Yuki could not reply right now.');
    return Response.json({ success: false, error: { code: safe.code, retryable: safe.retryable, userMessage: safe.userMessage } }, { status: safe.code === 'INVALID_INPUT' ? 400 : 503 });
  }
}
