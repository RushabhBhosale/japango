import { z } from 'zod';

import { assertLessonsV2ManagementAccess, lessonsV2ErrorResponse } from '../../../../../src/lessons-v2/route-helpers';
import { LessonsV2QuestionService } from '../../../../../src/lessons-v2/question-service';

const actionSchema = z.object({ action: z.enum(['import', 'extract-patterns']) }).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const service = new LessonsV2QuestionService();
    return Response.json({ success: true, data: { papers: await service.listPapers(), sourceQuestions: await service.listSourceQuestions(), patterns: await service.listPatterns() } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const body = actionSchema.parse(await request.json() as unknown);
    const service = new LessonsV2QuestionService();
    const data = body.action === 'import' ? await service.importQuestionPaperSources() : await service.extractPatterns();
    return Response.json({ success: true, data });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
