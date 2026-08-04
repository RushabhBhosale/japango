import type { AudioLessonType, AudioLessonVersion, AudioListeningQuestion, AudioScriptSection } from './contracts';

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

interface PilotDefinition {
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
}

function draftJapanese(raw: string) {
  return { raw, tokens: [{ id: `draft-${raw.length}-${raw.charCodeAt(0)}`, kind: 'plain' as const, surface: raw, kanjiIds: [], status: 'needs_review' as const }], status: 'needs_review' as const };
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

function japaneseSection(
  id: string,
  sectionType: AudioScriptSection['sectionType'],
  speaker: string,
  text: string,
  estimatedDurationMs: number,
  pauseAfterMs = 1_500,
): AudioScriptSection {
  return {
    id, sectionType, speaker: { id: `${id}-speaker`, name: speaker, language: 'ja-JP' }, language: 'japanese', text,
    structuredJapanese: draftJapanese(text), transcript: text, pauseAfterMs, speakingRate: 0.84, repeatCount: 1,
    audioStatus: 'system_speech', estimatedDurationMs, sourceReferences: [],
  };
}

function englishSection(
  id: string,
  sectionType: AudioScriptSection['sectionType'],
  speaker: string,
  text: string,
  estimatedDurationMs: number,
  pauseAfterMs = 1_500,
): AudioScriptSection {
  return {
    id, sectionType, speaker: { id: `${id}-speaker`, name: speaker, language: 'en-US' }, language: 'english', text,
    transcript: text, pauseAfterMs, speakingRate: 0.92, repeatCount: 1, audioStatus: 'system_speech', estimatedDurationMs, sourceReferences: [],
  };
}

function listeningQuestion(definition: PilotDefinition, binding: AudioPilotSourceBinding): AudioListeningQuestion {
  const correct = definition.choices[definition.correctIndex]!;
  const distractorExplanation = (choice: string, index: number): string => {
    const explanations = [
      `In “${definition.title},” this option introduces “${choice},” but the speakers actually describe ${correct.toLowerCase()}.`,
      `For this ${definition.title.toLowerCase()} scene, listen to the action, not just the setting: ${choice} is never said.`,
      `During “${definition.title},” ${choice} is believable but belongs to neither speaker's message; the audio points to ${correct.toLowerCase()}.`,
    ];
    return explanations[index % explanations.length]!;
  };
  return {
    id: `${definition.slug}-question`, type: definition.type === 'jlpt_listening_practice' ? 'dialogue_comprehension' : 'detail',
    prompt: { english: definition.questionPrompt }, referencedSectionIds: [`${definition.slug}-dialogue`], thinkingPauseMs: 6_000,
    choices: definition.choices.map((choice, index) => ({ id: `${definition.slug}-choice-${index + 1}`, label: { english: choice }, isCorrect: index === definition.correctIndex })),
    explanation: {
      correct: { english: definition.correctExplanation },
      distractors: definition.choices.flatMap((choice, index) => index === definition.correctIndex ? [] : [{
        choiceId: `${definition.slug}-choice-${index + 1}`,
        explanation: { english: distractorExplanation(choice, index) },
      }]),
      commonMistake: { english: definition.commonMistake }, readingEvidenceTokenIds: [], vocabularyIds: [], kanjiIds: [],
    },
    sourceReferences: sourceReference(binding, `${definition.slug}-question`),
  };
}

function buildPilot(definition: PilotDefinition, bindings: AudioPilotBindings, index: number): AudioLessonVersion {
  const [firstSpeaker, secondSpeaker] = definition.speakerNames;
  const sourceReferences = sourceReference(bindings.source, definition.slug);
  const question = listeningQuestion(definition, bindings.source);
  const sections: AudioScriptSection[] = [
    englishSection(`${definition.slug}-introduction`, 'introduction', 'Guide', `Welcome. ${definition.subtitle}`, 32_000),
    englishSection(`${definition.slug}-goal`, 'learning_goal', 'Guide', definition.englishGoal, 34_000),
    japaneseSection(`${definition.slug}-vocabulary`, 'vocabulary', 'Guide', definition.japanese[0], 38_000, 2_000),
    japaneseSection(`${definition.slug}-grammar`, 'grammar_focus', 'Guide', definition.japanese[1], 42_000, 2_000),
    japaneseSection(`${definition.slug}-example`, 'example', firstSpeaker, definition.japanese[2], 38_000, 2_000),
    japaneseSection(`${definition.slug}-dialogue`, definition.type === 'short_story' ? 'passage' : definition.type === 'shadowing_practice' ? 'shadowing' : 'dialogue', secondSpeaker, definition.japanese[3], 46_000, 3_000),
    englishSection(`${definition.slug}-listen`, 'listening_question', 'Guide', `${definition.questionPrompt} Pause now. Option one: ${definition.choices[0]}. Option two: ${definition.choices[1]}. Option three: ${definition.choices[2]}. Option four: ${definition.choices[3]}.`, 48_000, question.thinkingPauseMs),
    englishSection(`${definition.slug}-answer`, 'answer', 'Guide', `The best answer is: ${question.choices.find((choice) => choice.isCorrect)?.label.english}. ${definition.correctExplanation}`, 42_000),
    englishSection(`${definition.slug}-review`, 'review', 'Guide', `${definition.commonMistake} Replay the Japanese line once, then carry the pattern into your next conversation.`, 38_000),
    englishSection(`${definition.slug}-closing`, 'closing', 'Guide', `You have finished ${definition.title}. Save this lesson for a short review when this topic feels difficult.`, 30_000),
  ].map((section) => ({ ...section, sourceReferences }));
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
    estimatedMinutes: 6,
    objectives: [definition.objective],
    prerequisites: [],
    relatedLessonIds: [...(bindings.relatedLessonIds ?? [])],
    vocabularyIds: [...bindings.vocabularyIds],
    kanjiIds: [...bindings.kanjiIds],
    grammarIds: [...bindings.grammarIds],
    modes: ['japanese_english', 'slow_japanese', 'normal_japanese', ...(definition.type === 'shadowing_practice' ? ['shadowing' as const] : [])],
    scriptSections: sections,
    listeningQuestions: [question],
    sourceReferences,
    generationMetadata: { generator: 'deterministic_pipeline', generatedAt: '2026-08-04T00:00:00.000Z', ttsProvider: 'system-speech', sourceQuery: 'Reviewed OCR textbook and JLPT pattern grounding; original audio-first script.' },
    status: 'draft',
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
  };
}

const definitions: readonly PilotDefinition[] = [
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

/** Ten original, unpublished pilots. Their source/dependency bindings are supplied by reviewed management data. */
export function buildAudioLessonPilots(bindings: AudioPilotBindings): AudioLessonVersion[] {
  return definitions.map((definition, index) => buildPilot(definition, bindings, index));
}
