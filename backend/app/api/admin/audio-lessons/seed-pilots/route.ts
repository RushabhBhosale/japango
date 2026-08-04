import { assertAudioLessonsManagementAccess, audioLessonsErrorResponse, confirmedAudioAction } from '../../../../../src/audio-lessons/route-helpers';
import { AudioLessonsService } from '../../../../../src/audio-lessons/service';

export async function POST(request: Request): Promise<Response> {
  try {
    await assertAudioLessonsManagementAccess(request);
    const body = await confirmedAudioAction(request);
    const { confirm: _confirm, dryRun, ...input } = body;
    return Response.json({ success: true, data: await new AudioLessonsService().seedPilots(input, dryRun === true) }, { status: dryRun === true ? 200 : 201 });
  } catch (error) { return audioLessonsErrorResponse(error); }
}
