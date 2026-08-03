import { assertLessonsV2ManagementAccess, lessonsV2ErrorResponse } from '../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../src/lessons-v2/service';

export async function GET(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 100);
    return Response.json({ success: true, data: { vocabulary: await new LessonsV2Service().listVocabulary(limit) } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
