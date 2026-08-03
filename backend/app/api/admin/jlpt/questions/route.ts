import { assertLessonsV2ManagementAccess, lessonsV2ErrorResponse } from '../../../../../src/lessons-v2/route-helpers';
import { LessonsV2QuestionService } from '../../../../../src/lessons-v2/question-service';

export async function GET(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    return Response.json({ success: true, data: { questions: await new LessonsV2QuestionService().listGeneratedQuestions() } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    return Response.json({ success: true, data: await new LessonsV2QuestionService().createGeneratedQuestion(await request.json() as unknown) }, { status: 201 });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
