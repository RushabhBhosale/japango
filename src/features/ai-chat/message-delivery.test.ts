import { describe, expect, it } from 'vitest';

import type { AiChatMessage } from '@/types/ai-chat';

import { hasPersistedYuiReply } from './message-delivery';

const message = (overrides: Partial<AiChatMessage>): AiChatMessage => ({
  id: 'message',
  chatId: 'yui-main',
  role: 'learner',
  content: 'こんばんは',
  deliveryStatus: 'sent',
  createdAt: '2026-08-16T08:00:00.000Z',
  ...overrides,
});

describe('Yui message delivery recovery', () => {
  it('recognises a reply persisted before a conversation refresh error', () => {
    expect(hasPersistedYuiReply([
      message({ id: 'learner-1' }),
      message({ id: 'yui-1', role: 'character', content: 'こんばんは！', createdAt: '2026-08-16T08:00:01.000Z' }),
    ], 'learner-1')).toBe(true);
  });

  it('does not turn a failed or unanswered learner message into a success', () => {
    expect(hasPersistedYuiReply([message({ id: 'learner-1', deliveryStatus: 'failed' })], 'learner-1')).toBe(false);
    expect(hasPersistedYuiReply([message({ id: 'learner-1' })], 'learner-1')).toBe(false);
  });
});

