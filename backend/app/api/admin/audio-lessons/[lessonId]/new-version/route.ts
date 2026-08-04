import { assertAudioLessonsManagementAccess, audioLessonsErrorResponse, confirmedAudioAction } from '../../../../../../src/audio-lessons/route-helpers';
import { AudioLessonsService } from '../../../../../../src/audio-lessons/service';

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertAudioLessonsManagementAccess(request);
    await confirmedAudioAction(request);
    const { lessonId } = await params;
    return Response.json({ success: true, data: { lesson: await new AudioLessonsService().createNextVersion(lessonId) } }, { status: 201 });
  } catch (error) { return audioLessonsErrorResponse(error); }
}
