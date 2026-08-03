import type { LessonV2Question, StructuredJapaneseText } from './contracts';

export interface PilotSourceBinding { patternId: string; sourceChunkId: string; sourcePath: string; }
export type PilotSourceBindings = Record<'n5_reading' | 'n5_vocabulary' | 'n5_grammar' | 'n5_order' | 'n5_reading_passage' | 'n4_usage' | 'n4_grammar' | 'n4_order' | 'n4_reading' | 'n4_information', PilotSourceBinding>;

function draftText(raw: string): StructuredJapaneseText {
  // The pilot is intentionally a draft. The editor must replace this
  // conservative tokenization with linked, verified word tokens before publish.
  return { raw, tokens: [{ id: `draft-${raw.length}-${raw.charCodeAt(0)}`, kind: 'plain', surface: raw, kanjiIds: [], status: 'needs_review' }], status: 'needs_review' };
}

function question(
  id: string,
  level: 'N5' | 'N4',
  type: LessonV2Question['type'],
  section: LessonV2Question['section'],
  binding: PilotSourceBinding,
  prompt: string,
  choices: readonly string[],
  correctIndex: number,
  passage?: string,
): LessonV2Question {
  return {
    id, level, type, section, sourcePatternIds: [binding.patternId], testedSkill: type.replaceAll('_', ' '), objectiveId: `${level.toLowerCase()}-pilot-objective`, grammarIds: [], vocabularyIds: [], kanjiIds: [],
    instruction: draftText('もっともいいものを一つえらんでください。'), passage: passage ? draftText(passage) : undefined, prompt: draftText(prompt),
    choices: choices.map((choice, index) => ({ id: `${id}-choice-${index + 1}`, label: { japanese: draftText(choice) }, isCorrect: index === correctIndex, explanation: { english: index === correctIndex ? 'This is the best answer for the target pattern.' : 'This is plausible but does not satisfy the target pattern.' } })),
    explanation: { correct: { english: 'Review the sentence structure and the target word in context.' }, distractors: choices.filter((_, index) => index !== correctIndex).map((_, index) => ({ choiceId: `${id}-choice-${index >= correctIndex ? index + 2 : index + 1}`, explanation: { english: 'This option does not fit the tested grammar, meaning, or passage evidence.' } })), commonMistake: { english: 'Choose the option that is grammatical and supported by the full context.' }, readingEvidenceTokenIds: [], vocabularyIds: [], kanjiIds: [] },
    difficulty: level === 'N5' ? 2 : 3, estimatedSeconds: type.includes('reading') ? 90 : 45, validationStatus: 'draft', similarityScore: 0,
    sourceReferences: [{ id: `${id}-source`, sourceChunkId: binding.sourceChunkId, sourcePath: binding.sourcePath, sourceRole: 'question_pattern', note: 'Original draft follows the approved structural pattern only.' }],
  };
}

/** Ten original, unpublished pilot drafts. They do not reproduce source-paper wording. */
export function buildLessonsV2QuestionPilots(sources: PilotSourceBindings): { n5: LessonV2Question[]; n4: LessonV2Question[] } {
  return {
    n5: [
      question('pilot-n5-kanji-reading', 'N5', 'kanji_reading', 'vocabulary_kanji', sources.n5_reading, '「新しい」の読み方はどれですか。', ['あたらしい', 'あだらしい', 'しんしい', 'あらたしい'], 0),
      question('pilot-n5-vocabulary-context', 'N5', 'vocabulary_cloze', 'vocabulary_kanji', sources.n5_vocabulary, '雨がふりそうですから、かさを（　）。', ['もちます', 'あらいます', 'うたいます', 'あけます'], 0),
      question('pilot-n5-grammar-choice', 'N5', 'grammar_cloze', 'grammar', sources.n5_grammar, 'わたしは毎朝、七時（　）起きます。', ['に', 'を', 'が', 'で'], 0),
      question('pilot-n5-sentence-order', 'N5', 'sentence_order_star', 'grammar', sources.n5_order, '田中さんは きのう ___ ★ ___ かいました。', ['で', '本を', '本屋', 'に'], 2),
      question('pilot-n5-short-reading', 'N5', 'short_reading', 'reading', sources.n5_reading_passage, 'このお知らせから、何がわかりますか。', ['土曜日は休みです。', '水曜日は九時に開きます。', '本は一人一冊だけです。', '日曜日は午後に開きます。'], 0, '図書館のお知らせ\n月曜日から金曜日は午前九時から午後六時までです。土曜日と日曜日は休みです。'),
    ],
    n4: [
      question('pilot-n4-word-usage', 'N4', 'word_usage', 'vocabulary_kanji', sources.n4_usage, '「予約」の使い方として、もっともいいものはどれですか。', ['来週のレストランを予約しました。', '駅まで予約で歩きました。', '予約な天気でした。', 'この本を予約に読みました。'], 0),
      question('pilot-n4-grammar-choice', 'N4', 'grammar_cloze', 'grammar', sources.n4_grammar, '電車が遅れた（　）、会議に間に合いませんでした。', ['ので', 'まで', 'しか', 'ながら'], 0),
      question('pilot-n4-sentence-order', 'N4', 'sentence_order_star', 'grammar', sources.n4_order, 'この仕事は ___ ___ ★ ___ と思います。', ['大切', '経験に', 'なる', 'いい'], 1),
      question('pilot-n4-short-reading', 'N4', 'short_reading', 'reading', sources.n4_reading, 'メールを読んで、佐藤さんは何をしますか。', ['午後三時に駅で待ちます。', '午前十時に店へ行きます。', '明日電話をかけます。', '会議をキャンセルします。'], 0, '佐藤さんへ\n会議は午後三時からになりました。駅の入り口で待っています。'),
      question('pilot-n4-information-retrieval', 'N4', 'information_retrieval', 'reading', sources.n4_information, 'この案内によると、プールを使えないのはいつですか。', ['火曜日の午前', '火曜日の午後', '水曜日の午前', '水曜日の午後'], 0, '市民プール\n火曜日は午後一時から使えます。水曜日は休館です。'),
    ],
  };
}
