import type { ExtractedSourceQuestion } from './question-papers/source-extractor';

export type JlptQuestionType =
  | 'kanji_reading' | 'kana_to_kanji' | 'vocabulary_cloze' | 'similar_meaning' | 'word_usage'
  | 'grammar_cloze' | 'sentence_order_star' | 'short_reading' | 'information_retrieval'
  | 'listening_task' | 'listening_quick_response';

export function classifyJlptQuestionPattern(question: ExtractedSourceQuestion): JlptQuestionType | undefined {
  const text = question.sourceTranscription;
  if (/ひらがなで\s*どう\s*かきます/u.test(text)) return 'kanji_reading';
  if (/どう\s*かきます/u.test(text)) return 'kana_to_kanji';
  if (/つかいかた/u.test(text)) return 'word_usage';
  if (/だいたい\s*おなじ\s*いみ/u.test(text)) return 'similar_meaning';
  if (text.includes('★')) return 'sentence_order_star';
  if (question.section === 'listening' && /こたえ|はなしを\s*きいて/u.test(text)) return 'listening_task';
  if (question.section === 'listening' && /くれませんか|できますか/u.test(text)) return 'listening_quick_response';
  if (question.section === 'reading' && /お知らせ|メモ|しつもん/u.test(text)) return 'information_retrieval';
  if (question.section === 'reading') return 'short_reading';
  if (question.section === 'grammar') return 'grammar_cloze';
  if (question.section === 'vocabulary_kanji' && /なにを\s*いれます/u.test(text)) return 'vocabulary_cloze';
  return undefined;
}
