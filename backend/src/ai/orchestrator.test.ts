import { beforeEach, describe, expect, it } from 'vitest';

import { AiServerError } from './errors';
import { AiOrchestrator, resetAiCircuitBreakers, teacherSystemPrompt } from './orchestrator';
import type { AiProvider, AiTeacherRequest } from './types';

const request: AiTeacherRequest = { feature: 'explain_vocabulary', context: { learnerLevel: 'N5', item: { id: 'vocab-1', type: 'vocabulary', title: '食べる', meaning: 'to eat' } }, requestId: 'test-request', promptVersion: 'AI_PROMPT_EXPLAIN_VOCABULARY_V1' };
function provider(id: string, result: () => Promise<string>): AiProvider { return { id, model: 'test', capabilities: { structuredOutput: false, streaming: false, supportsJapanese: true, supportsSystemMessages: true }, complete: async () => result() }; }
const valid = JSON.stringify({ answer: '食べる means to eat.', confidence: 'high' });

describe('AI provider orchestration', () => {
  beforeEach(resetAiCircuitBreakers);
  it('uses the primary provider when its validated response succeeds', async () => { const result = await new AiOrchestrator([provider('primary', async () => valid)]).run(request, new AbortController().signal); expect(result.response.answer).toContain('食べる'); expect(result.fallbackUsed).toBe(false); });
  it('retries then falls back to backup A for retryable provider errors', async () => { let primaryCalls = 0; const result = await new AiOrchestrator([provider('primary', async () => { primaryCalls += 1; throw new AiServerError('TIMEOUT', true, 'slow'); }), provider('backup-a', async () => valid)]).run(request, new AbortController().signal); expect(primaryCalls).toBe(2); expect(result.fallbackUsed).toBe(true); });
  it('falls through backup A to backup B after malformed output', async () => { const result = await new AiOrchestrator([provider('primary', async () => 'not json'), provider('backup-a', async () => '[]'), provider('backup-b', async () => valid)]).run(request, new AbortController().signal); expect(result.fallbackUsed).toBe(true); expect(result.response.confidence).toBe('high'); });
  it('does not retry non-retryable configuration errors', async () => { let backupCalls = 0; await expect(new AiOrchestrator([provider('primary', async () => { throw new AiServerError('AUTH_CONFIGURATION_ERROR', false, 'bad key'); }), provider('backup', async () => { backupCalls += 1; return valid; })]).run(request, new AbortController().signal)).rejects.toMatchObject({ code: 'AUTH_CONFIGURATION_ERROR' }); expect(backupCalls).toBe(0); });
  it('opens a provider circuit after repeated failures and returns a safe final failure', async () => { let calls = 0; const failing = provider('primary', async () => { calls += 1; throw new AiServerError('TIMEOUT', true, 'slow'); }); const orchestrator = new AiOrchestrator([failing]); await expect(orchestrator.run(request, new AbortController().signal)).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' }); await expect(orchestrator.run({ ...request, requestId: 'two' }, new AbortController().signal)).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' }); const before = calls; await expect(orchestrator.run({ ...request, requestId: 'three' }, new AbortController().signal)).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' }); expect(calls).toBe(before); });
  it('uses the controlled Yuki prompt only for the Episode 1 checkpoint', () => {
    const prompt = teacherSystemPrompt({ ...request, feature: 'conversation', context: { learnerLevel: 'N5', item: { id: 'episode-1-yuki-meet-shinjuku', type: 'controlled-story-checkpoint', title: 'Episode 1' } } });
    expect(prompt).toContain('You are Yuki');
    expect(prompt).toContain('Shinjuku Station');
    expect(prompt).toContain('ASK_FOLLOW_UP');
  });
});
