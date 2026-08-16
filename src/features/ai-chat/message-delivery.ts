import type { AiChatMessage } from '@/types/ai-chat';

/**
 * A local write can succeed even when the follow-up conversation refresh is
 * interrupted. In that case the visible reply is the source of truth, not the
 * refresh error.
 */
export function hasPersistedYuiReply(messages: readonly AiChatMessage[], learnerMessageId: string): boolean {
  const learnerMessage = messages.find((message) => message.id === learnerMessageId);
  if (!learnerMessage || learnerMessage.role !== 'learner' || learnerMessage.deliveryStatus !== 'sent') return false;
  const sentAt = Date.parse(learnerMessage.createdAt);
  return messages.some((message) => message.role === 'character'
    && message.deliveryStatus === 'sent'
    && message.createdAt >= learnerMessage.createdAt
    && (!Number.isFinite(sentAt) || Date.parse(message.createdAt) >= sentAt));
}

/**
 * A reply has already been committed locally at this point. Reconcile it into
 * the active screen even if the optional full conversation refresh is busy.
 */
export function reconcileDeliveredYuiReply(
  messages: readonly AiChatMessage[],
  learnerMessageId: string,
  reply: AiChatMessage,
): AiChatMessage[] {
  const delivered = messages.map((message) => message.id === learnerMessageId
    ? { ...message, deliveryStatus: 'sent' as const }
    : message);
  if (delivered.some((message) => message.id === reply.id)) return delivered;
  return [...delivered, reply];
}
