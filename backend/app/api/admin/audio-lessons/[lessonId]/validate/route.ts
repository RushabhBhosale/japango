import { assertAudioLessonsManagementAccess, audioLessonsErrorResponse } from '../../../../../../src/audio-lessons/route-helpers';
import { AudioLessonsService } from '../../../../../../src/audio-lessons/service';

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertAudioLessonsManagementAccess(request);
    const { lessonId } = await params;
    return Response.json({ success: true, data: await new AudioLessonsService().validate(lessonId) });
  } catch (error) { return audioLessonsErrorResponse(error); }
}
