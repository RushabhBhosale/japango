import { assertLessonsV2ManagementAccess, confirmed, lessonsV2ErrorResponse } from '../../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../../src/lessons-v2/service';

export async function POST(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const body = await confirmed(request);
    const { confirm: _confirm, ...input } = body;
    const generated = await new LessonsV2Service().generateDraft(input, request.signal);
    return Response.json({
      success: true,
      data: generated.compatible
        ? { generated: true, lesson: generated.lesson, generationMetadata: generated.generationMetadata }
        : { generated: false, compatible: false, reason: generated.reason },
    }, { status: generated.compatible ? 201 : 422 });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
