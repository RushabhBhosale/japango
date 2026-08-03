import { assertLessonsV2ManagementAccess, lessonsV2ErrorResponse } from '../../../../../../src/lessons-v2/route-helpers';
import { LessonsV2QuestionService } from '../../../../../../src/lessons-v2/question-service';

export async function PATCH(request: Request, { params }: { params: Promise<{ sourceQuestionId: string }> }): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const { sourceQuestionId } = await params;
    return Response.json({ success: true, data: { sourceQuestion: await new LessonsV2QuestionService().correctSourceQuestion(sourceQuestionId, await request.json() as unknown) } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
