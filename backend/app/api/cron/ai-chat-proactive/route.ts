import { runProactiveChatScheduler } from '../../../../src/ai-chat/proactive/service';

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } }, { status: 401 });
  }
  try {
    const results = await runProactiveChatScheduler(request.signal);
    return Response.json({ success: true, data: results });
  } catch (error) {
    console.error('[AI Chat proactive cron] Scheduling failed', { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ success: false, error: { code: 'SCHEDULER_FAILED', message: 'The chat scheduler could not finish.' } }, { status: 502 });
  }
}
