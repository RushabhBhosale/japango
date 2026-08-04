import { assertAudioLessonsManagementAccess, audioLessonsErrorResponse } from '../../../../src/audio-lessons/route-helpers';
import { AudioLessonsService } from '../../../../src/audio-lessons/service';

export async function GET(request: Request): Promise<Response> {
  try {
    await assertAudioLessonsManagementAccess(request);
    return Response.json({ success: true, data: { lessons: await new AudioLessonsService().listManagement(), mode: process.env.LESSONS_V2_AUTH_MODE ?? 'disabled' } });
  } catch (error) { return audioLessonsErrorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await assertAudioLessonsManagementAccess(request);
    return Response.json({ success: true, data: { lesson: await new AudioLessonsService().createDraft(await request.json() as unknown) } }, { status: 201 });
  } catch (error) { return audioLessonsErrorResponse(error); }
}
