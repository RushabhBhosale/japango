import { audioLessonsErrorResponse } from '../../../../src/audio-lessons/route-helpers';
import { AudioLessonsService } from '../../../../src/audio-lessons/service';

export async function GET(_request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    const { lessonId } = await params;
    return Response.json({ success: true, data: { lesson: await new AudioLessonsService().getPublished(lessonId) } });
  } catch (error) { return audioLessonsErrorResponse(error); }
}
