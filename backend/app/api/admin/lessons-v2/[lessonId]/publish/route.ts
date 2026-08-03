import { assertLessonsV2ManagementAccess, confirmed, lessonsV2ErrorResponse } from '../../../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../../../src/lessons-v2/service';

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    await confirmed(request);
    const { lessonId } = await params;
    return Response.json({ success: true, data: { lesson: await new LessonsV2Service().publish(lessonId) } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
