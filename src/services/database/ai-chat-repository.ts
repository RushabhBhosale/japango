import { applyChatLearningSignals, isMeaningfulChatMistake } from '@/features/ai-chat/learner-skill';
import { getLearnerProfile } from '@/services/database/profile-repository';
import { getCurrentLearningTargets } from '@/services/database/daily-homework-repository';
import type {
  AiChatContext,
  AiChatConversation,
  AiChatDetectedMistake,
  AiChatMessage,
  AiChatResponse,
  AiChatScenario,
  ChatMemory,
  ChatLearningPattern,
  ChatMistake,
  LearnerSkill,
} from '@/types/ai-chat';
import { AI_CHAT_CHARACTER_ID, AI_CHAT_CONVERSATION_ID } from '@/types/ai-chat';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';

const yuiOpeningMessage = 'こんにちは！今、ちょっと休憩中。今日はどんな一日だった？';
const yuiOpeningMessageReading = 'こんにちは！いま、ちょっときゅうけいちゅう。きょうはどんないちにちだった？';

interface ConversationRow {
  id: string;
  character_id: string;
  character_name: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: AiChatMessage['role'];
  content: string;
  content_reading: string | null;
  delivery_status: AiChatMessage['deliveryStatus'];
  created_at: string;
}

interface MistakeRow {
  id: string;
  chat_id: string;
  message_id: string;
  original: string;
  corrected: string;
  category: ChatMistake['category'] | 'register';
  target: string | null;
  explanation: string | null;
  severity: ChatMistake['severity'];
  confidence: number;
  created_at: string;
  reviewed: number;
}

interface LearnerSkillRow {
  id: string;
  user_id: string;
  type: LearnerSkill['type'];
  skill_key: string;
  mastery: number;
  encounters: number;
  correct_uses: number;
  mistakes: number;
  last_encountered_at: string | null;
  last_mistake_at: string | null;
  recent_mistakes_json: string;
}

interface ChatMemoryRow {
  id: string;
  character_id: string;
  text: string;
  importance: number;
  embedding_json: string | null;
  created_at: string;
  last_used_at: string | null;
}

interface ChatScenarioRow {
  id: string;
  chat_id: string;
  title: string;
  setting: string;
  goal: string;
  target_grammar_json: string;
  target_vocabulary_json: string;
  complication: string | null;
  status: AiChatScenario['status'];
  created_at: string;
  updated_at: string;
}

interface ChatLearningPatternRow {
  user_id: string;
  pattern_type: ChatLearningPattern['type'];
  observations: number;
  last_seen_at: string;
}

const unreadListeners = new Set<(count: number) => void>();

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function parseEmbedding(value: string | null): number[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => typeof item === 'number' && Number.isFinite(item))
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function isEnglishFallback(content: string): boolean {
  const hasLatin = /[A-Za-z]/u.test(content);
  const hasJapanese = /[\u3040-\u30ff\u3400-\u9fff]/u.test(content);
  return hasLatin && !hasJapanese;
}

function mapConversation(row: ConversationRow): AiChatConversation {
  return {
    id: row.id,
    characterId: row.character_id,
    characterName: row.character_name,
    summary: row.summary ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): AiChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    content: row.content,
    contentReading: row.content_reading ?? undefined,
    deliveryStatus: row.delivery_status,
    createdAt: row.created_at,
  };
}

function mapMistake(row: MistakeRow): ChatMistake {
  return {
    id: row.id,
    chatId: row.chat_id,
    messageId: row.message_id,
    original: row.original,
    corrected: row.corrected,
    category: row.category === 'register' ? 'other' : row.category,
    target: row.target ?? undefined,
    explanation: row.explanation ?? undefined,
    severity: row.severity,
    confidence: row.confidence,
    createdAt: row.created_at,
    reviewed: row.reviewed === 1,
  };
}

function mapSkill(row: LearnerSkillRow): LearnerSkill {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    key: row.skill_key,
    mastery: row.mastery,
    encounters: row.encounters,
    correctUses: row.correct_uses,
    mistakes: row.mistakes,
    lastEncounteredAt: row.last_encountered_at ?? undefined,
    lastMistakeAt: row.last_mistake_at ?? undefined,
    recentMistakes: parseStringArray(row.recent_mistakes_json),
  };
}

function mapMemory(row: ChatMemoryRow): ChatMemory {
  return {
    id: row.id,
    characterId: row.character_id,
    text: row.text,
    importance: row.importance,
    embedding: parseEmbedding(row.embedding_json),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
  };
}

function mapScenario(row: ChatScenarioRow): AiChatScenario {
  return {
    id: row.id,
    chatId: row.chat_id,
    title: row.title,
    setting: row.setting,
    goal: row.goal,
    targetGrammar: parseStringArray(row.target_grammar_json),
    targetVocabulary: parseStringArray(row.target_vocabulary_json),
    complication: row.complication ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function notifyUnreadListeners(): void {
  void getYuiUnreadCount().then((count) => unreadListeners.forEach((listener) => listener(count)));
}

async function ensureYuiConversation(): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      'INSERT OR IGNORE INTO ai_chat_characters (id, name, role, created_at) VALUES (?, ?, ?, ?)',
      AI_CHAT_CHARACTER_ID,
      'ゆい',
      'casual Japanese friend',
      now,
    );
    await database.runAsync(
      `INSERT OR IGNORE INTO ai_chat_conversations
       (id, character_id, summary, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`,
      AI_CHAT_CONVERSATION_ID,
      AI_CHAT_CHARACTER_ID,
      now,
      now,
    );
    await database.runAsync(
      `INSERT INTO ai_chat_messages
       (id, chat_id, role, content, content_reading, delivery_status, created_at, read_at)
       VALUES (?, ?, 'character', ?, ?, 'sent', ?, ?)
       ON CONFLICT(id) DO UPDATE SET content_reading = COALESCE(ai_chat_messages.content_reading, excluded.content_reading)`,
      'yui-opening-message',
      AI_CHAT_CONVERSATION_ID,
      yuiOpeningMessage,
      yuiOpeningMessageReading,
      now,
      now,
    );
  });
}

export async function getYuiChat(): Promise<{ conversation: AiChatConversation; messages: AiChatMessage[] }> {
  await ensureYuiConversation();
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE ai_chat_messages SET read_at = ? WHERE chat_id = ? AND role = 'character' AND read_at IS NULL",
    new Date().toISOString(),
    AI_CHAT_CONVERSATION_ID,
  );
  notifyUnreadListeners();
  const [conversationRow, messageRows] = await Promise.all([
    database.getFirstAsync<ConversationRow>(
      `SELECT conversations.id, conversations.character_id, characters.name AS character_name,
              conversations.summary, conversations.created_at, conversations.updated_at
       FROM ai_chat_conversations AS conversations
       INNER JOIN ai_chat_characters AS characters ON characters.id = conversations.character_id
       WHERE conversations.id = ?`,
      AI_CHAT_CONVERSATION_ID,
    ),
    database.getAllAsync<MessageRow>(
      'SELECT * FROM ai_chat_messages WHERE chat_id = ? ORDER BY created_at ASC',
      AI_CHAT_CONVERSATION_ID,
    ),
  ]);
  if (!conversationRow) throw new Error('Yui’s conversation could not be opened.');
  return { conversation: mapConversation(conversationRow), messages: messageRows.map(mapMessage) };
}

export async function getYuiUnreadCount(): Promise<number> {
  await ensureYuiConversation();
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ai_chat_messages
     WHERE chat_id = ? AND role = 'character' AND is_proactive = 1 AND read_at IS NULL`,
    AI_CHAT_CONVERSATION_ID,
  );
  return row?.count ?? 0;
}

export function subscribeToYuiUnreadCount(listener: (count: number) => void): () => void {
  unreadListeners.add(listener);
  void getYuiUnreadCount().then(listener).catch(() => listener(0));
  return () => unreadListeners.delete(listener);
}

export async function saveIncomingYuiMessage(input: { id: string; content: string; createdAt: string }): Promise<void> {
  await ensureYuiConversation();
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT OR IGNORE INTO ai_chat_messages
       (id, chat_id, role, content, delivery_status, created_at, read_at, is_proactive)
       VALUES (?, ?, 'character', ?, 'sent', ?, NULL, 1)`,
      input.id,
      AI_CHAT_CONVERSATION_ID,
      input.content.trim(),
      input.createdAt,
    );
    await database.runAsync('UPDATE ai_chat_conversations SET updated_at = ? WHERE id = ?', input.createdAt, AI_CHAT_CONVERSATION_ID);
  });
  notifyUnreadListeners();
}

export async function createPendingYuiMessage(content: string): Promise<AiChatMessage> {
  await ensureYuiConversation();
  const database = await getDatabase();
  const message: AiChatMessage = {
    id: createLocalId('chat-message'),
    chatId: AI_CHAT_CONVERSATION_ID,
    role: 'learner',
    content: content.trim(),
    deliveryStatus: 'pending',
    createdAt: new Date().toISOString(),
  };
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO ai_chat_messages (id, chat_id, role, content, delivery_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      message.id,
      message.chatId,
      message.role,
      message.content,
      message.deliveryStatus,
      message.createdAt,
    );
    await database.runAsync('UPDATE ai_chat_conversations SET updated_at = ? WHERE id = ?', message.createdAt, message.chatId);
  });
  return message;
}

export async function markChatMessageFailed(messageId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE ai_chat_messages SET delivery_status = 'failed' WHERE id = ? AND role = 'learner' AND delivery_status = 'pending'",
    messageId,
  );
}

export async function markChatMessagePending(messageId: string): Promise<boolean> {
  const database = await getDatabase();
  const result = await database.runAsync(
    "UPDATE ai_chat_messages SET delivery_status = 'pending' WHERE id = ? AND role = 'learner' AND delivery_status = 'failed'",
    messageId,
  );
  return result.changes > 0;
}

export async function getChatMessage(messageId: string): Promise<AiChatMessage | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<MessageRow>('SELECT * FROM ai_chat_messages WHERE id = ?', messageId);
  return row ? mapMessage(row) : undefined;
}

export async function getYuiChatContext(): Promise<AiChatContext> {
  await ensureYuiConversation();
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const [conversation, recentRows, weaknessRows, patternRows, learningTargets] = await Promise.all([
    database.getFirstAsync<Pick<ConversationRow, 'summary'>>('SELECT summary FROM ai_chat_conversations WHERE id = ?', AI_CHAT_CONVERSATION_ID),
    database.getAllAsync<MessageRow>(
      `SELECT * FROM (
         SELECT * FROM ai_chat_messages
         WHERE chat_id = ? AND delivery_status != 'failed'
         ORDER BY created_at DESC LIMIT 20
       ) ORDER BY created_at ASC`,
      AI_CHAT_CONVERSATION_ID,
    ),
    database.getAllAsync<LearnerSkillRow>(
      `SELECT * FROM learner_skills WHERE user_id = ? AND (mistakes >= 2 OR encounters >= 3)
       ORDER BY mastery ASC, mistakes DESC, COALESCE(last_mistake_at, '') DESC LIMIT 5`,
      profile.id,
    ),
    database.getAllAsync<ChatLearningPatternRow>(
      `SELECT user_id, pattern_type, observations, last_seen_at FROM chat_learning_patterns
       WHERE user_id = ? ORDER BY observations DESC, last_seen_at DESC LIMIT 4`,
      profile.id,
    ),
    getCurrentLearningTargets(),
  ]);
  return {
    chatId: AI_CHAT_CONVERSATION_ID,
    summary: conversation?.summary ?? undefined,
    recentMessages: recentRows.map(mapMessage),
    weaknesses: weaknessRows.map(mapSkill).map(({ type, key, mastery, mistakes }) => ({ type, key, mastery, mistakes })),
    chatPatterns: patternRows.map((row) => ({ userId: row.user_id, type: row.pattern_type, observations: row.observations, lastSeenAt: row.last_seen_at })),
    learningTargets,
  };
}

export async function getCachedChatEmbedding(contentHash: string): Promise<number[] | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ embedding_json: string }>(
    'SELECT embedding_json FROM ai_chat_embedding_cache WHERE content_hash = ?',
    contentHash,
  );
  return parseEmbedding(row?.embedding_json ?? null);
}

export async function saveCachedChatEmbedding(contentHash: string, embedding: readonly number[]): Promise<void> {
  const database = await getDatabase();
  if (!embedding.length || embedding.some((value) => !Number.isFinite(value))) return;
  await database.runAsync(
    `INSERT INTO ai_chat_embedding_cache (content_hash, embedding_json, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(content_hash) DO UPDATE SET embedding_json = excluded.embedding_json, created_at = excluded.created_at`,
    contentHash,
    JSON.stringify(embedding),
    new Date().toISOString(),
  );
}

async function saveMemoryCandidates(
  database: Awaited<ReturnType<typeof getDatabase>>,
  candidates: AiChatResponse['memoryCandidates'],
  now: string,
): Promise<void> {
  for (const candidate of candidates.filter((item) => item.importance >= 0.65)) {
    await database.runAsync(
      `INSERT INTO ai_chat_memories (id, character_id, text, importance, embedding_json, created_at, last_used_at)
       VALUES (?, ?, ?, ?, NULL, ?, NULL)
       ON CONFLICT(character_id, text) DO UPDATE SET importance = MAX(ai_chat_memories.importance, excluded.importance)`,
      createLocalId('chat-memory'),
      AI_CHAT_CHARACTER_ID,
      candidate.text.trim(),
      candidate.importance,
      now,
    );
  }
}

export async function getChatMemoriesWithoutEmbeddings(limit = 8): Promise<ChatMemory[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<ChatMemoryRow>(
    `SELECT * FROM ai_chat_memories WHERE character_id = ? AND embedding_json IS NULL
     ORDER BY importance DESC, created_at DESC LIMIT ?`,
    AI_CHAT_CHARACTER_ID,
    Math.max(1, Math.min(8, limit)),
  );
  return rows.map(mapMemory);
}

export async function saveChatMemoryEmbedding(memoryId: string, embedding: readonly number[]): Promise<void> {
  const database = await getDatabase();
  if (!embedding.length || embedding.some((value) => !Number.isFinite(value))) return;
  await database.runAsync('UPDATE ai_chat_memories SET embedding_json = ? WHERE id = ?', JSON.stringify(embedding), memoryId);
}

export async function getEmbeddedChatMemories(limit = 60): Promise<(ChatMemory & { embedding: number[] })[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<ChatMemoryRow>(
    `SELECT * FROM ai_chat_memories WHERE character_id = ? AND embedding_json IS NOT NULL
     ORDER BY importance DESC, created_at DESC LIMIT ?`,
    AI_CHAT_CHARACTER_ID,
    Math.max(1, Math.min(60, limit)),
  );
  return rows.map(mapMemory).filter((memory): memory is ChatMemory & { embedding: number[] } => Boolean(memory.embedding));
}

export async function markChatMemoriesUsed(memoryIds: readonly string[]): Promise<void> {
  if (!memoryIds.length) return;
  const database = await getDatabase();
  const placeholders = memoryIds.map(() => '?').join(', ');
  await database.runAsync(
    `UPDATE ai_chat_memories SET last_used_at = ? WHERE id IN (${placeholders})`,
    new Date().toISOString(),
    ...memoryIds,
  );
}

export async function getActiveYuiScenario(): Promise<AiChatScenario | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<ChatScenarioRow>(
    `SELECT * FROM ai_chat_scenarios WHERE chat_id = ? AND status = 'active'
     ORDER BY updated_at DESC LIMIT 1`,
    AI_CHAT_CONVERSATION_ID,
  );
  return row ? mapScenario(row) : undefined;
}

export async function saveYuiScenario(
  blueprint: Omit<AiChatScenario, 'id' | 'chatId' | 'status' | 'createdAt' | 'updatedAt'>,
): Promise<AiChatScenario> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const scenario: AiChatScenario = {
    ...blueprint,
    id: createLocalId('chat-scenario'),
    chatId: AI_CHAT_CONVERSATION_ID,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await database.runAsync(
    `INSERT INTO ai_chat_scenarios
     (id, chat_id, title, setting, goal, target_grammar_json, target_vocabulary_json, complication, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    scenario.id,
    scenario.chatId,
    scenario.title,
    scenario.setting,
    scenario.goal,
    JSON.stringify(scenario.targetGrammar),
    JSON.stringify(scenario.targetVocabulary),
    scenario.complication ?? null,
    scenario.status,
    scenario.createdAt,
    scenario.updatedAt,
  );
  return scenario;
}

export async function completeActiveYuiScenario(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE ai_chat_scenarios SET status = 'completed', updated_at = ? WHERE chat_id = ? AND status = 'active'",
    new Date().toISOString(),
    AI_CHAT_CONVERSATION_ID,
  );
}

async function persistLearnerSkills(
  database: Awaited<ReturnType<typeof getDatabase>>,
  skills: readonly LearnerSkill[],
): Promise<void> {
  for (const skill of skills) {
    await database.runAsync(
      `INSERT INTO learner_skills
       (id, user_id, type, skill_key, mastery, encounters, correct_uses, mistakes, last_encountered_at, last_mistake_at, recent_mistakes_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, type, skill_key) DO UPDATE SET
         mastery = excluded.mastery, encounters = excluded.encounters, correct_uses = excluded.correct_uses,
         mistakes = excluded.mistakes, last_encountered_at = excluded.last_encountered_at,
         last_mistake_at = excluded.last_mistake_at, recent_mistakes_json = excluded.recent_mistakes_json`,
      skill.id,
      skill.userId,
      skill.type,
      skill.key,
      skill.mastery,
      skill.encounters,
      skill.correctUses,
      skill.mistakes,
      skill.lastEncounteredAt ?? null,
      skill.lastMistakeAt ?? null,
      JSON.stringify(skill.recentMistakes),
    );
  }
}

export async function persistYuiResponse(messageId: string, response: AiChatResponse): Promise<AiChatMessage | undefined> {
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const now = new Date().toISOString();
  const replyMessage: AiChatMessage = {
    id: createLocalId('chat-message'),
    chatId: AI_CHAT_CONVERSATION_ID,
    role: 'character',
    content: response.reply,
    contentReading: response.replyReading,
    deliveryStatus: 'sent',
    createdAt: now,
  };
  const meaningfulMistakes = response.mistakes.filter(isMeaningfulChatMistake);
  const currentRows = await database.getAllAsync<LearnerSkillRow>('SELECT * FROM learner_skills WHERE user_id = ?', profile.id);
  const updatedSkills = applyChatLearningSignals(profile.id, currentRows.map(mapSkill), response.learningSignals, now);
  const learnerMessage = await database.getFirstAsync<Pick<MessageRow, 'content'>>('SELECT content FROM ai_chat_messages WHERE id = ? AND role = \'learner\'', messageId);
  const patternTypes = new Set<string>(meaningfulMistakes.map((mistake) => mistake.category));
  if (learnerMessage && isEnglishFallback(learnerMessage.content)) patternTypes.add('english-fallback');

  let persisted = false;
  await database.withTransactionAsync(async () => {
    const claimedMessage = await database.runAsync(
      "UPDATE ai_chat_messages SET delivery_status = 'sent' WHERE id = ? AND role = 'learner' AND delivery_status = 'pending'",
      messageId,
    );
    // A timed-out request can complete after a retry has begun. Only the first
    // response that claims this pending learner message may create a Yui reply.
    if (claimedMessage.changes === 0) return;
    persisted = true;
    await database.runAsync(
      `INSERT INTO ai_chat_messages (id, chat_id, role, content, content_reading, delivery_status, created_at)
       VALUES (?, ?, 'character', ?, ?, 'sent', ?)`,
      replyMessage.id,
      AI_CHAT_CONVERSATION_ID,
      replyMessage.content,
      replyMessage.contentReading ?? null,
      replyMessage.createdAt,
    );
    await database.runAsync('UPDATE ai_chat_conversations SET updated_at = ? WHERE id = ?', now, AI_CHAT_CONVERSATION_ID);
    await saveMemoryCandidates(database, response.memoryCandidates, now);
    if (response.scenario?.state === 'completed') {
      await database.runAsync(
        "UPDATE ai_chat_scenarios SET status = 'completed', updated_at = ? WHERE chat_id = ? AND status = 'active'",
        now,
        AI_CHAT_CONVERSATION_ID,
      );
    }
    for (const mistake of meaningfulMistakes) {
      await database.runAsync(
        `INSERT INTO ai_chat_mistakes
         (id, chat_id, message_id, original, corrected, category, target, explanation, severity, confidence, created_at, reviewed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        createLocalId('chat-mistake'),
        AI_CHAT_CONVERSATION_ID,
        messageId,
        mistake.original,
        mistake.correction,
        mistake.category,
        null,
        null,
        mistake.severity,
        mistake.confidence,
        now,
      );
    }
    for (const patternType of patternTypes) {
      await database.runAsync(
        `INSERT INTO chat_learning_patterns (user_id, pattern_type, observations, last_seen_at)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(user_id, pattern_type) DO UPDATE SET
           observations = chat_learning_patterns.observations + 1,
           last_seen_at = excluded.last_seen_at`,
        profile.id,
        patternType,
        now,
      );
    }
    await persistLearnerSkills(database, updatedSkills);
  });
  return persisted ? replyMessage : undefined;
}

export async function getRecentChatMistakes(limit = 3): Promise<ChatMistake[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<MistakeRow>(
    `SELECT * FROM ai_chat_mistakes WHERE chat_id = ? AND reviewed = 0
     ORDER BY confidence DESC, CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC LIMIT ?`,
    AI_CHAT_CONVERSATION_ID,
    Math.max(1, Math.min(3, limit)),
  );
  return rows.map(mapMistake);
}

export async function markChatMistakeReviewed(mistakeId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE ai_chat_mistakes SET reviewed = 1 WHERE id = ?', mistakeId);
}

export function chatMistakeIsWorthSaving(mistake: AiChatDetectedMistake): boolean {
  return isMeaningfulChatMistake(mistake);
}
