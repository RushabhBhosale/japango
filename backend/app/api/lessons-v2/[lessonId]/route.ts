import { lessonsV2ErrorResponse } from '../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../src/lessons-v2/service';

export async function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    const { lessonId } = await params;
    return Response.json({ success: true, data: { lesson: await new LessonsV2Service().getPublished(lessonId) } });
  } catch (error) {
    return lessonsV2ErrorResponse(error);
  }
}
