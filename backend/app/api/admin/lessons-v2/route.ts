import { assertLessonsV2ManagementAccess, lessonsV2ErrorResponse } from '../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../src/lessons-v2/service';

export async function GET(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    return Response.json({ success: true, data: { lessons: await new LessonsV2Service().listManagement(), mode: process.env.LESSONS_V2_AUTH_MODE ?? 'disabled' } });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    return Response.json({ success: true, data: { lesson: await new LessonsV2Service().createDraft(await request.json() as unknown) } }, { status: 201 });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
