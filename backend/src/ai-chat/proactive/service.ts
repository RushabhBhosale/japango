import { createOpenRouterChatProviders } from '../provider';
import { generateProactiveMessage } from './generator';
import { chooseTeachingTarget, shouldScheduleProactiveMessage } from './policy';
import { claimProactiveJob, getProactiveCandidates, markProactiveJobFailed, markProactiveJobSent } from './storage';

async function sendExpoPush(token: string, payload: { title: string; body: string; data: Record<string, string> }, signal: AbortSignal): Promise<void> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ to: token, sound: 'default', title: payload.title, body: payload.body, data: payload.data }),
  });
  const body = await response.json() as { data?: Array<{ status?: string }> };
  if (!response.ok || body.data?.[0]?.status !== 'ok') throw new Error('EXPO_PUSH_FAILED');
}

export async function runProactiveChatScheduler(signal: AbortSignal): Promise<{ sent: number; skipped: number; failed: number }> {
  const candidates = await getProactiveCandidates();
  const results = { sent: 0, skipped: 0, failed: 0 };
  for (const candidate of candidates) {
    const decision = shouldScheduleProactiveMessage(candidate, new Date());
    if (!decision.allowed || !decision.localDate) { results.skipped += 1; continue; }
    const job = await claimProactiveJob(candidate.localUserId, decision.localDate);
    if (!job) { results.skipped += 1; continue; }
    const target = chooseTeachingTarget(candidate.weaknesses, decision.localDate);
    try {
      const message = await generateProactiveMessage(createOpenRouterChatProviders(), candidate, target, signal);
      await sendExpoPush(candidate.expoPushToken, {
        title: 'Yui', body: message,
        data: { chatId: 'yui-main', messageId: job.id, message, createdAt: new Date().toISOString() },
      }, signal);
      await markProactiveJobSent(job.id, message, target?.key);
      results.sent += 1;
    } catch (error) {
      await markProactiveJobFailed(job.id, error instanceof Error ? error.message : 'UNKNOWN');
      results.failed += 1;
    }
  }
  return results;
}
