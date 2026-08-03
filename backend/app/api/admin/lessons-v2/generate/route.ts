import { assertLessonsV2ManagementAccess, confirmed, lessonsV2ErrorResponse } from '../../../../../src/lessons-v2/route-helpers';
import { LessonsV2Service } from '../../../../../src/lessons-v2/service';

export async function POST(request: Request): Promise<Response> {
  try {
    await assertLessonsV2ManagementAccess(request);
    const body = await confirmed(request);
    const plan = await new LessonsV2Service().createGenerationPlan(body);
    return Response.json({ success: true, data: { ...plan, generated: false, message: 'Draft generation is planned. Review OCR patterns and supply a configured generation provider before creating content.' } }, { status: 202 });
  } catch (error) { return lessonsV2ErrorResponse(error); }
}
