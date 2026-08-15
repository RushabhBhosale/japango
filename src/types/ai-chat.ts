import type { CurrentLearningTarget } from './daily-homework';

export const AI_CHAT_CHARACTER_ID = 'yui';
export const AI_CHAT_CONVERSATION_ID = 'yui-main';

export type AiChatRole = 'learner' | 'character';
export type AiChatDeliveryStatus = 'pending' | 'sent' | 'failed';
export type LearnerSkillType = 'grammar' | 'vocabulary' | 'kanji';
export type ChatMistakeCategory =
  | 'grammar'
  | 'particle'
  | 'vocabulary'
  | 'kanji'
  | 'conjugation'
  | 'naturalness'
  | 'other';
export type ChatMistakeSeverity = 'low' | 'medium' | 'high';
export type AiChatScenarioStatus = 'active' | 'completed' | 'abandoned';

export interface AiChatConversation {
  id: string;
  characterId: string;
  characterName: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatMessage {
  id: string;
  chatId: string;
  role: AiChatRole;
  content: string;
  /** Full contextual kana reading, supplied with Yui's reply when available. */
  contentReading?: string;
  deliveryStatus: AiChatDeliveryStatus;
  createdAt: string;
}

export interface ChatMistake {
  id: string;
  chatId: string;
  messageId: string;
  original: string;
  corrected: string;
  category: ChatMistakeCategory;
  target?: string;
  explanation?: string;
  severity: ChatMistakeSeverity;
  confidence: number;
  createdAt: string;
  reviewed: boolean;
}

export interface LearnerSkill {
  id: string;
  userId: string;
  type: LearnerSkillType;
  key: string;
  mastery: number;
  encounters: number;
  correctUses: number;
  mistakes: number;
  lastEncounteredAt?: string;
  lastMistakeAt?: string;
  recentMistakes: string[];
}

export type ChatLearningPatternType = ChatMistakeCategory | 'english-fallback';

export interface ChatLearningPattern {
  userId: string;
  type: ChatLearningPatternType;
  observations: number;
  lastSeenAt: string;
}

export interface AiChatDetectedMistake {
  original: string;
  correction: string;
  category: ChatMistakeCategory;
  severity: ChatMistakeSeverity;
  confidence: number;
}

export interface AiChatLearningSignal {
  key: string;
  type: LearnerSkillType;
  result: 'strong' | 'weak' | 'mistake';
}

export interface ChatAIResult {
  reply: string;
  mistakes: AiChatDetectedMistake[];
  learningSignals: AiChatLearningSignal[];
  memoryCandidates: { text: string; importance: number }[];
  scenario?: { topic?: string; state?: string; continuationSuggested?: boolean };
}

/** The additional reading remains local presentation metadata for existing furigana support. */
export interface AiChatResponse extends ChatAIResult {
  replyReading?: string;
}

export interface ChatMemory {
  id: string;
  characterId: string;
  text: string;
  importance: number;
  embedding?: number[];
  createdAt: string;
  lastUsedAt?: string;
}

export interface AiChatScenario {
  id: string;
  chatId: string;
  title: string;
  setting: string;
  goal: string;
  targetGrammar: string[];
  targetVocabulary: string[];
  complication?: string;
  status: AiChatScenarioStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatContext {
  chatId: string;
  summary?: string;
  recentMessages: AiChatMessage[];
  weaknesses: Pick<LearnerSkill, 'type' | 'key' | 'mastery' | 'mistakes'>[];
  chatPatterns: ChatLearningPattern[];
  learningTargets: CurrentLearningTarget[];
  relevantMemories?: ChatMemory[];
  scenario?: AiChatScenario;
}
