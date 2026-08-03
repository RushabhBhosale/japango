import { z } from 'zod';

import { assertLessonsV2ManagementAccess, confirmed, lessonsV2ErrorResponse } from '../../../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../../../src/lessons-v2/service';

const inputSchema = z.object({ confirm: z.literal(true), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const body = inputSchema.parse(await confirmed(request));
    const { lessonId } = await params;
    return Response.json({ success: true, data: { lesson: await new LessonsV2Service().duplicate(lessonId, body.slug) } }, { status: 201 });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
