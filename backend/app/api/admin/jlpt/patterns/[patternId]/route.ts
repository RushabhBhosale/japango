import { z } from 'zod';

import { assertLessonsV2ManagementAccess, lessonsV2ErrorResponse } from '../../../../../../src/lessons-v2/route-helpers';
import { LessonsV2QuestionService } from '../../../../../../src/lessons-v2/question-service';

const schema = z.object({ status: z.enum(['needs_review', 'approved', 'archived']) }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ patternId: string }> }): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const { patternId } = await params;
    const body = schema.parse(await request.json() as unknown);
    return Response.json({ success: true, data: { pattern: await new LessonsV2QuestionService().setPatternStatus(patternId, body.status) } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
