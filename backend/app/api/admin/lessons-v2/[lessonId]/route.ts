import { assertLessonsV2ManagementAccess, lessonsV2ErrorResponse } from '../../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../../src/lessons-v2/service';

export async function GET(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const { lessonId } = await params;
    return Response.json({ success: true, data: { lesson: await new LessonsV2Service().getManagement(lessonId) } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const { lessonId } = await params;
    return Response.json({ success: true, data: { lesson: await new LessonsV2Service().updateDraft(lessonId, await request.json() as unknown) } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
