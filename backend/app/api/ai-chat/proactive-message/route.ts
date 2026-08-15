import { z } from 'zod';

import { AiChatServerError } from '../../../../src/ai-chat/errors';
import { createOpenRouterChatProviders } from '../../../../src/ai-chat/provider';
import { AiChatService } from '../../../../src/ai-chat/service';

const requestSchema = z.object({
  learnerLevel: z.enum(['N5', 'N4']),
  conversation: z.object({
    summary: z.string().trim().min(1).max(1_500).optional(),
    recentMessages: z.array(z.object({ role: z.enum(['learner', 'character']), content: z.string().trim().min(1).max(1_200) }).strict()).max(20),
  }).strict(),
  scenario: z.object({ title: z.string().trim().min(1).max(120), setting: z.string().trim().min(1).max(180), goal: z.string().trim().min(1).max(180) }).strict().optional(),
  learningTargets: z.array(z.object({
    itemId: z.string().trim().min(1).max(160),
    type: z.enum(['grammar', 'vocabulary', 'kanji']),
    key: z.string().trim().min(1).max(160),
    reading: z.string().trim().min(1).max(160).optional(),
    meaning: z.string().trim().min(1).max(240).optional(),
  }).strict()).max(8),
}).strict();

/** The scheduler chooses this category; the model only phrases the selected chat continuation. */
export async function POST(request: Request): Promise<Response> {
  try {
    const input = requestSchema.parse(await request.json() as unknown);
    const result = await new AiChatService(createOpenRouterChatProviders()).respond({
      message: '自然なら、今の会話を続ける短いメッセージを一つ送って。レッスンや宿題の案内にはしないで。',
      learnerLevel: input.learnerLevel,
      conversation: {
        ...input.conversation,
        scenario: input.scenario ? { ...input.scenario, targetGrammar: [], targetVocabulary: [] } : undefined,
      },
      learningTargets: input.learningTargets,
      chatPatterns: [],
      weaknesses: [],
    }, request.signal);
    return Response.json({ success: true, data: { message: result.response.reply } });
  } catch (error) {
    const safe = error instanceof AiChatServerError
      ? error
      : new AiChatServerError('PROVIDER_UNAVAILABLE', true, 'Yui is unavailable right now.');
    return Response.json({ success: false, error: { code: safe.code, message: safe.userMessage } }, { status: 502 });
  }
}
