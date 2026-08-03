import { z } from 'zod';

import { assertLessonsV2ManagementAccess, confirmed, lessonsV2ErrorResponse } from '../../../../../../src/lessons-v2/route-helpers';
import { LessonsV2QuestionService } from '../../../../../../src/lessons-v2/question-service';

const schema = z.object({ confirm: z.literal(true), status: z.enum(['approved', 'published', 'archived']) }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ questionId: string }> }): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const body = schema.parse(await confirmed(request));
    const { questionId } = await params;
    return Response.json({ success: true, data: { question: await new LessonsV2QuestionService().setGeneratedQuestionStatus(questionId, body.status) } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
