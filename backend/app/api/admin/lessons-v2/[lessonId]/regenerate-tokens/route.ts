import { z } from 'zod';

import { assertLessonsV2ManagementAccess, confirmed, lessonsV2ErrorResponse } from '../../../../../../src/lessons-v2/route-helpers';
import { createFallbackTokenization } from '../../../../../../src/lessons-v2/tokenizer';

const inputSchema = z.object({ confirm: z.literal(true), raw: z.string().min(1).max(6000) }).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const body = inputSchema.parse(await confirmed(request));
    return Response.json({ success: true, data: { tokenization: createFallbackTokenization(body.raw), requiresManualCorrection: true } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
