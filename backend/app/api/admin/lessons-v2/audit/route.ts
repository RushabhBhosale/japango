import { assertLessonsV2ManagementAccess, lessonsV2ErrorResponse } from '../../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../../src/lessons-v2/service';

/** Full read-only content-quality audit across current Lessons V2 versions. */
export async function GET(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    return Response.json({ success: true, data: await new LessonsV2Service().auditContent() });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
