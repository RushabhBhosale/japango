import type { LessonV2Question, StructuredJapaneseText } from './contracts';

export interface PilotSourceBinding { patternId: string; sourceChunkId: string; sourcePath: string; }
export type PilotSourceBindings = Record<'n5_reading' | 'n5_vocabulary' | 'n5_grammar' | 'n5_order' | 'n5_reading_passage' | 'n4_usage' | 'n4_grammar' | 'n4_order' | 'n4_reading' | 'n4_information', PilotSourceBinding>;

function draftText(raw: string): StructuredJapaneseText {
  // The pilot is intentionally a draft. The editor must replace this
  // conservative tokenization with linked, verified word tokens before publish.
  return { raw, tokens: [{ id: `draft-${raw.length}-${raw.charCodeAt(0)}`, kind: 'plain', surface: raw, kanjiIds: [], status: 'needs_review' }], status: 'needs_review' };
}

function instructionFor(type: LessonV2Question['type']): string {
  const instructions: Record<LessonV2Question['type'], string> = {
    kanji_reading: '太字の言葉の読み方として、もっとも適切なものを選んでください。',
    kana_to_kanji: '文の意味に合う漢字の書き方を一つ選んでください。',
    vocabulary_cloze: '文の場面に合う言葉を一つ選んでください。',
    similar_meaning: '文の意味が変わらない言い方を一つ選んでください。',
    word_usage: '言葉の使い方として自然な文を一つ選んでください。',
    grammar_cloze: '文の前後の関係に合う形を一つ選んでください。',
    sentence_order_star: '★に入る語の位置を考えて、自然な文を作ってください。',
    short_reading: '文章を読んで、書かれている内容に合う答えを一つ選んでください。',
    information_retrieval: '案内の必要な行を見つけて、条件に合う答えを一つ選んでください。',
    listening_task: '音声の要点を聞いて、話し手の意図に合う答えを一つ選んでください。',
    listening_quick_response: '聞こえた場面に最も自然に返す言葉を一つ選んでください。',
    app_practice: '学習した形を使える文を一つ選んでください。',
  };
  return instructions[type];
}

function correctExplanationFor(type: LessonV2Question['type'], prompt: string, answer: string): string {
  const explanations: Partial<Record<LessonV2Question['type'], string>> = {
    kanji_reading: `The word in the prompt is read “${answer}”; the other choices change its sound.`,
    vocabulary_cloze: `“${answer}” is the action that naturally follows when rain is likely.`,
    grammar_cloze: `“${answer}” marks the specific time when the speaker gets up.`,
    word_usage: `“${answer}” uses 予約 for arranging a future restaurant visit.`,
    sentence_order_star: `“${answer}” is the chunk that places ★ in the natural word order.`,
    short_reading: `“${answer}” is stated directly in the notice or message.`,
    information_retrieval: `“${answer}” matches the time condition written in the pool notice.`,
  };
  return explanations[type] ?? `“${answer}” is the only option supported by the full context: ${prompt}`;
}

function distractorExplanationFor(type: LessonV2Question['type'], choice: string, index: number): string {
  const reasons = [
    `“${choice}” changes the meaning or form that this item is testing.`,
    `The wording “${choice}” may look familiar, but it is not supported by this sentence.`,
    `Choosing “${choice}” would make the context unnatural or incomplete.`,
  ];
  if (type === 'kanji_reading') return `“${choice}” is not the standard reading of the word shown.`;
  if (type === 'sentence_order_star') return `Putting ★ with “${choice}” does not make a natural sentence order.`;
  if (type === 'short_reading' || type === 'information_retrieval') return `“${choice}” is not the detail given in the passage.`;
  return reasons[index % reasons.length]!;
}

function commonMistakeFor(type: LessonV2Question['type']): string {
  const mistakes: Record<LessonV2Question['type'], string> = {
    kanji_reading: 'Check the reading of the whole word, not a sound guessed from one kanji.',
    kana_to_kanji: 'Use the sentence meaning before choosing a familiar-looking character.',
    vocabulary_cloze: 'Read the whole situation before choosing a word that merely sounds possible.',
    similar_meaning: 'Match the intended meaning, not just one repeated word.',
    word_usage: 'A known word still needs to fit the grammar and the real-life situation.',
    grammar_cloze: 'Use the relationship between the two parts of the sentence, not only the word before the blank.',
    sentence_order_star: 'Find the predicate first, then place the ★ chunk around it.',
    short_reading: 'Choose only information stated in the passage; do not fill gaps with a guess.',
    information_retrieval: 'Check the exact day and time condition in the notice.',
    listening_task: 'Wait for the key detail instead of choosing the first familiar word you hear.',
    listening_quick_response: 'Use the speaker’s situation and politeness level to choose a reply.',
    app_practice: 'Check that the entire sentence, not only one word, uses the target pattern.',
  };
  return mistakes[type];
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
  const correct = choices[correctIndex] ?? '';
  return {
    id, level, type, section, sourcePatternIds: [binding.patternId], testedSkill: type.replaceAll('_', ' '), objectiveId: `${level.toLowerCase()}-pilot-objective`, grammarIds: [], vocabularyIds: [], kanjiIds: [],
    instruction: draftText(instructionFor(type)), passage: passage ? draftText(passage) : undefined, prompt: draftText(prompt),
    choices: choices.map((choice, index) => ({ id: `${id}-choice-${index + 1}`, label: { japanese: draftText(choice) }, isCorrect: index === correctIndex })),
    explanation: { correct: { english: correctExplanationFor(type, prompt, correct) }, distractors: choices.flatMap((choice, index) => index === correctIndex ? [] : [{ choiceId: `${id}-choice-${index + 1}`, explanation: { english: distractorExplanationFor(type, choice, index) } }]), commonMistake: { english: commonMistakeFor(type) }, readingEvidenceTokenIds: [], vocabularyIds: [], kanjiIds: [] },
    difficulty: level === 'N5' ? 2 : 3, estimatedSeconds: type.includes('reading') ? 90 : 45, validationStatus: 'draft', similarityScore: 0,
    sourceReferences: [{ id: `${id}-source`, sourceChunkId: binding.sourceChunkId, sourcePath: binding.sourcePath, sourceRole: 'question_pattern', note: 'Original draft follows the approved structural pattern only.' }],
  };
}

/** Ten original, unpublished pilot drafts. They do not reproduce source-paper wording. */
export function buildLessonsV2QuestionPilots(sources: PilotSourceBindings): { n5: LessonV2Question[]; n4: LessonV2Question[] } {
  return {
    n5: [
      question('pilot-n5-kanji-reading', 'N5', 'kanji_reading', 'vocabulary_kanji', sources.n5_reading, '「新しい」の読み方はどれですか。', ['あだらしい', 'しんしい', 'あたらしい', 'あらたしい'], 2),
      question('pilot-n5-vocabulary-context', 'N5', 'vocabulary_cloze', 'vocabulary_kanji', sources.n5_vocabulary, '雨がふりそうです。出かける前に、かさを（　）。', ['あらいます', 'うたいます', 'もちます', 'あけます'], 2),
      question('pilot-n5-grammar-choice', 'N5', 'grammar_cloze', 'grammar', sources.n5_grammar, 'わたしは毎朝、七時（　）起きます。', ['を', 'が', 'で', 'に'], 3),
      question('pilot-n5-sentence-order', 'N5', 'sentence_order_star', 'grammar', sources.n5_order, '田中さんは きのう ___ ★ ___ かいました。', ['で', '本を', '本屋', 'に'], 2),
      question('pilot-n5-short-reading', 'N5', 'short_reading', 'reading', sources.n5_reading_passage, 'このお知らせから、何がわかりますか。', ['水曜日は九時に開きます。', '土曜日は休みです。', '本は一人一冊だけです。', '日曜日は午後に開きます。'], 1, '図書館のお知らせ\n月曜日から金曜日は午前九時から午後六時までです。土曜日と日曜日は休みです。'),
    ],
    n4: [
      question('pilot-n4-word-usage', 'N4', 'word_usage', 'vocabulary_kanji', sources.n4_usage, '「予約」の使い方として、もっともいいものはどれですか。', ['駅まで予約で歩きました。', '予約な天気でした。', 'この本を予約に読みました。', '来週のレストランを予約しました。'], 3),
      question('pilot-n4-grammar-choice', 'N4', 'grammar_cloze', 'grammar', sources.n4_grammar, '電車が遅れた（　）、会議に間に合いませんでした。', ['まで', 'しか', 'ながら', 'ので'], 3),
      question('pilot-n4-sentence-order', 'N4', 'sentence_order_star', 'grammar', sources.n4_order, 'この仕事は ___ ___ ★ ___ と思います。', ['大切', '経験に', 'なる', 'いい'], 1),
      question('pilot-n4-short-reading', 'N4', 'short_reading', 'reading', sources.n4_reading, 'メールを読んで、佐藤さんは何をしますか。', ['午前十時に店へ行きます。', '明日電話をかけます。', '午後三時に駅で待ちます。', '会議をキャンセルします。'], 2, '佐藤さんへ\n会議は午後三時からになりました。駅の入り口で待っています。'),
      question('pilot-n4-information-retrieval', 'N4', 'information_retrieval', 'reading', sources.n4_information, 'この案内によると、火曜日にプールを使えるのはいつからですか。', ['午前九時から', '正午から', '午後一時から', '午後六時から'], 2, '市民プール\n火曜日は午後一時から使えます。水曜日は休館です。'),
    ],
  };
}
