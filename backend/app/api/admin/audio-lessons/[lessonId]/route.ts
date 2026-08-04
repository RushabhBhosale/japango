import { assertAudioLessonsManagementAccess, audioLessonsErrorResponse } from '../../../../../src/audio-lessons/route-helpers';
import { AudioLessonsService } from '../../../../../src/audio-lessons/service';

export async function GET(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertAudioLessonsManagementAccess(request);
    const { lessonId } = await params;
    return Response.json({ success: true, data: { lesson: await new AudioLessonsService().getManagement(lessonId) } });
  } catch (error) { return audioLessonsErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertAudioLessonsManagementAccess(request);
    const { lessonId } = await params;
    return Response.json({ success: true, data: { lesson: await new AudioLessonsService().updateDraft(lessonId, await request.json() as unknown) } });
  } catch (error) { return audioLessonsErrorResponse(error); }
}
