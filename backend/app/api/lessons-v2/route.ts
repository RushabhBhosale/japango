import { lessonsV2ErrorResponse } from '../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../src/lessons-v2/service';

export async function GET(): Promise<Response> {
  try {
    return Response.json({ success: true, data: { lessons: await new LessonsV2Service().listPublished() } });
  } catch (error) {
    return lessonsV2ErrorResponse(error);
  }
}
