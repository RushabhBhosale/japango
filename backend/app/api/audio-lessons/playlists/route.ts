import { audioLessonsErrorResponse } from '../../../../src/audio-lessons/route-helpers';
import { AudioLessonsService } from '../../../../src/audio-lessons/service';

export async function GET(): Promise<Response> {
  try {
    return Response.json({ success: true, data: { playlists: await new AudioLessonsService().listPublishedPlaylists() } });
  } catch (error) { return audioLessonsErrorResponse(error); }
}
