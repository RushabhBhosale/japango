import type { AudioLessonType, AudioLessonVersion, AudioListeningQuestion, AudioScriptSection } from './contracts';
import { expandedAudioPilotDefinitions } from './expanded-catalog';

export interface AudioPilotSourceBinding {
  sourceChunkId: string;
  sourcePath: string;
  patternId?: string;
}

export interface AudioPilotBindings {
  source: AudioPilotSourceBinding;
  vocabularyIds: readonly string[];
  grammarIds: readonly string[];
  kanjiIds: readonly string[];
  relatedLessonIds?: readonly string[];
}

export interface AudioPilotDefinition {
  slug: string;
  title: string;
  subtitle: string;
  level: 'N5' | 'N4';
  type: AudioLessonType;
  difficulty: number;
  objective: string;
  speakerNames: readonly [string, string];
  japanese: readonly [string, string, string, string];
  englishGoal: string;
  questionPrompt: string;
  choices: readonly [string, string, string, string];
  correctIndex: number;
  correctExplanation: string;
  commonMistake: string;
  /** Plain-English teaching notes are spoken so a listener can learn without reading the screen. */
  vocabularyNote?: string;
  grammarNote?: string;
}

function draftJapanese(raw: string) {
  const characters = Array.from(raw);
  const tokens = Array.from({ length: Math.ceil(characters.length / 100) }, (_, index) => ({
    id: `draft-${raw.length}-${raw.charCodeAt(0)}-${index + 1}`,
    kind: 'plain' as const,
    surface: characters.slice(index * 100, (index + 1) * 100).join(''),
    kanjiIds: [],
    status: 'needs_review' as const,
  }));
  return { raw, tokens, status: 'needs_review' as const };
}

function sourceReference(binding: AudioPilotSourceBinding, suffix: string) {
  return [{
    id: `audio-pilot-source-${suffix}`,
    sourceChunkId: binding.sourceChunkId,
    sourcePath: binding.sourcePath,
    sourceRole: 'lesson_grounding' as const,
    note: binding.patternId ? `Original audio-first lesson grounded by reviewed pattern ${binding.patternId}.` : 'Original audio-first lesson grounded by a reviewed OCR source.',
  }];
}

function estimatedSpokenDurationMs(text: string, language: 'japanese' | 'english', speakingRate: number): number {
  const japaneseCharacters = (text.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) ?? []).length;
  const englishWords = text.replace(/[\u3040-\u30ff\u3400-\u9fff]/gu, ' ').trim().split(/\s+/u).filter(Boolean).length;
  const duration = language === 'japanese'
    ? (japaneseCharacters / (5.2 * speakingRate)) * 1_000
    : (englishWords / (2.5 * speakingRate)) * 1_000;
  return Math.max(500, Math.round(duration));
}

function japaneseSection(
  id: string,
  sectionType: AudioScriptSection['sectionType'],
  speaker: string,
  text: string,
  pauseAfterMs = 1_500,
  speakingRate = 0.78,
): AudioScriptSection {
  return {
    id, sectionType, speaker: { id: `${id}-speaker`, name: speaker, language: 'ja-JP' }, language: 'japanese', text,
    structuredJapanese: draftJapanese(text), transcript: text, pauseAfterMs, speakingRate, repeatCount: 1,
    audioStatus: 'system_speech', estimatedDurationMs: estimatedSpokenDurationMs(text, 'japanese', speakingRate), sourceReferences: [],
  };
}

function englishCue(
  id: string,
  sectionType: AudioScriptSection['sectionType'],
  text: string,
  pauseAfterMs = 2_000,
): AudioScriptSection {
  const speakingRate = 0.92;
  return {
    id, sectionType, speaker: { id: `${id}-speaker`, name: 'Guide', language: 'en-US' }, language: 'english', text,
    transcript: text, pauseAfterMs, speakingRate, repeatCount: 1, audioStatus: 'system_speech',
    estimatedDurationMs: estimatedSpokenDurationMs(text, 'english', speakingRate), sourceReferences: [],
  };
}

function japaneseOnlyVocabulary(raw: string): { text: string; terms: string[] } {
  if (!/[A-Za-z]/u.test(raw)) return { text: raw, terms: [] };
  const terms = raw.split(/[、。]/u).flatMap((clause) => {
    if (!/[A-Za-z]/u.test(clause)) return [];
    const beforeEnglish = clause.slice(0, Math.max(0, clause.search(/[A-Za-z]/u)));
    const matches = beforeEnglish.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー～]+/gu) ?? [];
    const candidate = matches.at(-1)?.replace(/は$/u, '').trim();
    return candidate && candidate.length <= 18 ? [candidate] : [];
  });
  const uniqueTerms = [...new Set(terms)];
  const pureSentences = raw.split(/(?<=[。])/u).filter((sentence) => !/[A-Za-z]/u.test(sentence) && /[\u3040-\u30ff\u3400-\u9fff]/u.test(sentence));
  const introduction = uniqueTerms.length
    ? `今日の大切な言葉は、「${uniqueTerms.join('」、「')}」です。`
    : '今日の大切な言葉を、会話の中で確認します。';
  return {
    text: `${pureSentences.join('')}${introduction}それぞれの音と、文の中で使われる場所に注意して聞いてください。`,
    terms: uniqueTerms,
  };
}

function japaneseOnlyGrammar(raw: string): string {
  if (!/[A-Za-z]/u.test(raw)) return raw;
  if (raw.includes('い-adjectives')) return 'い形容詞は、名詞の前に置くことができます。「広い公園」と「暑くない日」の形を聞き比べましょう。';
  if (raw.includes('ました is')) return 'ましたは、丁寧な過去の言い方です。「見ました」「撮りました」「食べました」の終わり方に注目しましょう。';
  const japanese = raw.replace(/[A-Za-z][A-Za-z '-]*/gu, '').replace(/\s+/gu, '').trim();
  return japanese || '今日の文型が、会話の中でどのように使われるか聞きましょう。';
}

function questionListeningFocus(prompt: string): string {
  if (/^when\b/iu.test(prompt)) return '時間、曜日、順番を表す言葉に注意してください。';
  if (/^where\b/iu.test(prompt)) return '場所を表す言葉と、予定が変わったあとの場所に注意してください。';
  if (/^why\b/iu.test(prompt)) return '理由を表す部分と、そのあとの決定に注意してください。';
  if (/^who\b/iu.test(prompt)) return 'だれの行動や考えについて話しているかに注意してください。';
  if (/^how many\b/iu.test(prompt)) return '数と、その数がどの物に付いているかに注意してください。';
  return '人、物、場所、行動のうち、質問に必要な情報に注意してください。';
}

function japaneseRecognitionQuestion(definition: AudioPilotDefinition, binding: AudioPilotSourceBinding, index: number): AudioListeningQuestion {
  const rawChoices = [
    definition.japanese[3],
    definition.japanese[2],
    japaneseOnlyGrammar(definition.japanese[1]),
    japaneseOnlyVocabulary(definition.japanese[0]).text,
  ];
  const offset = [1, 3, 0, 2][index % 4]!;
  const choices = rawChoices.map((_, choiceIndex) => rawChoices[(choiceIndex + offset) % rawChoices.length]!);
  const correct = definition.japanese[3];
  const prompt = `「${definition.japanese[2]}」のあとに聞こえた返事はどれですか。会話の流れを思い出して選んでください。`;
  return {
    id: `${definition.slug}-recognition-question`,
    type: 'dialogue_comprehension',
    prompt: { japanese: draftJapanese(prompt) },
    referencedSectionIds: [`${definition.slug}-dialogue-natural`],
    thinkingPauseMs: 8_000,
    choices: choices.map((choice, choiceIndex) => ({
      id: `${definition.slug}-recognition-choice-${choiceIndex + 1}`,
      label: { japanese: draftJapanese(choice) },
      isCorrect: choice === correct,
    })),
    explanation: {
      correct: { japanese: draftJapanese(`正しい答えは「${correct}」です。最初の人の文に対する返事として、この文が聞こえました。`) },
      distractors: choices.flatMap((choice, choiceIndex) => choice === correct ? [] : [{
        choiceId: `${definition.slug}-recognition-choice-${choiceIndex + 1}`,
        explanation: { japanese: draftJapanese(`「${choice}」は、このレッスンの説明や例に出た文ですが、会話の最後の返事ではありません。`) },
      }]),
      commonMistake: { japanese: draftJapanese(`説明の文ではなく、「${correct}」という最後の返事を選びます。`) },
      readingEvidenceTokenIds: [], vocabularyIds: [], kanjiIds: [],
    },
    sourceReferences: sourceReference(binding, `${definition.slug}-recognition-question`),
  };
}

interface JapanesePracticeQuestionSpec {
  key: string;
  type: AudioListeningQuestion['type'];
  prompt: string;
  choices: readonly [string, string, string, string];
  correctIndex: number;
  correctExplanation: string;
  commonMistake: string;
}

function japanesePracticeQuestion(
  definition: AudioPilotDefinition,
  binding: AudioPilotSourceBinding,
  lessonIndex: number,
  questionIndex: number,
  spec: JapanesePracticeQuestionSpec,
): AudioListeningQuestion {
  const correct = spec.choices[spec.correctIndex]!;
  const offset = [2, 0, 3, 1][(lessonIndex + questionIndex) % 4]!;
  const choices = spec.choices.map((_, choiceIndex) => spec.choices[(choiceIndex + offset) % spec.choices.length]!);
  const correctIndex = choices.indexOf(correct);
  const choiceAnchor = (choice: string) => {
    const quotedContent = choice.match(/「([^」]+)」/u)?.[1] ?? choice;
    return Array.from(quotedContent).slice(0, 24).join('');
  };
  const questionContexts: Readonly<Record<string, string>> = {
    'vocabulary-recall': '言葉の導入を思い出す問題',
    'grammar-recall': '文型の説明を見分ける問題',
    'model-sentence': 'モデル文を聞き分ける問題',
    'spoken-order': '二人の発話順を確かめる問題',
    'guide-pair': '会話前の案内を組み合わせる問題',
    'complete-dialogue': '会話全体を組み立てる問題',
  };
  const questionContext = questionContexts[spec.key] ?? '聞こえた内容を確かめる問題';
  const lessonAnchor = Array.from(definition.japanese[3]).slice(-20).join('');
  const distractorTemplates = [
    (choice: string) => `${questionContext}では、「${choiceAnchor(choice)}」は求められた部分と役割が違います。「${lessonAnchor}」と比べてください。`,
    (choice: string) => `${questionContext}では、「${choiceAnchor(choice)}」も聞きましたが答えにはなりません。「${lessonAnchor}」へ戻ります。`,
    (choice: string) => `${questionContext}で「${choiceAnchor(choice)}」を選ぶと、聞こえた順番が変わります。「${lessonAnchor}」が返事です。`,
    (choice: string) => `${questionContext}では、「${choiceAnchor(choice)}」は中心になる情報と一致しません。「${lessonAnchor}」を確認します。`,
  ] as const;
  return {
    id: `${definition.slug}-${spec.key}-question`,
    type: spec.type,
    prompt: { japanese: draftJapanese(spec.prompt) },
    referencedSectionIds: [`${definition.slug}-dialogue-natural`],
    thinkingPauseMs: 8_000,
    choices: choices.map((choice, choiceIndex) => ({
      id: `${definition.slug}-${spec.key}-choice-${choiceIndex + 1}`,
      label: { japanese: draftJapanese(choice) },
      isCorrect: choiceIndex === correctIndex,
    })),
    explanation: {
      correct: { japanese: draftJapanese(spec.correctExplanation) },
      distractors: choices.flatMap((choice, choiceIndex) => choiceIndex === correctIndex ? [] : [{
        choiceId: `${definition.slug}-${spec.key}-choice-${choiceIndex + 1}`,
        explanation: { japanese: draftJapanese(distractorTemplates[choiceIndex]!(choice)) },
      }]),
      commonMistake: { japanese: draftJapanese(spec.commonMistake) },
      readingEvidenceTokenIds: [], vocabularyIds: [], kanjiIds: [],
    },
    sourceReferences: sourceReference(binding, `${definition.slug}-${spec.key}-question`),
  };
}

function expandedListeningQuestions(
  definition: AudioPilotDefinition,
  binding: AudioPilotSourceBinding,
  lessonIndex: number,
  vocabulary: string,
  grammar: string,
): AudioListeningQuestion[] {
  const example = definition.japanese[2];
  const dialogue = definition.japanese[3];
  const specs: readonly JapanesePracticeQuestionSpec[] = [
    {
      key: 'vocabulary-recall', type: 'meaning', correctIndex: 0,
      prompt: `「${example}」という例文より前に聞いた、言葉の導入はどれですか。`,
      choices: [
        `${vocabulary}これは、言葉を会話の前に確認した部分です。`,
        `${grammar}これは、文の形を説明した部分です。`,
        `${example}これは、最初の話し手の短い例です。`,
        `${dialogue}これは、例のあとに続いた返事です。`,
      ],
      correctExplanation: `正しいのは「${vocabulary}」を含む内容です。会話の前に、大切な言葉として聞きました。`,
      commonMistake: `例文や返事も同じ話題ですが、ここでは「${vocabulary}」という最初の言葉の導入を選びます。`,
    },
    {
      key: 'grammar-recall', type: 'sentence_completion', correctIndex: 1,
      prompt: `「${example}」という例文を作る、文型の説明はどれですか。`,
      choices: [
        `${vocabulary}この部分では、場面に必要な言葉を先に確認しました。`,
        `${grammar}この部分では、今日使う文の形を確認しました。`,
        `${example}この部分では、一人目の発話を聞きました。`,
        `${dialogue}この部分では、二人目の返事を聞きました。`,
      ],
      correctExplanation: `文型の説明は「${grammar}」です。この説明のあとで、例文と会話を聞きました。`,
      commonMistake: `「${example}」は文型を使った例文です。例文と「${grammar}」という文型そのものの説明を混同しないようにします。`,
    },
    {
      key: 'model-sentence', type: 'quick_response', correctIndex: 2,
      prompt: `「${dialogue}」という返事の前に、シャドーイングしたモデル文はどれですか。`,
      choices: [
        `${vocabulary}これは、シャドーイングの前に聞いた言葉の確認です。`,
        `${grammar}これは、モデル文より前に聞いた文型の説明です。`,
        `${example}これは、最初に声に出して練習したモデル文です。`,
        `${dialogue}これは、モデル文のあとに練習した返事です。`,
      ],
      correctExplanation: `最初に声に出したモデル文は「${example}」です。そのあとで、相手の返事を練習しました。`,
      commonMistake: `「${dialogue}」という返事も練習しましたが、質問はその前のモデル文を聞いています。`,
    },
    {
      key: 'spoken-order', type: 'next_action', correctIndex: 0,
      prompt: `「${vocabulary}」の場面で、二人の文をどの順番で聞きましたか。`,
      choices: [
        `話し手が「${example}」と言って場面を進め、その内容を受けて「${dialogue}」という返事が続きました。`,
        `返事の「${dialogue}」から会話が始まり、あとから「${example}」という最初の発話を付け足しました。`,
        `会話ではなく案内が続き、「${vocabulary}」のあとに「${grammar}」という説明を聞きました。`,
        `文型の案内「${grammar}」が先で、そのあとに言葉の導入「${vocabulary}」へ戻りました。`,
      ],
      correctExplanation: `正しい順番は「${example}」、次に「${dialogue}」です。二番目の文が返事になります。`,
      commonMistake: `「${vocabulary}」から始まるレッスン全体の説明順ではなく、「${example}」から始まる二人の会話だけの順番を答えます。`,
    },
    {
      key: 'guide-pair', type: 'detail', correctIndex: 0,
      prompt: `「${dialogue}」の会話より前に聞いた、言葉と文型の組み合わせはどれですか。`,
      choices: [
        `案内の組み合わせです。「${vocabulary}」続いて「${grammar}」と聞きました。`,
        `会話の組み合わせです。「${example}」続いて「${dialogue}」と聞きました。`,
        `異なる段階の組み合わせです。「${vocabulary}」続いて「${example}」と聞きました。`,
        `説明と返事の組み合わせです。「${grammar}」続いて「${dialogue}」と聞きました。`,
      ],
      correctExplanation: `会話の前の案内では「${vocabulary}」と「${grammar}」を順に確認しました。`,
      commonMistake: `「${example}」と「${dialogue}」は会話練習の部分です。ここでは、その前に聞いた二つの案内を選びます。`,
    },
    {
      key: 'complete-dialogue', type: 'dialogue_comprehension', correctIndex: 0,
      prompt: `「${vocabulary}」の場面で、二人が話した発話と返事の組み合わせを選んでください。`,
      choices: [
        `会話全体は「${example}」に「${dialogue}」が続きます。この二つが自然な発話と返事です。`,
        `逆の順番で「${dialogue}」に「${example}」が続きます。返事から会話が始まります。`,
        `説明だけの組み合わせで「${grammar}」に「${vocabulary}」が続きます。`,
        `異なる役割の組み合わせで「${vocabulary}」に「${dialogue}」が続きます。`,
      ],
      correctExplanation: `実際の会話は「${example}」のあとに「${dialogue}」と続きます。これが最初の発話と返事の組み合わせです。`,
      commonMistake: `「${grammar}」のような説明と、「${example}${dialogue}」という会話は役割が違います。二人が話した二文だけを選びます。`,
    },
  ];
  return specs.map((spec, questionIndex) => japanesePracticeQuestion(definition, binding, lessonIndex, questionIndex, spec));
}

function questionChoices(definition: AudioPilotDefinition, index: number) {
  const offset = [2, 0, 3, 1][index % 4]!;
  return definition.choices.map((_, choiceIndex) => definition.choices[(choiceIndex + offset) % definition.choices.length]!);
}

function listeningQuestion(definition: AudioPilotDefinition, binding: AudioPilotSourceBinding, index: number): AudioListeningQuestion {
  const correct = definition.choices[definition.correctIndex]!;
  const choices = questionChoices(definition, index);
  const correctIndex = choices.indexOf(correct);
  const japanesePrompt = `「${definition.japanese[2]}」に続く会話を聞いて、質問の答えとして正しいものを一つ選んでください。${questionListeningFocus(definition.questionPrompt)}`;
  const distractorExplanation = (choice: string, choiceIndex: number): string => [
    `The exchange never states “${choice}.” The evidence instead supports “${correct}”: ${definition.correctExplanation}`,
    `“${choice}” changes a detail from the heard scene. ${definition.commonMistake}`,
    `Reject “${choice}” because it conflicts with the final reply. The supported answer is “${correct}.”`,
    `“${choice}” may fit the topic, but no spoken line confirms it. ${definition.correctExplanation}`,
  ][choiceIndex]!;
  return {
    id: `${definition.slug}-question`, type: definition.type === 'jlpt_listening_practice' ? 'dialogue_comprehension' : 'detail',
    prompt: { japanese: draftJapanese(japanesePrompt), english: definition.questionPrompt }, referencedSectionIds: [`${definition.slug}-dialogue-natural`], thinkingPauseMs: 6_000,
    choices: choices.map((choice, choiceIndex) => ({ id: `${definition.slug}-choice-${choiceIndex + 1}`, label: { english: choice }, isCorrect: choiceIndex === correctIndex })),
    explanation: {
      correct: {
        japanese: draftJapanese(`会話では「${definition.japanese[3]}」と聞こえました。この文の内容が正しい答えの根拠です。`),
        english: definition.correctExplanation,
      },
      distractors: choices.flatMap((choice, choiceIndex) => choiceIndex === correctIndex ? [] : [{
        choiceId: `${definition.slug}-choice-${choiceIndex + 1}`,
        explanation: { english: distractorExplanation(choice, choiceIndex) },
      }]),
      commonMistake: { english: definition.commonMistake }, readingEvidenceTokenIds: [], vocabularyIds: [], kanjiIds: [],
    },
    sourceReferences: sourceReference(binding, `${definition.slug}-question`),
  };
}

function buildPilot(definition: AudioPilotDefinition, bindings: AudioPilotBindings, index: number): AudioLessonVersion {
  const [firstSpeaker, secondSpeaker] = definition.speakerNames;
  const sourceReferences = sourceReference(bindings.source, definition.slug);
  const question = listeningQuestion(definition, bindings.source, index);
  const recognitionQuestion = japaneseRecognitionQuestion(definition, bindings.source, index);
  const vocabulary = japaneseOnlyVocabulary(definition.japanese[0]);
  const grammar = japaneseOnlyGrammar(definition.japanese[1]);
  const example = definition.japanese[2];
  const dialogue = definition.japanese[3];
  const vocabularyDrill = vocabulary.terms.length
    ? vocabulary.terms.map((term) => `「${term}」。もう一度、「${term}」。`).join('')
    : `今日の言葉を、もう一度聞きます。${vocabulary.text}`;
  const listeningFocus = questionListeningFocus(definition.questionPrompt);
  const dialogueType = definition.type === 'short_story'
    ? 'passage'
    : definition.type === 'shadowing_practice'
      ? 'shadowing'
      : 'dialogue';
  const practiceQuestions = expandedListeningQuestions(definition, bindings.source, index, vocabulary.text, grammar);
  const questions = [
    question,
    ...practiceQuestions.slice(0, 3),
    recognitionQuestion,
    ...practiceQuestions.slice(3),
  ];
  const questionNumberWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] as const;
  const questionAudioSections = questions.flatMap((item, questionIndex): AudioScriptSection[] => {
    const numberWord = questionNumberWords[questionIndex]!;
    const prompt = item.prompt.japanese?.raw ?? '会話を思い出して、正しい答えを一つ選んでください。';
    const explanation = item.explanation.correct.japanese?.raw ?? '答えの根拠になる会話を、もう一度確認してください。';
    const correctEnglish = item.choices.find((choice) => choice.isCorrect)?.label.english;
    return [
      englishCue(`${definition.slug}-question-${questionIndex + 1}-cue`, 'listening_question', `Question ${numberWord}.`, 2_000),
      japaneseSection(
        `${definition.slug}-question-${questionIndex + 1}-spoken`,
        'listening_question',
        '案内',
        prompt,
        item.thinkingPauseMs,
        0.78,
      ),
      englishCue(
        `${definition.slug}-answer-${questionIndex + 1}-cue`,
        'answer',
        `Answer ${numberWord}.${correctEnglish ? ` ${correctEnglish}` : ''}`,
        1_500,
      ),
      japaneseSection(
        `${definition.slug}-answer-${questionIndex + 1}-spoken`,
        'explanation',
        '案内',
        explanation,
        2_500,
        0.76,
      ),
    ];
  });
  const sections: AudioScriptSection[] = [
    japaneseSection(
      `${definition.slug}-introduction`,
      'introduction',
      '案内',
      `音声レッスンを始めます。${vocabulary.text}${grammar}この言葉と文型を、次の例文と会話で練習します。${example}`,
      2_000,
      0.76,
    ),
    japaneseSection(
      `${definition.slug}-vocabulary`,
      'vocabulary',
      '案内',
      `大切な言葉を、音のまとまりとして覚えます。${vocabularyDrill}次は、同じ言葉が文の中でどう聞こえるか確かめます。${vocabulary.text}一つ一つの言葉だけでなく、前と後の音も一緒に聞いてください。`,
      2_500,
      0.72,
    ),
    japaneseSection(
      `${definition.slug}-grammar`,
      'grammar_focus',
      '案内',
      `今日の文型を確認します。${grammar}文型の前に来る言葉にも注意してください。${example}もう一度、少しゆっくり聞きます。${example}`,
      3_000,
      0.72,
    ),
    japaneseSection(
      `${definition.slug}-example-guided`,
      'example',
      firstSpeaker,
      `例文を使って、意味のまとまりをつかみます。最初は普通に聞いてください。${example}次は、聞こえたとおりに声に出してください。${example}`,
      4_000,
      0.7,
    ),
    japaneseSection(
      `${definition.slug}-dialogue-first`,
      dialogueType,
      secondSpeaker,
      `ここからは会話です。最初の一回は、だれが何を言うか、全体の流れを聞いてください。${example}${dialogue}今聞こえた言葉の中で、今日の文型が使われた場所を思い出してください。`,
      3_500,
      0.8,
    ),
    japaneseSection(
      `${definition.slug}-dialogue-detail`,
      'dialogue',
      '案内',
      `会話を細かく聞きます。最初の人の文です。${example}次に、相手の返事です。${dialogue}二つの文を続けます。${example}${dialogue}${listeningFocus}`,
      4_000,
      0.72,
    ),
    japaneseSection(
      `${definition.slug}-shadowing`,
      'shadowing',
      firstSpeaker,
      `次はシャドーイングです。少し遅れて同じように言ってください。速さより、助詞と文の終わりを大切にします。${example}もう一度。${example}次は返事です。${dialogue}もう一度。${dialogue}`,
      4_500,
      0.68,
    ),
    japaneseSection(
      `${definition.slug}-dialogue-natural`,
      dialogueType,
      secondSpeaker,
      `今度は自然な速さで聞きます。説明はありません。場面を想像しながら、二人の会話だけに集中してください。${example}${dialogue}もう一度聞きます。${example}${dialogue}`,
      3_000,
      0.9,
    ),
    ...questionAudioSections,
    japaneseSection(
      `${definition.slug}-review`,
      'review',
      '案内',
      `最後の復習です。今日の言葉です。${vocabulary.text}今日の文型です。${grammar}例文と返事を続けます。${example}${dialogue}`,
      3_000,
      0.72,
    ),
    japaneseSection(
      `${definition.slug}-closing`,
      'closing',
      '案内',
      `この音声レッスンは終わりです。最後に、今日の例文と会話を、止めずに聞いてください。意味を頭の中で思い浮かべたあと、自分でも一度言ってみましょう。${example}${dialogue}`,
      1_500,
      0.82,
    ),
  ].map((section) => ({ ...section, sourceReferences }));
  const totalDurationMs = sections.reduce((total, section) => total + section.estimatedDurationMs + section.pauseAfterMs, 0);
  const estimatedMinutes = Math.max(5, Math.min(18, Math.round(totalDurationMs / 60_000)));
  return {
    id: `audio-pilot-${String(index + 1).padStart(2, '0')}`,
    lessonId: `audio-pilot-${String(index + 1).padStart(2, '0')}`,
    version: 1,
    slug: definition.slug,
    title: definition.title,
    subtitle: definition.subtitle,
    jlptLevel: definition.level,
    difficulty: definition.difficulty,
    lessonType: definition.type,
    estimatedMinutes,
    objectives: [definition.objective],
    prerequisites: [],
    relatedLessonIds: [...(bindings.relatedLessonIds ?? [])],
    vocabularyIds: [...bindings.vocabularyIds],
    kanjiIds: [...bindings.kanjiIds],
    grammarIds: [...bindings.grammarIds],
    modes: ['japanese_english', 'slow_japanese', 'normal_japanese', ...(definition.type === 'shadowing_practice' ? ['shadowing' as const] : [])],
    scriptSections: sections,
    listeningQuestions: questions,
    sourceReferences,
    generationMetadata: { generator: 'deterministic_pipeline', generatedAt: '2026-08-05T00:00:00.000Z', ttsProvider: 'system-speech', sourceQuery: 'Reviewed OCR textbook and JLPT pattern grounding; Japanese-immersion audio script with measured timing.' },
    status: 'draft',
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
}

const baseDefinitions: readonly AudioPilotDefinition[] = [
  { slug: 'n5-morning-routine-masu', title: 'A Morning Routine with ます', subtitle: 'Use polite daily-action sentences while you get ready.', level: 'N5', type: 'grammar_explanation', difficulty: 1, objective: 'Recognise and use a polite ます-form action.', speakerNames: ['Mika', 'Ken'], japanese: ['今日は「起きます」と「食べます」を聞きます。朝の行動を、ますで短く言いましょう。', '「毎朝七時に起きます。」時間のあとに、何をするかを言います。', 'ミカ：朝ごはんを食べてから、駅へ行きます。', 'ケン：ぼくは家でコーヒーを飲んでから、会社へ行きます。'], englishGoal: 'Listen for the polite ending ます, then use it to describe a routine without looking at a screen.', questionPrompt: 'What does Mika do before going to the station?', choices: ['She eats breakfast.', 'She calls her teacher.', 'She studies at the library.', 'She buys a ticket.'], correctIndex: 0, correctExplanation: 'Mika says she eats breakfast and then goes to the station.', commonMistake: 'Do not choose an action that sounds familiar but was not said before 駅へ行きます.' },
  { slug: 'n5-library-te-kudasai', title: 'Polite Requests at the Library', subtitle: 'Hear てください in a calm library situation.', level: 'N5', type: 'grammar_explanation', difficulty: 2, objective: 'Understand a simple request with てください.', speakerNames: ['Aya', 'Sora'], japanese: ['図書館では「静かにしてください」と言うことがあります。これは丁寧なお願いです。', '動詞のて形のあとに、くださいを付けると、相手へのお願いになります。', 'アヤ：この本を借りたいです。カードを見せてください。', 'ソラ：はい、どうぞ。返す日も確認してください。'], englishGoal: 'Recognise a request, hear what the listener needs to do, and repeat the key phrase at a comfortable pace.', questionPrompt: 'What does Aya ask Sora to show?', choices: ['A library card.', 'A train map.', 'A restaurant menu.', 'A class schedule.'], correctIndex: 0, correctExplanation: 'Aya asks to see the card before borrowing the book.', commonMistake: 'ください marks a request; listen to the noun immediately before it.' },
  { slug: 'n5-market-vegetable-review', title: 'Vegetables at the Market', subtitle: 'Review useful food words in a market exchange.', level: 'N5', type: 'vocabulary_review', difficulty: 1, objective: 'Identify familiar food vocabulary in a shopping conversation.', speakerNames: ['Yui', 'Daichi'], japanese: ['市場では野菜の名前を聞くことが多いです。にんじん、たまねぎ、じゃがいもを聞いてみましょう。', '数を言う時は、買いたい物と一緒にゆっくり言うと分かりやすいです。', 'ユイ：にんじんを二本と、たまねぎを三つください。', 'ダイチ：じゃがいもも新しいですよ。少し買いますか。'], englishGoal: 'Follow a short shopping order and pick out the food item the customer does not order at first.', questionPrompt: 'Which item does Yui not ask for in her first order?', choices: ['Potatoes.', 'Carrots.', 'Onions.', 'Two carrots.'], correctIndex: 0, correctExplanation: 'Yui orders carrots and onions. Daichi introduces potatoes afterward.', commonMistake: 'Keep the customer’s order separate from the shopkeeper’s later suggestion.' },
  { slug: 'n5-station-time-pattern', title: 'Finding the Departure Time', subtitle: 'Practise a time-and-place sentence pattern at a station.', level: 'N5', type: 'sentence_pattern_drill', difficulty: 2, objective: 'Follow a simple sentence that gives a departure time.', speakerNames: ['Rina', 'Haru'], japanese: ['駅では、何時に出ますか、と聞くことがあります。時間の数字をはっきり聞きましょう。', '「電車は八時十分に出ます。」のように、時間のあとに に を使います。', 'リナ：大阪行きの電車は、何時に出ますか。', 'ハル：三番線から、八時十分に出ます。'], englishGoal: 'Listen for a time and platform, then practise saying the time in a complete sentence.', questionPrompt: 'When does the train leave?', choices: ['At 8:10.', 'At 3:00.', 'At 10:08.', 'At 8:30.'], correctIndex: 0, correctExplanation: 'Haru says 八時十分, which is 8:10.', commonMistake: 'The platform number comes before the time, so do not confuse 三番線 with the departure time.' },
  { slug: 'n5-cafe-dialogue', title: 'Choosing a Drink at a Café', subtitle: 'Listen to a natural, short café dialogue.', level: 'N5', type: 'dialogue_practice', difficulty: 2, objective: 'Understand a preference and a polite order in a café.', speakerNames: ['Noa', 'Toma'], japanese: ['カフェでは、飲み物と値段を聞いてから注文できます。', '「何にしますか」は、何を選ぶか聞く時の自然な言い方です。', 'ノア：わたしは熱いお茶にします。トマさんは？', 'トマ：ぼくはアイスコーヒーを一つください。'], englishGoal: 'Hear two different drink choices and shadow the polite order after a short pause.', questionPrompt: 'What does Toma order?', choices: ['One iced coffee.', 'Hot tea.', 'Two juices.', 'A bowl of soup.'], correctIndex: 0, correctExplanation: 'Toma says アイスコーヒーを一つください.', commonMistake: 'Noa chooses tea; Toma chooses coffee. Track which speaker is talking.' },
  { slug: 'n5-clinic-appointment', title: 'A Short Clinic Call', subtitle: 'Listen for an appointment detail during a phone call.', level: 'N5', type: 'listening_comprehension', difficulty: 3, objective: 'Identify the day of a simple appointment.', speakerNames: ['Emi', 'Ryo'], japanese: ['電話では、日と時間を確認することが大切です。聞こえなかった時は、もう一度お願いします、と言えます。', '予約は、前に決めておく時間や場所のことです。', 'エミ：木曜日の午後、先生に会いたいです。', 'リョウ：では、木曜日の二時に来てください。'], englishGoal: 'Listen to a clinic call without relying on written dates, then identify the appointment time.', questionPrompt: 'When should Emi come to the clinic?', choices: ['Thursday at 2 p.m.', 'Friday at 2 p.m.', 'Thursday at 10 a.m.', 'Monday at 2 p.m.'], correctIndex: 0, correctExplanation: 'The caller confirms 木曜日の二時, Thursday at two in the afternoon.', commonMistake: 'Listen for both the day and the hour; one correct detail alone is not enough.' },
  { slug: 'n4-late-train-node', title: 'Explaining a Late Train with ので', subtitle: 'Hear a calm reason-and-result explanation.', level: 'N4', type: 'grammar_explanation', difficulty: 3, objective: 'Understand ので as a polite reason in a practical explanation.', speakerNames: ['Mai', 'Jun'], japanese: ['理由をやわらかく説明したい時、のでを使えます。', '「電車が遅れたので、会議に間に合いませんでした。」理由のあとに結果が来ます。', 'マイ：すみません。雨で電車が遅れたので、少し遅れます。', 'ジュン：分かりました。会議は十分あとに始めましょう。'], englishGoal: 'Follow the reason first, then the result, and notice that the response changes the meeting plan.', questionPrompt: 'Why will Mai arrive late?', choices: ['Her train was delayed by rain.', 'She missed a restaurant reservation.', 'She forgot the meeting room.', 'Her friend changed jobs.'], correctIndex: 0, correctExplanation: 'Mai gives rain and a delayed train as the reason for being late.', commonMistake: 'ので links the reason to the result; do not choose a later detail that was never spoken.' },
  { slug: 'n4-apartment-dialogue', title: 'Talking About a New Apartment', subtitle: 'Follow a practical dialogue about moving and neighbourhood choices.', level: 'N4', type: 'dialogue_practice', difficulty: 3, objective: 'Identify a speaker’s priority when choosing an apartment.', speakerNames: ['Kaho', 'Ren'], japanese: ['部屋を探す時は、駅からの距離やスーパーの近さを比べることがあります。', '「～ほうがいい」は、二つの選択を比べて勧める時に使えます。', 'カホ：駅から近い部屋のほうが、帰りが遅い日には便利ですね。', 'レン：そうですね。でも、静かな場所なら少し遠くてもいいと思います。'], englishGoal: 'Distinguish convenience from quietness and practise giving a personal reason for a choice.', questionPrompt: 'What does Ren value when choosing an apartment?', choices: ['A quiet location.', 'A large restaurant.', 'A shorter meeting.', 'A cheaper train ticket.'], correctIndex: 0, correctExplanation: 'Ren says a quiet place is acceptable even if it is a little farther away.', commonMistake: 'Kaho talks about being near the station; Ren adds a different priority.' },
  { slug: 'n4-rainy-festival-story', title: 'The Rainy Festival Plan', subtitle: 'Follow a short story about changing plans without losing the main detail.', level: 'N4', type: 'short_story', difficulty: 3, objective: 'Understand a change of plan in a connected short story.', speakerNames: ['Saki', 'Kei'], japanese: ['町の祭りは午後から始まる予定でしたが、朝から雨が降っていました。', '～ことにする は、相談したあとで決めたことを言う時に使えます。', 'サキ：外の店は難しそうですから、体育館で食べることにしましょう。', 'ケイ：いいですね。音楽の時間には、みんなで会場へ行けるかもしれません。'], englishGoal: 'Listen for the weather problem, the new meal plan, and the possibility that remains later in the day.', questionPrompt: 'Where do Saki and Kei decide to eat?', choices: ['In the gymnasium.', 'At an outside stall.', 'On the train.', 'At Kei’s apartment.'], correctIndex: 0, correctExplanation: 'Because of rain, Saki proposes eating in the gymnasium.', commonMistake: 'The outside stalls are the problem, not the chosen place.' },
  { slug: 'n4-jlpt-meeting-detail', title: 'JLPT Listening: The Meeting Room', subtitle: 'Practise selecting one exact detail from a workplace exchange.', level: 'N4', type: 'jlpt_listening_practice', difficulty: 4, objective: 'Identify the room and time that a speaker changes in a workplace announcement.', speakerNames: ['Nana', 'Yuto'], japanese: ['短い案内では、最初の予定と変わった予定を分けて聞く必要があります。', '「～に変更になりました」は、予定が別のものになったことを伝えます。', 'ナナ：会議は三時から二階の部屋でしたよね。', 'ユウト：時間はそのままです。でも、部屋は四階の四〇二に変更になりました。'], englishGoal: 'Use a JLPT-style listening strategy: keep the unchanged detail, then replace only the detail that changed.', questionPrompt: 'Where will the meeting take place?', choices: ['Room 402 on the fourth floor.', 'The room on the second floor.', 'At four o’clock in the lobby.', 'In a restaurant at three.'], correctIndex: 0, correctExplanation: 'The time stays at three, but the room changes to 402 on the fourth floor.', commonMistake: 'The first room is deliberately plausible; listen for 変更になりました.' },
];

const definitions: readonly AudioPilotDefinition[] = [...baseDefinitions, ...expandedAudioPilotDefinitions];

/** Sixty original, audio-first N5/N4 lessons. Their source/dependency bindings are supplied by reviewed management data. */
export function buildAudioLessonPilots(bindings: AudioPilotBindings): AudioLessonVersion[] {
  return definitions.map((definition, index) => buildPilot(definition, bindings, index));
}
