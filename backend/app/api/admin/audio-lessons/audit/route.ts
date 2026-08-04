import { assertAudioLessonsManagementAccess, audioLessonsErrorResponse } from '../../../../../src/audio-lessons/route-helpers';
import { AudioLessonsService } from '../../../../../src/audio-lessons/service';

export async function GET(request: Request): Promise<Response> {
  try {
    await assertAudioLessonsManagementAccess(request);
    return Response.json({ success: true, data: await new AudioLessonsService().auditContent() });
  } catch (error) { return audioLessonsErrorResponse(error); }
}
