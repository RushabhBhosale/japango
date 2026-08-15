import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { ProactiveCandidate } from './policy';
import { proactiveContextSchema, type ProactiveContext } from './schemas';

function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('AI Chat proactive storage is not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function registerChatDevice(
  input: { localUserId: string; expoPushToken: string; timeZone: string },
  client = serviceClient(),
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client.from('ai_chat_device_registrations').upsert({
    local_user_id: input.localUserId,
    expo_push_token: input.expoPushToken,
    time_zone: input.timeZone,
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: 'local_user_id' });
  if (error) throw new Error('Chat notification registration could not be saved.');
}

export async function saveProactiveContext(input: ProactiveContext, client = serviceClient()): Promise<void> {
  const context = proactiveContextSchema.parse(input);
  const { error } = await client.from('ai_chat_proactive_contexts').upsert({
    local_user_id: context.localUserId,
    summary: context.summary ?? null,
    weaknesses: context.weaknesses,
    scenario: context.scenario ?? null,
    last_active_at: context.lastActiveAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'local_user_id' });
  if (error) throw new Error('Chat proactive context could not be saved.');
}

interface ContextRow {
  local_user_id: string;
  summary: string | null;
  weaknesses: unknown;
  scenario: unknown;
  last_active_at: string;
}

interface DeviceRow {
  local_user_id: string;
  expo_push_token: string;
  time_zone: string;
  last_seen_at: string;
}

interface JobRow {
  local_user_id: string;
  sent_at: string | null;
  created_at: string;
}

export async function getProactiveCandidates(client = serviceClient()): Promise<ProactiveCandidate[]> {
  const activeAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
  const [contexts, devices, jobs] = await Promise.all([
    client.from('ai_chat_proactive_contexts').select('local_user_id, summary, weaknesses, scenario, last_active_at'),
    client.from('ai_chat_device_registrations').select('local_user_id, expo_push_token, time_zone, last_seen_at').gte('last_seen_at', activeAfter),
    client.from('ai_chat_proactive_jobs').select('local_user_id, sent_at, created_at').order('created_at', { ascending: false }).limit(500),
  ]);
  if (contexts.error || devices.error || jobs.error) throw new Error('Chat proactive candidates could not be loaded.');
  const deviceByUser = new Map((devices.data as DeviceRow[]).map((device) => [device.local_user_id, device]));
  const jobsByUser = new Map<string, JobRow[]>();
  for (const job of jobs.data as JobRow[]) jobsByUser.set(job.local_user_id, [...(jobsByUser.get(job.local_user_id) ?? []), job]);
  return (contexts.data as ContextRow[]).flatMap((row) => {
    const device = deviceByUser.get(row.local_user_id);
    if (!device) return [];
    const parsed = proactiveContextSchema.safeParse({
      localUserId: row.local_user_id,
      timeZone: device.time_zone,
      summary: row.summary ?? undefined,
      weaknesses: row.weaknesses,
      scenario: row.scenario ?? undefined,
      lastActiveAt: row.last_active_at,
    });
    if (!parsed.success) return [];
    const userJobs = jobsByUser.get(row.local_user_id) ?? [];
    const sent = userJobs.filter((job) => Boolean(job.sent_at));
    return [{ ...parsed.data, expoPushToken: device.expo_push_token, sentToday: 0, lastProactiveAt: sent[0]?.sent_at ?? undefined }];
  });
}

export async function claimProactiveJob(localUserId: string, localDate: string, client = serviceClient()): Promise<{ id: string } | undefined> {
  const now = new Date().toISOString();
  const { data, error } = await client.from('ai_chat_proactive_jobs').insert({
    local_user_id: localUserId,
    scheduled_local_date: localDate,
    status: 'generating',
    created_at: now,
    updated_at: now,
  }).select('id').maybeSingle();
  if (!error) return data as { id: string };
  if (error.code === '23505') return undefined;
  throw new Error('Chat proactive message could not be reserved.');
}

export async function markProactiveJobSent(jobId: string, message: string, teachingTarget: string | undefined, client = serviceClient()): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client.from('ai_chat_proactive_jobs').update({
    message,
    teaching_target: teachingTarget ?? null,
    status: 'sent',
    generated_at: now,
    sent_at: now,
    updated_at: now,
  }).eq('id', jobId);
  if (error) throw new Error('Chat proactive message could not be marked as sent.');
}

export async function markProactiveJobFailed(jobId: string, code: string, client = serviceClient()): Promise<void> {
  await client.from('ai_chat_proactive_jobs').update({ status: 'failed', error_code: code.slice(0, 120), updated_at: new Date().toISOString() }).eq('id', jobId);
}
