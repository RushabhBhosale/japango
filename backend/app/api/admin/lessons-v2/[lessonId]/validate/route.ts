import { assertLessonsV2ManagementAccess, lessonsV2ErrorResponse } from '../../../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../../../src/lessons-v2/service';

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const { lessonId } = await params;
    return Response.json({ success: true, data: await new LessonsV2Service().validate(lessonId) });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
