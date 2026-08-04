import { audioLessonsErrorResponse } from '../../../src/audio-lessons/route-helpers';
import { AudioLessonsService } from '../../../src/audio-lessons/service';

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const value = Object.fromEntries([...url.searchParams.entries()].filter(([, entry]) => entry !== ''));
    return Response.json({ success: true, data: { lessons: await new AudioLessonsService().listPublished(value) } });
  } catch (error) { return audioLessonsErrorResponse(error); }
}
