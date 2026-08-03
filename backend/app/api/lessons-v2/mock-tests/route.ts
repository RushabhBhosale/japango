import { z } from 'zod';

import { lessonsV2ErrorResponse } from '../../../../src/lessons-v2/route-helpers';
import { LessonsV2QuestionService } from '../../../../src/lessons-v2/question-service';

const schema = z.object({ level: z.enum(['N5', 'N4']), localUserId: z.string().trim().min(1).max(160), count: z.number().int().min(1).max(40).default(10) }).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.parse(await request.json() as unknown);
    const questions = await new LessonsV2QuestionService().assembleMockTest(body.level, body.localUserId, body.count);
    return Response.json({ success: true, data: { questions } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
