import { assertLessonsV2ManagementAccess, confirmed, lessonsV2ErrorResponse } from '../../../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../../../src/lessons-v2/service';

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    await confirmed(request);
    const { lessonId } = await params;
    await new LessonsV2Service().archive(lessonId);
    return Response.json({ success: true, data: { archived: true } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
