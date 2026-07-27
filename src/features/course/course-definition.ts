import { assessmentQuestionSeed } from '../assessment/seed';
import { loadBundledCurriculum, type BundledCurriculum } from '../curriculum/bundled-curriculum';
import { n5CurriculumSeed } from '../curriculum/seed';
import { sha256Text } from '../../utils/deterministic-hash';
import type { AdjectiveFormId, CourseDefinition, CourseLessonDefinition, CourseManifest, CourseReferenceType, CourseSectionDefinition, LessonActivityDefinition, LessonActivityExercise, VerbFormId } from '../../types/course';
import type { CurriculumItem } from '../../types/learning';
import { conjugateAdjectiveForm, conjugateNounForm, conjugateVerb } from './conjugation-service';
import { createTransformation } from './sentence-transformation';

type LessonBlueprint = Pick<CourseLessonDefinition, 'id' | 'title' | 'theme' | 'communicationGoal' | 'objectives'> & { keywords: string[] };

type ItemLookup = ReadonlyMap<string, CurriculumItem>;

function activity(
  lessonId: string,
  order: number,
  type: LessonActivityDefinition['type'],
  title: string,
  instruction: string,
  estimatedMinutes: number,
  exercises: LessonActivityExercise[],
  contentRefs: string[] = [],
  required = true,
): LessonActivityDefinition {
  return { id: `${lessonId}-activity-${String(order).padStart(2, '0')}`, order, type, title, instruction, estimatedMinutes, required, interactionCount: exercises.length, contentRefs, exercises };
}

function informationExercise(id: string, category: LessonActivityExercise['category'], prompt: string, itemId?: string, readingText?: string): LessonActivityExercise {
  return { id, responseKind: 'continue', category, prompt, itemId, readingText };
}

function selectExercise(id: string, category: LessonActivityExercise['category'], prompt: string, correct: string, distractors: string[], itemId?: string, explanation?: string, listeningText?: string): LessonActivityExercise {
  const answers = [correct, ...distractors.filter((value) => value !== correct)].slice(0, 4);
  return { id, responseKind: 'select', category, prompt, itemId, options: answers.map((label, index) => ({ id: index === 0 ? 'correct' : `option-${index}`, label })), acceptedAnswers: ['correct'], explanation, listeningText };
}

function typedExercise(id: string, category: LessonActivityExercise['category'], prompt: string, acceptedAnswers: string[], itemId?: string, explanation?: string, readingText?: string, listeningText?: string): LessonActivityExercise {
  return { id, responseKind: category === 'production' ? 'production' : 'typed', category, prompt, itemId, acceptedAnswers, explanation, readingText, listeningText };
}

function lookupItems(ids: readonly string[], lookup: ItemLookup): CurriculumItem[] {
  return ids.flatMap((id) => {
    const item = lookup.get(id);
    return item ? [item] : [];
  });
}

function originalReading(lesson: Pick<CourseLessonDefinition, 'number' | 'contentLevel' | 'theme' | 'vocabularyIds'>, lookup: ItemLookup): string {
  const words = lookupItems(lesson.vocabularyIds, lookup).slice(0, 4).map((item) => item.title);
  const topic = words[0] ?? '日本語';
  const detail = words[1] ?? '予定';
  const support = words[2] ?? '友だち';
  const outcome = words[3] ?? '大事なこと';
  const lines = [
    `あきは日本語を勉強している学生です。今日は「${lesson.theme}」という場面で、${topic}について友だちの蓮と話します。`,
    `朝、あきは${detail}を確認してから駅の近くで蓮を待ちました。二人には${support}について相談したいことがありました。`,
    `蓮は「今、何が一番大切ですか」と聞きました。あきは急がずに、理由と自分の考えを短く説明しました。`,
    `二人は相手の話をよく聞き、分からない言葉がある時は「もう一度お願いします」と言って確認しました。`,
    `会話の途中で予定が少し変わりました。しかし、${outcome}を先に決めれば大丈夫だと二人は考えました。`,
    `あきはノートを開き、新しく覚えた言葉と文の形を例文と一緒に書きました。蓮はその例を声に出して読みました。`,
    `昼ごろ、二人は次の行動を比べました。一つは早く終わりますが、もう一つは相手に分かりやすく説明できます。`,
    `そのため、二人は相手の都合を聞いてから、無理のない方法を選ぶことにしました。`,
    `帰る前に、二人は明日の予定、必要な物、連絡する時間をもう一度確認しました。`,
    `あきは今日の会話で、正しい言葉だけでなく、場面に合う言い方も大切だと感じました。`,
    `家に着いたあと、あきは短いメッセージを書きました。「今日はありがとうございました。次も${topic}について話しましょう。」`,
    `翌日、蓮から返事が来ました。二人は前の日の内容を使って、もっと自然な会話ができるようになっていました。`,
    `この経験を通して、あきは新しい文の形を知るだけでなく、読む、聞く、書く、話す練習を続けようと決めました。`,
    `読んだ人は、二人が何を相談し、どのように予定を決め、最後に何を学んだかを確認できます。`,
    `次の場面でも、あきは相手の話を聞き、必要なら質問し、自分の考えを分かりやすく伝えるつもりです。`,
    `小さな会話を何度も練習することで、二人は新しい${topic}を実際の生活で使えるようになりました。`,
  ];
  const target = lesson.contentLevel === 'N4' ? (lesson.number > 24 ? 720 : lesson.number > 12 ? 475 : 300) : (lesson.number > 18 ? 150 : 90);
  let text = '';
  for (const line of lines) { text += line; if (text.length >= target) break; }
  return text;
}

function originalListening(lesson: Pick<CourseLessonDefinition, 'theme' | 'vocabularyIds'>, lookup: ItemLookup): string {
  const words = lookupItems(lesson.vocabularyIds, lookup).slice(0, 2).map((item) => item.title);
  const topic = words[0] ?? '予定';
  const reply = words[1] ?? '日本語';
  return `あき：こんにちは。${topic}について少し話してもいいですか。\n蓮：もちろんです。${reply}も使って説明しましょう。\nあき：ありがとうございます。では、先に大事なことを確認します。\n蓮：いいですね。分からないところは、もう一度聞いてください。`;
}

function verbFormsFor(lesson: Pick<CourseLessonDefinition, 'contentLevel' | 'number'>): VerbFormId[] {
  if (lesson.contentLevel === 'N5') {
    const progression: Record<number, VerbFormId[]> = {
      7: ['masu'], 8: ['masu'], 9: ['dictionary', 'masu'], 10: ['nai'], 11: ['past'],
      15: ['masu'], 21: ['past'], 23: ['te'], 24: ['te'], 25: ['te'],
      27: ['masu', 'dictionary', 'nai', 'past', 'te'],
    };
    return progression[lesson.number] ?? [];
  }
  const progression: Record<number, VerbFormId[]> = {
    1: ['dictionary'], 2: ['dictionary'], 3: ['dictionary'],
    4: ['tara'], 5: ['nara'], 6: ['ba'],
    7: ['volitional'], 8: ['nai'], 9: ['dictionary'],
    10: ['potential'], 11: ['past'], 12: ['te'],
    13: ['dictionary'], 14: ['dictionary'], 15: ['dictionary'],
    16: ['dictionary'], 17: ['dictionary'], 18: ['dictionary'],
    28: ['passive'], 29: ['causative'], 30: ['causative_passive'],
  };
  return progression[lesson.number] ?? ['dictionary'];
}

function adjectiveFormsFor(lesson: Pick<CourseLessonDefinition, 'contentLevel' | 'number'>): AdjectiveFormId[] {
  if (lesson.contentLevel === 'N5' && lesson.number >= 19 && lesson.number <= 22) return ['i_present_negative', 'i_past', 'na_present_negative', 'na_past'];
  if (lesson.contentLevel === 'N4' && lesson.number >= 20 && lesson.number <= 23) return ['i_past_negative', 'na_past_negative', 'noun_past', 'noun_past_negative'];
  return [];
}

function patternObjectivesFor(lesson: Pick<CourseLessonDefinition, 'contentLevel' | 'number' | 'grammarIds'>, lookup: ItemLookup): string[] {
  const canonical = lookupItems(lesson.grammarIds, lookup).slice(0, 3).map((item) => item.title);
  const n5: Record<number, string[]> = {
    1: ['Noun は Noun です', 'Question か'], 2: ['Noun の Noun', 'Noun も Noun です'], 3: ['Question words', 'Polite answers'], 4: ['これ・それ・あれ', 'この・その・あの'], 5: ['Place に あります', 'Location の Noun'], 6: ['Action place で', 'Existence あります・います'], 7: ['Time に', 'Frequency expressions'], 8: ['Verb ます', 'Verb ません'], 9: ['Place へ 行きます', 'Transport で'], 10: ['Noun をください', 'How much ですか'], 11: ['Counters', 'Quantity の Noun'], 12: ['Noun が好きです', 'Noun が嫌いです'], 13: ['Family terms', 'Possession の'], 14: ['Location expressions', 'Existence sentences'], 15: ['Invitation ませんか', 'Suggestion ましょう'], 16: ['Destination に', 'Means で'], 17: ['Date and time', 'Appointment expressions'], 18: ['Direction words', 'Requesting directions'], 19: ['い-adjective sentences', 'な-adjective sentences'], 20: ['Weather descriptions', 'Season expressions'], 21: ['Past polite form', 'Future plans'], 22: ['Body and feeling words', 'Simple symptom expressions'], 23: ['Requests with てください', 'Help expressions'], 24: ['Permission てもいい', 'Prohibition てはいけない'], 25: ['Message sequence', 'Time connection'], 26: ['Listening for key details', 'Clarification questions'], 27: ['Review and repair', 'Independent use'],
  };
  return canonical.length >= 2 ? canonical : (lesson.contentLevel === 'N5' ? n5[lesson.number] ?? ['Practical sentence pattern', 'Contextual response'] : [...canonical, 'Plain-form dependent grammar', 'Contextual application'].slice(0, 3));
}

function standardActivities(lesson: CourseLessonDefinition, lookup: ItemLookup): LessonActivityDefinition[] {
  const vocabulary = lookupItems(lesson.vocabularyIds, lookup).slice(0, 16);
  const grammar = patternObjectivesFor(lesson, lookup);
  const kanji = lookupItems(lesson.kanjiIds, lookup).slice(0, 4);
  const verb = '食べる';
  const forms = lesson.verbForms.length ? lesson.verbForms : ['dictionary' as const];
  const reading = originalReading(lesson, lookup);
  const listening = originalListening(lesson, lookup);
  const activities: LessonActivityDefinition[] = [];
  const add = (type: LessonActivityDefinition['type'], title: string, instruction: string, minutes: number, exercises: LessonActivityExercise[], refs: string[] = [], required = true) => activities.push(activity(lesson.id, activities.length + 1, type, title, instruction, minutes, exercises, refs, required));
  add('introduction', 'Chapter opening', lesson.communicationGoal, 2, [informationExercise('opening', 'production', `Practical outcome: ${lesson.objectives.join(' · ')}`)]);
  add('introduction', 'Learning outcomes', 'Read the usable skills you will build and notice the practice sequence ahead.', 2, [informationExercise('outcomes', 'production', `By the end, you can: ${lesson.objectives.join(' · ')}. Patterns: ${grammar.join(' · ')}`)]);
  add('warm_up', 'Warm-up review', 'Recall recent material before adding the new pattern.', 5, Array.from({ length: 5 }, (_, index) => typedExercise(`warm-${index + 1}`, 'vocabulary', `Write the Japanese for this review cue: ${vocabulary[index]?.meaning ?? 'Japanese'}.`, [vocabulary[index]?.title ?? '日本語'], vocabulary[index]?.id)), lesson.vocabularyIds.slice(0, 5));
  add('story', 'Situation', 'Meet Aki and Ren in today’s practical situation.', 2, [informationExercise('story', 'reading', 'Read the situation before the dialogue.', undefined, reading)]);
  add('dialogue', 'First dialogue exposure', 'Listen once for the situation. Do not reveal the support text until after your first response.', 3, [selectExercise('dialogue-global', 'listening', 'What are Aki and Ren doing?', 'They are confirming a practical plan.', ['They are taking an exam.', 'They are saying goodbye forever.', 'They are cooking dinner.'], lesson.listeningIds[0], 'Listen again for the opening and closing lines.', listening)], lesson.listeningIds);
  const batchOne = vocabulary.slice(0, Math.ceil(vocabulary.length / 2));
  const batchTwo = vocabulary.slice(batchOne.length);
  add('vocabulary_intro', 'Vocabulary batch one', 'Hear each word, notice its reading, then connect it to the situation.', 4, [informationExercise('vocab-one', 'vocabulary', batchOne.map((item) => `${item.title}（${item.reading ?? item.title}） — ${item.meaning ?? ''}`).join('\n'), batchOne[0]?.id)], batchOne.map((item) => item.id));
  add('vocabulary_practice', 'Vocabulary recognition', 'Choose the meaning that fits the Japanese word.', 4, batchOne.slice(0, 6).map((item, index) => selectExercise(`vocab-recognition-${index + 1}`, 'vocabulary', `What does ${item.title} mean?`, item.meaning ?? item.title, vocabulary.filter((other) => other.id !== item.id).slice(0, 3).map((other) => other.meaning ?? other.title), item.id)), batchOne.map((item) => item.id));
  add('vocabulary_practice', 'Vocabulary recall', 'Type the Japanese word. Kana or the canonical written form is accepted.', 4, batchOne.slice(0, 6).map((item, index) => typedExercise(`vocab-recall-${index + 1}`, 'vocabulary', `Write Japanese for: ${item.meaning ?? item.title}`, [item.title, item.reading ?? item.title], item.id)), batchOne.map((item) => item.id));
  add('vocabulary_intro', 'Vocabulary batch two', 'Add a second small group, then reuse both groups in context.', 4, [informationExercise('vocab-two', 'vocabulary', batchTwo.map((item) => `${item.title}（${item.reading ?? item.title}） — ${item.meaning ?? ''}`).join('\n'), batchTwo[0]?.id)], batchTwo.map((item) => item.id));
  add('vocabulary_practice', 'Vocabulary in context', 'Choose or type the word that completes a practical situation.', 3, vocabulary.slice(0, 3).map((item, index) => typedExercise(`vocab-context-${index + 1}`, 'vocabulary', `Complete the situation with: ${item.meaning ?? item.title}`, [item.title, item.reading ?? item.title], item.id)), lesson.vocabularyIds.slice(0, 6));
  add('grammar_explanation', `Pattern one: ${grammar[0] ?? 'Core pattern'}`, 'Read the purpose, formation, model sentence, and common mistake. Use the pattern immediately in the next drill.', 3, [informationExercise('grammar-one', 'grammar', `Use ${grammar[0] ?? 'this pattern'} to communicate clearly in today’s situation.`, lesson.grammarIds[0])], lesson.grammarIds.slice(0, 1));
  add('substitution_drill', 'Pattern substitution drill', 'Replace the cue while preserving the sentence pattern. Type the full answer.', 4, Array.from({ length: 3 }, (_, index) => typedExercise(`substitution-${index + 1}`, 'grammar', index === 0 ? 'Model: 田中さんは本を読んでいます。 Cue: 先生 / 新聞' : `Use ${grammar[0] ?? 'the pattern'} with a new cue.`, ['先生は新聞を読んでいます'], lesson.grammarIds[0], 'Keep the topic marker and the verb form.')), lesson.grammarIds.slice(0, 1));
  const transformations = ['dictionary-to-masu', 'dictionary-to-te', 'affirmative-to-negative'] as const;
  add('sentence_transformation', 'Sentence transformation', 'Rewrite the sentence. Japanese punctuation is optional.', 4, transformations.map((kind, index) => { const transformation = createTransformation(kind, kind === 'affirmative-to-negative' ? '食べます' : '食べる', verb); return typedExercise(`transform-one-${index + 1}`, 'conjugation', `${transformation.instruction} ${transformation.source}`, transformation.expectedAnswers, lesson.grammarIds[0], transformation.instruction); }), lesson.grammarIds.slice(0, 1));
  add('grammar_explanation', `Pattern two: ${grammar[1] ?? grammar[0] ?? 'Second pattern'}`, 'Notice how this pattern changes the meaning of a sentence, then use it in a controlled drill.', 3, [informationExercise('grammar-two', 'grammar', `Use ${grammar[1] ?? grammar[0] ?? 'this pattern'} in an appropriate context.`, lesson.grammarIds[1] ?? lesson.grammarIds[0])], lesson.grammarIds.slice(1, 2));
  add('substitution_drill', 'Controlled grammar drill', 'Complete a sentence, then compare its meaning with the model.', 4, Array.from({ length: 3 }, (_, index) => typedExercise(`controlled-${index + 1}`, 'grammar', `Write a sentence using ${grammar[1] ?? grammar[0] ?? 'today’s pattern'}.`, [index === 0 ? 'これは本です' : '私は学生です'], lesson.grammarIds[1] ?? lesson.grammarIds[0])), lesson.grammarIds.slice(0, 2));
  const connectionTransformations = ['combine-te-kara', 'present-to-past', 'masu-to-dictionary'] as const;
  add('sentence_transformation', 'Transform and connect', 'Change the form or combine two short sentences while keeping the meaning.', 4, connectionTransformations.map((kind, index) => { const transformation = createTransformation(kind, kind === 'combine-te-kara' ? '' : '食べます', verb); return typedExercise(`transform-two-${index + 1}`, 'conjugation', `${transformation.instruction} ${transformation.source}`, transformation.expectedAnswers, lesson.grammarIds[0]); }), lesson.grammarIds.slice(0, 2));
  const teFormMastery = lesson.contentLevel === 'N5' && lesson.number === 24;
  const conjugationCount = teFormMastery ? 32 : lesson.verbForms.includes('te') ? 4 : 3;
  add('conjugation_drill', teFormMastery ? 'て-form mastery drill' : 'Verb and form drill', 'Convert the verb accurately. Timed practice builds automatic recall.', teFormMastery ? 18 : 4, Array.from({ length: conjugationCount }, (_, index) => { const form = forms[index % forms.length] ?? 'dictionary'; const answer = conjugateVerb(verb, form) ?? verb; return typedExercise(`conjugation-${index + 1}`, 'conjugation', `Convert ${verb} to ${form.replaceAll('_', ' ')} form.`, [answer], lesson.grammarIds[0]); }), lesson.grammarIds.slice(0, 1));
  if (teFormMastery) add('sentence_ordering', 'て-form application workshop', 'Put the parts in a natural order, then use the same pattern in your own speech.', 8, Array.from({ length: 4 }, (_, index) => typedExercise(`te-application-${index + 1}`, 'grammar', index % 2 === 0 ? 'Put in order: ご飯を / 食べてから / 学校へ行きます' : 'Complete: ドアを開けて、部屋に___。', index % 2 === 0 ? ['ご飯を食べてから学校へ行きます', 'ご飯を食べてから、学校へ行きます'] : ['入ります'], lesson.grammarIds[0])), lesson.grammarIds.slice(0, 1));
  if (lesson.adjectiveForms.length) add('conjugation_drill', 'Adjective and noun conjugation', 'Change adjectives and nouns with the copula. Use the form that matches the time and polarity.', 5, lesson.adjectiveForms.map((form, index) => {
    const nounForm = form === 'noun_past' || form === 'noun_past_negative';
    const answer = nounForm ? conjugateNounForm('学生', form) : conjugateAdjectiveForm(form.startsWith('i_') ? '高い' : '静か', form) ?? '静かです';
    const source = nounForm ? '学生です' : form.startsWith('i_') ? '高いです' : '静かです';
    return typedExercise(`adjective-${index + 1}`, 'conjugation', `Rewrite ${source} as ${form.replaceAll('_', ' ')}.`, [answer], lesson.grammarIds[0]);
  }), lesson.grammarIds.slice(0, 1));
  add('kanji_intro', 'Kanji in context', 'Focus on the reading used in today’s words, not every possible reading.', 3, kanji.map((item, index) => informationExercise(`kanji-intro-${index + 1}`, 'kanji', `${item.title} — ${item.meaning ?? ''} · reading: ${item.reading ?? 'see notebook'}`, item.id)), kanji.map((item) => item.id));
  add('kanji_practice', 'Kanji reading in words', 'Read the kanji in a familiar lesson word.', 3, kanji.slice(0, 2).map((item, index) => typedExercise(`kanji-practice-${index + 1}`, 'kanji', `Write a reading for ${item.title}.`, [item.reading ?? item.title], item.id)), kanji.slice(0, 2).map((item) => item.id));
  add('dialogue', 'Dialogue replay and breakdown', 'Replay one line at a time. Notice how the target patterns make the exchange work.', 3, [informationExercise('dialogue-replay', 'listening', 'Shadow the line after listening.', lesson.listeningIds[0], undefined)], lesson.listeningIds);
  add('reading', 'Reading passage', 'Read once without translation. Open the help only after making a first attempt.', 4, [informationExercise('reading-passage', 'reading', 'Read the passage and identify the main situation.', lesson.readingIds[0], reading)], lesson.readingIds);
  add('reading', 'Reading comprehension', 'Answer a main-idea and a detail question.', 3, [selectExercise('reading-main', 'reading', 'What is the main purpose of the passage?', 'Aki and Ren are discussing a practical plan.', ['They are describing a past vacation.', 'They are buying a train ticket.', 'They are taking a test.'], lesson.readingIds[0]), selectExercise('reading-detail', 'reading', 'What do they do after the conversation?', 'They write important words in a notebook.', ['They go shopping.', 'They call a teacher.', 'They cancel their plan.'], lesson.readingIds[0])], lesson.readingIds);
  add('timed_reading', 'Timed reading', 'Read for meaning at a steady pace. Speed matters only when comprehension remains sound.', 2, [informationExercise('timed-reading', 'reading', 'Start the timer, read the passage, and continue when you understand the main idea.', lesson.readingIds[0], reading)], lesson.readingIds);
  add('listening', 'Listen without the transcript', 'Listen for the overall situation first.', 3, [selectExercise('listening-global', 'listening', 'What should the listener do if something is unclear?', 'Ask to hear it again.', ['Stop studying.', 'Change the topic.', 'Read the translation first.'], lesson.listeningIds[0], undefined, listening)], lesson.listeningIds);
  add('listening', 'Listening comprehension', 'Replay and listen for a specific detail.', 3, [selectExercise('listening-detail', 'listening', 'What do the characters plan to do?', 'Confirm important information.', ['Cook together.', 'Travel tomorrow.', 'Take a photo.'], lesson.listeningIds[0], undefined, listening)], lesson.listeningIds);
  add('dictation', 'Dictation and sound discrimination', 'Listen without a transcript, then type the key phrase you hear.', 3, [typedExercise('dictation', 'listening', 'Type the key phrase: もう一度聞いてください。', ['もう一度聞いてください', 'もういちど聞いてください'], lesson.listeningIds[0], undefined, undefined, listening)], lesson.listeningIds);
  add('shadowing', 'Transcript review and shadowing', 'Reveal the transcript, replay a line, and repeat at a comfortable pace.', 2, [informationExercise('shadowing', 'listening', 'Optional speaking practice: shadow one line before continuing.', lesson.listeningIds[0], listening)], lesson.listeningIds, false);
  add('sentence_production', 'Your own sentence', 'Write one short sentence about your own life using today’s pattern. Many answers can be valid.', 3, [typedExercise('production', 'production', `Write an original sentence using ${grammar[0] ?? 'today’s pattern'}.`, grammar[0] ? [grammar[0]] : ['です'], lesson.grammarIds[0], 'Use the pattern; offline you may self-confirm a different valid sentence.')], lesson.grammarIds.slice(0, 1));
  add('error_correction', 'Find and correct the mistake', 'Correct the form, then read the explanation.', 3, [typedExercise('error-one', 'grammar', 'Correct: わたしは学生だです。', ['わたしは学生です'], lesson.grammarIds[0], 'Use either だ or です, not both.'), typedExercise('error-two', 'conjugation', 'Correct: 食べるます。', ['食べます'], lesson.grammarIds[0], 'Attach ます to the verb stem.')], lesson.grammarIds.slice(0, 1));
  add('mixed_practice', 'Mixed lesson practice', 'Apply vocabulary, patterns, kanji, and context before the checkpoint.', 4, Array.from({ length: 4 }, (_, index) => typedExercise(`mixed-${index + 1}`, index % 2 ? 'grammar' : 'vocabulary', index % 2 ? `Use ${grammar[index % grammar.length] ?? 'today’s pattern'} in a short answer.` : `Write Japanese for: ${vocabulary[index]?.meaning ?? 'Japanese'}.`, index % 2 ? ['これは本です'] : [vocabulary[index]?.title ?? '日本語'], index % 2 ? lesson.grammarIds[0] : vocabulary[index]?.id)), [...lesson.vocabularyIds.slice(0, 2), ...lesson.grammarIds.slice(0, 1)]);
  const checkpointExercises: LessonActivityExercise[] = Array.from({ length: 20 }, (_, index) => {
    if (index < 6) { const item = vocabulary[index % Math.max(vocabulary.length, 1)]; return typedExercise(`checkpoint-vocab-${index + 1}`, 'vocabulary', `Write Japanese for: ${item?.meaning ?? 'today’s word'}`, [item?.title ?? '日本語', item?.reading ?? '日本語'], item?.id); }
    if (index < 11) { const transformation = createTransformation((['dictionary-to-masu', 'dictionary-to-te', 'affirmative-to-negative', 'present-to-past', 'combine-te-kara'] as const)[index - 6] ?? 'dictionary-to-masu', index === 10 ? '' : '食べる', verb); return typedExercise(`checkpoint-form-${index + 1}`, 'conjugation', `${transformation.instruction} ${transformation.source}`, transformation.expectedAnswers, lesson.grammarIds[0]); }
    if (index < 14) { const item = kanji[(index - 11) % Math.max(kanji.length, 1)]; return typedExercise(`checkpoint-kanji-${index + 1}`, 'kanji', `Write a reading for ${item?.title ?? '日'}.`, [item?.reading ?? 'にち'], item?.id); }
    if (index < 17) return selectExercise(`checkpoint-reading-${index + 1}`, 'reading', 'Choose the best summary of the passage.', 'Two students confirm a plan and review Japanese.', ['A family cooks dinner.', 'A worker changes jobs.', 'A traveler misses a train.'], lesson.readingIds[0]);
    return selectExercise(`checkpoint-listening-${index + 1}`, 'listening', 'Choose the detail heard in the dialogue.', 'Ask again when something is unclear.', ['Read silently first.', 'Do not ask questions.', 'Change the plan immediately.'], lesson.listeningIds[0]);
  });
  add('checkpoint', 'Lesson checkpoint', 'Complete the mixed chapter check. Your weak items will enter the existing review systems.', 12, checkpointExercises, [...lesson.vocabularyIds, ...lesson.grammarIds, ...lesson.kanjiIds, ...lesson.readingIds, ...lesson.listeningIds]);
  add('reflection', 'Lesson reflection', 'Review what you can now do, identify a weak area, and choose the next study action.', 2, [typedExercise('reflection', 'production', `You can now: ${lesson.objectives.join(' · ')}. Write one skill you will revisit in Review or the Study Library.`, [])]);
  return activities;
}

const sectionBlueprint = (lesson: CourseLessonDefinition): CourseSectionDefinition[] => {
  const primaryDialogue = lesson.listeningIds.length > 0;
  const sections: Omit<CourseSectionDefinition, 'id' | 'order'>[] = [
    { kind: 'introduction', title: 'Start here', instruction: lesson.communicationGoal, estimatedMinutes: 1 },
    { kind: 'vocabulary', title: 'Words in context', instruction: 'Preview a small set of words, hear each one, then recognise it in a short example.', estimatedMinutes: 5 },
    ...(lesson.grammarIds.length ? [{ kind: 'grammar' as const, title: 'Pattern in use', instruction: 'Open each short notebook explanation, notice its formation, then practise it immediately.', estimatedMinutes: 5 }] : []),
    ...(lesson.kanjiIds.length ? [{ kind: 'kanji' as const, title: 'Kanji in today’s words', instruction: 'Focus on the reading used in today’s vocabulary before exploring other readings in the notebook.', estimatedMinutes: 3 }] : []),
    ...(primaryDialogue ? [{ kind: 'dialogue' as const, title: 'Guided dialogue', instruction: 'Listen once for the situation, then replay one line at a time and shadow it aloud.', estimatedMinutes: 3 }] : []),
    ...(lesson.listeningIds.length ? [{ kind: 'listening' as const, title: 'Listening for meaning', instruction: 'Try without the transcript first. Reveal it only after your first attempt.', estimatedMinutes: 3 }] : []),
    ...(lesson.readingIds.length ? [{ kind: 'reading' as const, title: 'Short reading', instruction: 'Read for the main idea, then use the questions to check your understanding.', estimatedMinutes: 3 }] : []),
    { kind: 'practice', title: 'Use what you learned', instruction: 'Work from recognition to context. Incorrect answers explain the pattern and enter your normal review data.', estimatedMinutes: 4 },
    { kind: 'checkpoint', title: 'Lesson checkpoint', instruction: 'A short mixed check of the content introduced in this lesson.', estimatedMinutes: 4 },
    { kind: 'summary', title: 'Wrap up', instruction: 'Review what came easily and add anything uncertain to normal review.', estimatedMinutes: 1 },
  ];
  return sections.map((section, index) => ({ ...section, id: `${lesson.id}-section-${String(index + 1).padStart(2, '0')}`, order: index + 1 }));
};

const foundationsBlueprints: LessonBlueprint[] = [
  { id: 'foundations-lesson-01', title: 'Japanese sounds and greetings', theme: 'First contact', communicationGoal: 'Recognise the core Japanese sounds and greet someone politely.', objectives: ['say a basic greeting', 'recognise a first hiragana sound'], keywords: ['greeting', 'kana'] },
  { id: 'foundations-lesson-02', title: 'Hiragana starts', theme: 'Reading kana', communicationGoal: 'Read a few hiragana sounds and use them in familiar words.', objectives: ['read あ and き', 'notice long and doubled sounds'], keywords: ['hiragana', 'kana'] },
  { id: 'foundations-lesson-03', title: 'Katakana starts', theme: 'Reading loanwords', communicationGoal: 'Recognise introductory katakana and use it in a familiar word.', objectives: ['read コ and メ', 'distinguish hiragana from katakana'], keywords: ['katakana', 'kana'] },
  { id: 'foundations-lesson-04', title: 'Simple Japanese sentences', theme: 'Sentence order', communicationGoal: 'Make a polite sentence about yourself or another person.', objectives: ['recognise the topic', 'use です politely'], keywords: ['topic', 'copula', 'people'] },
  { id: 'foundations-lesson-05', title: 'Introducing yourself', theme: 'Meeting people', communicationGoal: 'Say who you are and talk about a school or friend.', objectives: ['name a person', 'say a simple identity sentence'], keywords: ['people', 'education', 'relationships'] },
  { id: 'foundations-lesson-06', title: 'Numbers, days, and time', theme: 'Everyday time', communicationGoal: 'Recognise basic time words and a few high-frequency kanji.', objectives: ['recognise day and month words', 'read basic time kanji'], keywords: ['time', 'nature'] },
  { id: 'foundations-lesson-07', title: 'Classroom Japanese', theme: 'Learning together', communicationGoal: 'Understand a few useful words for studying and asking.', objectives: ['recognise school words', 'use a polite question ending'], keywords: ['education', 'communication'] },
  { id: 'foundations-lesson-08', title: 'Your first mini-conversation', theme: 'Putting it together', communicationGoal: 'Understand and respond to a short self-introduction.', objectives: ['follow a short exchange', 'review your first patterns'], keywords: ['greeting', 'daily-life'] },
];

const n5UnitBlueprints: { id: string; title: string; goal: string; lessons: Omit<LessonBlueprint, 'id'>[] }[] = [
  { id: 'n5-unit-1', title: 'Meeting people', goal: 'Introduce yourself and ask simple personal questions.', lessons: [
    { title: 'Introducing yourself', theme: 'Names and identities', communicationGoal: 'Introduce yourself simply and politely.', objectives: ['say who you are', 'recognise a topic sentence'], keywords: ['people', 'greeting', 'identity'] },
    { title: 'Countries and occupations', theme: 'People around you', communicationGoal: 'Talk about people, places, and work.', objectives: ['name people and places', 'connect two nouns'], keywords: ['people', 'place', 'education'] },
    { title: 'Asking simple questions', theme: 'First questions', communicationGoal: 'Ask and answer a short polite question.', objectives: ['form a question', 'respond positively or negatively'], keywords: ['communication', 'question', 'daily-life'] },
  ] },
  { id: 'n5-unit-2', title: 'Things around you', goal: 'Identify things, possession, and places.', lessons: [
    { title: 'This, that, and which', theme: 'Objects nearby', communicationGoal: 'Point out objects in a simple setting.', objectives: ['identify an object', 'ask which one'], keywords: ['object', 'place', 'daily-life'] },
    { title: 'Whose is it?', theme: 'Possession', communicationGoal: 'Say who something belongs to.', objectives: ['show possession', 'recognise people and objects'], keywords: ['possession', 'people', 'object'] },
    { title: 'Places and objects', theme: 'Finding things', communicationGoal: 'Describe where an object is and where an action happens.', objectives: ['name common places', 'use location words'], keywords: ['place', 'home', 'school'] },
  ] },
  { id: 'n5-unit-3', title: 'Daily life', goal: 'Talk about time and everyday actions.', lessons: [
    { title: 'Time and schedules', theme: 'A planned day', communicationGoal: 'Say when something happens.', objectives: ['recognise time words', 'talk about a schedule'], keywords: ['time', 'weekday', 'daily-life'] },
    { title: 'Daily activities', theme: 'Routine', communicationGoal: 'Describe a simple daily routine.', objectives: ['name common actions', 'use a polite verb'], keywords: ['verb', 'daily-life', 'home'] },
    { title: 'Going and coming', theme: 'Movement', communicationGoal: 'Say where you go and come from.', objectives: ['use movement words', 'identify destinations'], keywords: ['movement', 'transport', 'place'] },
  ] },
  { id: 'n5-unit-4', title: 'Food and shopping', goal: 'Order food and understand prices.', lessons: [
    { title: 'Ordering food', theme: 'At a restaurant', communicationGoal: 'Recognise common food and drink requests.', objectives: ['name food and drinks', 'understand a simple order'], keywords: ['food', 'drink', 'restaurant'] },
    { title: 'Prices and quantities', theme: 'Buying things', communicationGoal: 'Ask how much something costs.', objectives: ['recognise money words', 'talk about a quantity'], keywords: ['money', 'shopping', 'number'] },
    { title: 'Likes and dislikes', theme: 'Preferences', communicationGoal: 'Say what you like or do not like.', objectives: ['describe a preference', 'recognise food opinions'], keywords: ['food', 'adjective', 'daily-life'] },
  ] },
  { id: 'n5-unit-5', title: 'Home and family', goal: 'Describe your home and the people in it.', lessons: [
    { title: 'My family', theme: 'People at home', communicationGoal: 'Talk about family members.', objectives: ['name family members', 'use a simple description'], keywords: ['family', 'people', 'home'] },
    { title: 'My home', theme: 'Rooms and furniture', communicationGoal: 'Describe a familiar room and its objects.', objectives: ['name a room', 'locate an object'], keywords: ['home', 'object', 'place'] },
    { title: 'Invitations and plans', theme: 'Making plans', communicationGoal: 'Understand a simple invitation and response.', objectives: ['recognise plan words', 'say yes or no politely'], keywords: ['communication', 'time', 'movement'] },
  ] },
  { id: 'n5-unit-6', title: 'Getting around', goal: 'Navigate everyday travel and appointments.', lessons: [
    { title: 'Transport and destinations', theme: 'Travelling locally', communicationGoal: 'Talk about transport and destinations.', objectives: ['name a transport option', 'say a destination'], keywords: ['transport', 'movement', 'place'] },
    { title: 'Appointments and dates', theme: 'Making arrangements', communicationGoal: 'Understand a date and appointment time.', objectives: ['read date words', 'confirm a time'], keywords: ['time', 'number', 'daily-life'] },
    { title: 'Directions and landmarks', theme: 'Finding the way', communicationGoal: 'Recognise common places and direction language.', objectives: ['identify a landmark', 'follow a short direction'], keywords: ['place', 'movement', 'city'] },
  ] },
  { id: 'n5-unit-7', title: 'Describing the world', goal: 'Use simple descriptions and comparisons.', lessons: [
    { title: 'People and appearance', theme: 'Describing people', communicationGoal: 'Use a simple adjective to describe a person.', objectives: ['recognise descriptive words', 'talk about people'], keywords: ['people', 'adjective', 'description'] },
    { title: 'Weather and seasons', theme: 'The day outside', communicationGoal: 'Understand a basic weather comment.', objectives: ['name a season', 'recognise weather words'], keywords: ['weather', 'nature', 'time'] },
    { title: 'Past and future plans', theme: 'Looking back and ahead', communicationGoal: 'Understand when an event happens.', objectives: ['recognise past and future cues', 'talk about a plan'], keywords: ['time', 'verb', 'daily-life'] },
  ] },
  { id: 'n5-unit-8', title: 'Health and services', goal: 'Handle simple needs in public places.', lessons: [
    { title: 'At the doctor', theme: 'How you feel', communicationGoal: 'Recognise simple health vocabulary.', objectives: ['name a body-related word', 'say how you feel'], keywords: ['health', 'body', 'daily-life'] },
    { title: 'Requests and help', theme: 'Getting help', communicationGoal: 'Understand a polite simple request.', objectives: ['recognise a request', 'ask for help'], keywords: ['communication', 'service', 'daily-life'] },
    { title: 'Rules and permissions', theme: 'Public spaces', communicationGoal: 'Understand a short everyday instruction.', objectives: ['recognise a rule', 'notice permission language'], keywords: ['school', 'place', 'daily-life'] },
  ] },
  { id: 'n5-unit-9', title: 'N5 consolidation', goal: 'Use N5 material across familiar situations.', lessons: [
    { title: 'Reading familiar messages', theme: 'Messages', communicationGoal: 'Read a short personal message for key details.', objectives: ['find the main idea', 'recognise familiar words'], keywords: ['communication', 'time', 'daily-life'] },
    { title: 'Listening in context', theme: 'Everyday exchanges', communicationGoal: 'Follow a short exchange without reading first.', objectives: ['listen for a key detail', 'replay a line'], keywords: ['listening', 'communication', 'daily-life'] },
    { title: 'N5 course finale', theme: 'Putting N5 together', communicationGoal: 'Use familiar N5 language across a practical situation.', objectives: ['review weak areas', 'prepare for N4'], keywords: ['daily-life', 'review', 'communication'] },
  ] },
];

const n4UnitBlueprints: { id: string; title: string; goal: string; lessons: Omit<LessonBlueprint, 'id'>[] }[] = [
  { id: 'n4-unit-1', title: 'Connecting events', goal: 'Describe sequence, time, and linked actions.', lessons: [
    { title: 'Before and after', theme: 'Sequence', communicationGoal: 'Link two events in order.', objectives: ['recognise a sequence', 'talk about an after-event'], keywords: ['time-and-sequence', 'sequence', 'time'] },
    { title: 'While something happens', theme: 'Parallel time', communicationGoal: 'Describe actions during the same time period.', objectives: ['distinguish while and during', 'listen for timing'], keywords: ['time-and-sequence', 'simultaneous-actions'] },
    { title: 'Deadlines and timing', theme: 'Plans and due dates', communicationGoal: 'Talk about a deadline and a planned action.', objectives: ['understand by a time', 'use a schedule'], keywords: ['time-and-sequence', 'deadlines', 'time'] },
  ] },
  { id: 'n4-unit-2', title: 'Choices and conditions', goal: 'Explain choices, possibilities, and results.', lessons: [
    { title: 'If and when', theme: 'Conditions', communicationGoal: 'Understand a likely condition.', objectives: ['recognise conditional language', 'connect a result'], keywords: ['conditionals', 'condition'] },
    { title: 'Possibility and uncertainty', theme: 'What might happen', communicationGoal: 'Express a possibility or uncertainty.', objectives: ['recognise might', 'ask about a possibility'], keywords: ['appearance-inference-and-hearsay', 'possibility'] },
    { title: 'Reasons and explanations', theme: 'Why something happens', communicationGoal: 'Follow a simple reason and result.', objectives: ['identify a reason', 'explain a choice'], keywords: ['explanation-and-nominalization', 'functional-expressions'] },
  ] },
  { id: 'n4-unit-3', title: 'Plans and decisions', goal: 'Discuss intention, obligation, and change.', lessons: [
    { title: 'Deciding what to do', theme: 'Personal decisions', communicationGoal: 'Talk about a decision or plan.', objectives: ['recognise a decision', 'describe an intention'], keywords: ['decisions-and-intentions', 'decisions'] },
    { title: 'Rules and necessities', theme: 'What is required', communicationGoal: 'Understand obligations and things that are not required.', objectives: ['recognise must and need', 'contrast permission'], keywords: ['obligation-permission-and-prohibition', 'necessity'] },
    { title: 'Making a change', theme: 'Changing a situation', communicationGoal: 'Describe making something become different.', objectives: ['recognise change language', 'use a result expression'], keywords: ['purpose-and-change', 'controlled-change'] },
  ] },
  { id: 'n4-unit-4', title: 'Experience and ability', goal: 'Talk about what you can do and have done.', lessons: [
    { title: 'Things you can do', theme: 'Ability', communicationGoal: 'Explain an ability in a practical context.', objectives: ['recognise ability language', 'describe a skill'], keywords: ['appearance-inference-and-hearsay', 'ability'] },
    { title: 'Experiences in life', theme: 'Past experience', communicationGoal: 'Talk about a past experience.', objectives: ['recognise experience language', 'ask about an event'], keywords: ['time-and-sequence', 'occasional-events'] },
    { title: 'Starting and finishing', theme: 'How actions develop', communicationGoal: 'Describe the beginning or completion of an action.', objectives: ['recognise onset', 'describe a completed state'], keywords: ['aspect-and-completion', 'aspect-onset'] },
  ] },
  { id: 'n4-unit-5', title: 'Comparing and limiting', goal: 'Make comparisons and describe limits.', lessons: [
    { title: 'Degree and comparison', theme: 'How much', communicationGoal: 'Compare degree in an everyday situation.', objectives: ['recognise degree', 'make a simple comparison'], keywords: ['comparison-and-limitation', 'degree-comparison'] },
    { title: 'Only, even, and examples', theme: 'Choosing examples', communicationGoal: 'Explain a limited choice or example.', objectives: ['recognise only', 'give an example'], keywords: ['comparison-and-limitation', 'limitation'] },
    { title: 'Quantity in context', theme: 'Amounts', communicationGoal: 'Understand emphasis about an amount.', objectives: ['recognise quantity', 'read numbers in context'], keywords: ['comparison-and-limitation', 'quantity-emphasis'] },
  ] },
  { id: 'n4-unit-6', title: 'Explaining information', goal: 'Report, infer, and ask embedded questions.', lessons: [
    { title: 'Whether or not', theme: 'Embedded questions', communicationGoal: 'Ask about whether something is true.', objectives: ['recognise an embedded question', 'follow an answer'], keywords: ['explanation-and-nominalization', 'embedded-questions'] },
    { title: 'What seems likely', theme: 'Inference', communicationGoal: 'Say what something seems to be.', objectives: ['recognise appearance', 'distinguish certainty'], keywords: ['appearance-inference-and-hearsay', 'appearance'] },
    { title: 'Making nouns from actions', theme: 'Explaining actions', communicationGoal: 'Understand an action as an idea or rule.', objectives: ['recognise nominalization', 'explain a plan'], keywords: ['explanation-and-nominalization', 'nominalization'] },
  ] },
  { id: 'n4-unit-7', title: 'People and politeness', goal: 'Navigate respectful and everyday social language.', lessons: [
    { title: 'Polite service language', theme: 'Formal situations', communicationGoal: 'Recognise formal polite expressions.', objectives: ['notice formal language', 'understand a service exchange'], keywords: ['honorific-and-humble-language', 'polite'] },
    { title: 'Respectful actions', theme: 'Talking about others', communicationGoal: 'Recognise an honorific action in context.', objectives: ['identify respectful verbs', 'follow a polite exchange'], keywords: ['honorific-and-humble-language', 'honorific-verbs'] },
    { title: 'Humble actions', theme: 'Talking about yourself', communicationGoal: 'Recognise a humble action in context.', objectives: ['identify humble verbs', 'respond appropriately'], keywords: ['honorific-and-humble-language', 'humble-verbs'] },
  ] },
  { id: 'n4-unit-8', title: 'Feelings and senses', goal: 'Describe feelings, observations, and senses.', lessons: [
    { title: 'What you can sense', theme: 'Sounds and feelings', communicationGoal: 'Describe a sense or impression.', objectives: ['recognise sensory language', 'follow an observation'], keywords: ['functional-expressions', 'sensory-perception'] },
    { title: 'How people seem', theme: 'Observed feelings', communicationGoal: 'Describe a feeling you observe in another person.', objectives: ['recognise observed feelings', 'contrast direct and observed'], keywords: ['functional-expressions', 'observed-feelings'] },
    { title: 'Not easily done', theme: 'Difficulty', communicationGoal: 'Describe something that is difficult in practice.', objectives: ['recognise negative difficulty', 'give a practical example'], keywords: ['functional-expressions', 'negative-difficulty'] },
  ] },
  { id: 'n4-unit-9', title: 'Making and using things', goal: 'Talk about materials, tools, and practical processes.', lessons: [
    { title: 'Made from', theme: 'Materials', communicationGoal: 'Describe what something is made from.', objectives: ['recognise material source', 'read a product description'], keywords: ['purpose-and-change', 'material-source'] },
    { title: 'Using a method', theme: 'Means and tools', communicationGoal: 'Understand how an action is done.', objectives: ['recognise a means', 'follow an instruction'], keywords: ['functional-expressions', 'means'] },
    { title: 'Keeping a state', theme: 'As it is', communicationGoal: 'Describe a state that continues.', objectives: ['recognise a maintained state', 'understand a notice'], keywords: ['aspect-and-completion', 'maintained-state'] },
  ] },
  { id: 'n4-unit-10', title: 'Work and community', goal: 'Handle everyday information outside the home.', lessons: [
    { title: 'Workplace passive forms', theme: 'Tasks and colleagues', communicationGoal: 'Describe work that is assigned or completed by someone.', objectives: ['recognise a passive form', 'follow a workplace request'], keywords: ['work', 'communication', 'daily-life'] },
    { title: 'Letting and making things happen', theme: 'Local information', communicationGoal: 'Explain when someone allows or causes an action.', objectives: ['recognise a causative form', 'understand a local notice'], keywords: ['city', 'place', 'daily-life'] },
    { title: 'Being made to do things', theme: 'Getting things done', communicationGoal: 'Understand a causative-passive form in a service arrangement.', objectives: ['confirm a detail', 'recognise a causative-passive form'], keywords: ['service', 'time', 'communication'] },
  ] },
  { id: 'n4-unit-11', title: 'Reading and listening strategies', goal: 'Use N4 language across connected texts.', lessons: [
    { title: 'Following a notice', theme: 'Reading for action', communicationGoal: 'Find what to do in a short notice.', objectives: ['find key facts', 'ignore nonessential detail'], keywords: ['reading', 'place', 'time'] },
    { title: 'Following a conversation', theme: 'Listening for detail', communicationGoal: 'Listen for a practical detail in a conversation.', objectives: ['listen once for the topic', 'replay for a detail'], keywords: ['listening', 'communication', 'time'] },
    { title: 'Choosing the right response', theme: 'Mixed contexts', communicationGoal: 'Choose an appropriate response in context.', objectives: ['notice register', 'apply a familiar pattern'], keywords: ['communication', 'functional-expressions', 'daily-life'] },
  ] },
  { id: 'n4-unit-12', title: 'N4 consolidation', goal: 'Consolidate N4 communication for continued review.', lessons: [
    { title: 'Connected situations', theme: 'Putting patterns together', communicationGoal: 'Follow linked events and choices in context.', objectives: ['combine time and condition patterns', 'identify a main message'], keywords: ['time-and-sequence', 'conditionals'] },
    { title: 'Reviewing weak points', theme: 'Targeted repair', communicationGoal: 'Return to the patterns that need another pass.', objectives: ['identify weak content', 'choose a review action'], keywords: ['review', 'daily-life', 'functional-expressions'] },
    { title: 'N4 course finale', theme: 'Independent use', communicationGoal: 'Apply N4 material in a realistic mixed situation.', objectives: ['summarise progress', 'plan normal spaced review'], keywords: ['review', 'communication', 'daily-life'] },
  ] },
];

function canonicalItems(bundle: BundledCurriculum): CurriculumItem[] {
  const legacyOnly = n5CurriculumSeed.filter((item) => !bundle.items.some((bundled) => bundled.id === item.id));
  return [...bundle.items, ...legacyOnly];
}

function matchScore(item: CurriculumItem, keywords: readonly string[]): number {
  const haystack = `${item.tags.join(' ')} ${item.meaning ?? ''}`.toLowerCase();
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword.toLowerCase()) ? 4 : 0), 0);
}

function distributeItems(items: CurriculumItem[], lessons: LessonBlueprint[], limit: number): Map<string, string[]> {
  const available = [...items];
  const assigned = new Map<string, string[]>();
  for (const lesson of lessons) {
    available.sort((left, right) => matchScore(right, lesson.keywords) - matchScore(left, lesson.keywords) || left.id.localeCompare(right.id));
    assigned.set(lesson.id, available.splice(0, Math.min(limit, available.length)).map((item) => item.id));
  }
  return assigned;
}

function distributeInDeclaredOrder(ids: readonly string[], lessons: readonly LessonBlueprint[], limit: number): Map<string, string[]> {
  const assigned = new Map<string, string[]>();
  let index = 0;
  for (const lesson of lessons) {
    assigned.set(lesson.id, ids.slice(index, index + limit));
    index += limit;
  }
  return assigned;
}

function assignContext<T extends { id: string; vocabularyIds: string[]; grammarIds: string[]; kanjiIds: string[] }>(
  activities: readonly T[],
  lessons: readonly CourseLessonDefinition[],
): Map<string, string[]> {
  const unused = [...activities];
  const result = new Map<string, string[]>();
  for (const lesson of lessons) {
    if (!unused.length) break;
    const taught = new Set([...lesson.vocabularyIds, ...lesson.grammarIds, ...lesson.kanjiIds]);
    unused.sort((left, right) => {
      const overlap = (value: T) => [...value.vocabularyIds, ...value.grammarIds, ...value.kanjiIds].filter((id) => taught.has(id)).length;
      return overlap(right) - overlap(left) || left.id.localeCompare(right.id);
    });
    const next = unused.shift();
    if (next && [...next.vocabularyIds, ...next.grammarIds, ...next.kanjiIds].some((id) => taught.has(id))) result.set(lesson.id, [next.id]);
  }
  return result;
}

function courseLessons(
  courseId: string,
  unitBlueprints: readonly { id: string; lessons: Omit<LessonBlueprint, 'id'>[] }[],
  items: readonly CurriculumItem[],
  bundle: BundledCurriculum,
  options: { level: 'N5' | 'N4'; vocabularyLimit: number; kanjiLimit: number; grammarLimit: number; includeLegacyGrammar?: boolean },
): CourseLessonDefinition[][] {
  let number = 0;
  const itemLookup = new Map(items.map((item) => [item.id, item]));
  const blueprints = unitBlueprints.flatMap((unit) => unit.lessons.map((lesson, index) => ({ ...lesson, id: `${unit.id.replace('-unit-', '-lesson-')}-${String(index + 1 + unitBlueprints.slice(0, unitBlueprints.indexOf(unit)).reduce((sum, previous) => sum + previous.lessons.length, 0)).padStart(2, '0')}` })));
  // Blueprint IDs above are normalized below to the stable course-wide numbering.
  const normalized = blueprints.map((lesson, index) => ({ ...lesson, id: `${options.level.toLowerCase()}-lesson-${String(index + 1).padStart(2, '0')}` }));
  const levelItems = items.filter((item) => item.level === options.level);
  const vocabulary = distributeItems(levelItems.filter((item) => item.type === 'vocabulary'), normalized, options.vocabularyLimit);
  const kanji = distributeItems(levelItems.filter((item) => item.type === 'kanji'), normalized, options.kanjiLimit);
  const grammarItems = levelItems.filter((item) => item.type === 'grammar');
  const grammar = options.level === 'N5'
    ? distributeInDeclaredOrder(['n5-grammar-wa', 'n5-grammar-desu', 'n5-grammar-no', 'n5-grammar-ga', 'n5-grammar-mo', 'n5-grammar-wo', 'n5-grammar-masu', 'n5-grammar-masen', 'n5-grammar-ni', 'n5-grammar-de'], normalized, 1)
    : distributeItems(grammarItems, normalized, options.grammarLimit);
  const drafted = normalized.map((blueprint, index) => ({
    id: blueprint.id,
    order: index + 1,
    number: index + 1,
    contentLevel: options.level,
    title: (index + 1) % 3 === 0 ? `${blueprint.title} workshop` : blueprint.title,
    theme: blueprint.theme,
    communicationGoal: blueprint.communicationGoal,
    objectives: blueprint.objectives,
    estimatedMinutes: 52,
    prerequisiteLessonIds: index ? [normalized[index - 1]?.id ?? ''] : [],
    vocabularyIds: vocabulary.get(blueprint.id) ?? [],
    grammarIds: grammar.get(blueprint.id) ?? [],
    kanjiIds: kanji.get(blueprint.id) ?? [],
    readingIds: [],
    listeningIds: [],
    vocabularyQuestionIds: [],
    practiceQuestionIds: [],
    assessmentQuestionIds: [],
    patternObjectives: [],
    verbForms: [],
    adjectiveForms: [],
    activities: [],
    sections: [],
  }));
  const reading = assignContext(bundle.readingPassages.filter((activity) => activity.level === options.level), drafted);
  const listening = assignContext(bundle.listeningActivities.filter((activity) => activity.level === options.level), drafted);
  const vocabularyQuestionByItem = new Map<string, string[]>();
  for (const question of bundle.vocabularyQuestions) vocabularyQuestionByItem.set(question.vocabularyId, [...(vocabularyQuestionByItem.get(question.vocabularyId) ?? []), question.id]);
  const practiceByItem = new Map<string, string[]>();
  for (const question of bundle.practiceQuestions) practiceByItem.set(question.itemId, [...(practiceByItem.get(question.itemId) ?? []), question.id]);
  const assessmentByItem = new Map<string, string[]>();
  for (const question of assessmentQuestionSeed) assessmentByItem.set(question.curriculumItemId, [...(assessmentByItem.get(question.curriculumItemId) ?? []), question.id]);
  return unitBlueprints.map((unit, unitIndex) => unit.lessons.map((_, lessonIndex) => {
    const lesson = drafted[number++];
    if (!lesson) throw new Error('Course lesson construction lost a lesson.');
    const vocabularyQuestionIds = lesson.vocabularyIds.flatMap((id) => vocabularyQuestionByItem.get(id) ?? []).slice(0, 8);
    const practiceQuestionIds = [...lesson.grammarIds, ...lesson.kanjiIds, ...reading.get(lesson.id) ?? [], ...listening.get(lesson.id) ?? []]
      .flatMap((id) => practiceByItem.get(id) ?? []).slice(0, 7);
    const assessmentQuestionIds = [...lesson.vocabularyIds, ...lesson.grammarIds, ...lesson.kanjiIds]
      .flatMap((id) => assessmentByItem.get(id) ?? []).slice(0, 4);
    const completed = {
      ...lesson,
      readingIds: reading.get(lesson.id) ?? [],
      listeningIds: listening.get(lesson.id) ?? [],
      vocabularyQuestionIds,
      practiceQuestionIds,
      assessmentQuestionIds,
      patternObjectives: patternObjectivesFor(lesson, itemLookup),
      verbForms: verbFormsFor(lesson),
      adjectiveForms: adjectiveFormsFor(lesson),
      kind: lesson.number % 3 === 0 ? 'workshop' as const : 'lesson' as const,
    };
    const withActivities: CourseLessonDefinition = {
      ...completed,
      estimatedMinutes: completed.verbForms.includes('te') || completed.kind === 'workshop' ? 65 : 52,
      activities: [],
      sections: [],
    };
    const finalLesson = { ...withActivities, activities: standardActivities(withActivities, itemLookup) };
    return { ...finalLesson, sections: sectionBlueprint(finalLesson), order: lessonIndex + 1 + unitBlueprints.slice(0, unitIndex).reduce((sum, previous) => sum + previous.lessons.length, 0) };
  }));
}

function buildFoundations(bundle: BundledCurriculum): CourseDefinition {
  const items = canonicalItems(bundle);
  const itemLookup = new Map(items.map((item) => [item.id, item]));
  // Foundations reuses the authoritative N5 curriculum so each guided chapter
  // can practise real words and kanji instead of inventing placeholder cards.
  const foundationItems = items.filter((item) => item.level === 'N5');
  const vocabulary = distributeItems(foundationItems.filter((item) => item.type === 'vocabulary'), foundationsBlueprints, 4);
  const grammar = new Map<string, string[]>([
    ['foundations-lesson-01', []],
    ['foundations-lesson-02', []],
    ['foundations-lesson-03', []],
    ['foundations-lesson-04', ['n5-grammar-wa', 'n5-grammar-desu']],
    ['foundations-lesson-05', ['n5-grammar-no', 'n5-grammar-mo']],
    ['foundations-lesson-06', ['n5-grammar-ni']],
    ['foundations-lesson-07', ['n5-grammar-ga', 'n5-grammar-wo']],
    ['foundations-lesson-08', ['n5-grammar-masu', 'n5-grammar-masen', 'n5-grammar-de']],
  ]);
  const kanji = distributeItems(foundationItems.filter((item) => item.type === 'kanji'), foundationsBlueprints, 2);
  const reading = distributeItems(foundationItems.filter((item) => item.type === 'reading'), foundationsBlueprints, 1);
  const questionsByItem = new Map<string, string[]>();
  for (const question of assessmentQuestionSeed) questionsByItem.set(question.curriculumItemId, [...(questionsByItem.get(question.curriculumItemId) ?? []), question.id]);
  const lessons = foundationsBlueprints.map((blueprint, index) => {
    const base = {
      id: blueprint.id,
      order: index + 1,
      number: index + 1,
      contentLevel: 'N5' as const,
      title: blueprint.title,
      theme: blueprint.theme,
      communicationGoal: blueprint.communicationGoal,
      objectives: blueprint.objectives,
      estimatedMinutes: 45,
      prerequisiteLessonIds: index ? [foundationsBlueprints[index - 1]?.id ?? ''] : [],
      vocabularyIds: vocabulary.get(blueprint.id) ?? [],
      grammarIds: grammar.get(blueprint.id) ?? [],
      kanjiIds: kanji.get(blueprint.id) ?? [],
      readingIds: reading.get(blueprint.id) ?? [],
      listeningIds: [],
      vocabularyQuestionIds: [],
      practiceQuestionIds: [],
      assessmentQuestionIds: [...(vocabulary.get(blueprint.id) ?? []), ...(grammar.get(blueprint.id) ?? []), ...(kanji.get(blueprint.id) ?? []), ...(reading.get(blueprint.id) ?? [])].flatMap((id) => questionsByItem.get(id) ?? []),
      patternObjectives: [],
      verbForms: [],
      adjectiveForms: [],
      activities: [],
      depthException: 'focused-workshop' as const,
      depthExceptionReason: 'Foundations chapters deliberately focus on kana and a small reusable set of first expressions.',
    } satisfies Omit<CourseLessonDefinition, 'sections'>;
    const lesson: CourseLessonDefinition = {
      ...base,
      patternObjectives: patternObjectivesFor(base, itemLookup),
      verbForms: verbFormsFor(base),
      adjectiveForms: adjectiveFormsFor(base),
      sections: [],
    };
    const withActivities = { ...lesson, activities: standardActivities(lesson, itemLookup) };
    return { ...withActivities, sections: sectionBlueprint(withActivities) };
  });
  void items;
  return { id: 'foundations', level: 'foundations', title: 'Japanese Foundations', description: 'Build kana, sound, and sentence confidence before the main N5 course.', manifestVersion: 2, units: [{ id: 'foundations-unit-1', order: 1, title: 'First steps in Japanese', goal: 'Read a little kana and use your first practical sentences.', lessons }] };
}

function buildLevelCourse(bundle: BundledCurriculum, level: 'N5' | 'N4'): CourseDefinition {
  const blueprints = level === 'N5' ? n5UnitBlueprints : n4UnitBlueprints;
  const itemMap = canonicalItems(bundle);
  const lessonsByUnit = courseLessons(level === 'N5' ? 'jlpt-n5' : 'jlpt-n4', blueprints, itemMap, bundle, level === 'N5'
    ? { level, vocabularyLimit: 20, kanjiLimit: 3, grammarLimit: 2 }
    : { level, vocabularyLimit: 20, kanjiLimit: 5, grammarLimit: 3 });
  return {
    id: level === 'N5' ? 'jlpt-n5' : 'jlpt-n4',
    level,
    title: level === 'N5' ? 'JLPT N5' : 'JLPT N4',
    description: level === 'N5' ? 'Build practical beginner Japanese through connected everyday situations.' : 'Extend your Japanese through connected N4 grammar, reading, and listening.',
    manifestVersion: 2,
    units: blueprints.map((unit, index) => ({ id: unit.id, order: index + 1, title: unit.title, goal: unit.goal, lessons: lessonsByUnit[index] ?? [] })),
  };
}

function outlineLesson(
  id: string,
  order: number,
  contentLevel: 'N5' | 'N4',
  blueprint: Omit<LessonBlueprint, 'id'> | LessonBlueprint,
  kind: 'lesson' | 'workshop' = 'lesson',
): CourseLessonDefinition {
  return {
    id,
    order,
    number: order,
    contentLevel,
    title: kind === 'workshop' ? `${blueprint.title} workshop` : blueprint.title,
    theme: blueprint.theme,
    communicationGoal: blueprint.communicationGoal,
    objectives: blueprint.objectives,
    estimatedMinutes: kind === 'workshop' ? 65 : 52,
    prerequisiteLessonIds: order > 1 ? [`${contentLevel.toLowerCase()}-lesson-${String(order - 1).padStart(2, '0')}`] : [],
    vocabularyIds: [],
    grammarIds: [],
    kanjiIds: [],
    readingIds: [],
    listeningIds: [],
    vocabularyQuestionIds: [],
    practiceQuestionIds: [],
    assessmentQuestionIds: [],
    patternObjectives: [],
    verbForms: [],
    adjectiveForms: [],
    activities: [],
    sections: [],
    kind,
  };
}

/**
 * A tiny navigation catalogue. It deliberately excludes authored activities
 * and the release JSON so tabs can render before a learner opens a lesson.
 */
export function buildCourseOutline(): CourseDefinition[] {
  const foundationLessons = foundationsBlueprints.map((blueprint, index) => ({
    ...outlineLesson(blueprint.id, index + 1, 'N5', blueprint),
    estimatedMinutes: 45,
    prerequisiteLessonIds: index ? [foundationsBlueprints[index - 1]?.id ?? ''] : [],
    depthException: 'focused-workshop' as const,
    depthExceptionReason: 'Foundations chapters deliberately focus on kana and a small reusable set of first expressions.',
  }));
  const levelCourse = (level: 'N5' | 'N4', blueprints: typeof n5UnitBlueprints): CourseDefinition => {
    let lessonNumber = 0;
    return {
      id: level === 'N5' ? 'jlpt-n5' : 'jlpt-n4',
      level,
      title: level === 'N5' ? 'JLPT N5' : 'JLPT N4',
      description: level === 'N5' ? 'Build practical beginner Japanese through connected everyday situations.' : 'Extend your Japanese through connected N4 grammar, reading, and listening.',
      manifestVersion: 2,
      units: blueprints.map((unit, unitIndex) => ({
        id: unit.id,
        order: unitIndex + 1,
        title: unit.title,
        goal: unit.goal,
        lessons: unit.lessons.map((blueprint) => {
          lessonNumber += 1;
          return outlineLesson(`${level.toLowerCase()}-lesson-${String(lessonNumber).padStart(2, '0')}`, lessonNumber, level, blueprint, lessonNumber % 3 === 0 ? 'workshop' : 'lesson');
        }),
      })),
    };
  };
  return [
    {
      id: 'foundations',
      level: 'foundations',
      title: 'Japanese Foundations',
      description: 'Build kana, sound, and sentence confidence before the main N5 course.',
      manifestVersion: 2,
      units: [{ id: 'foundations-unit-1', order: 1, title: 'First steps in Japanese', goal: 'Read a little kana and use your first practical sentences.', lessons: foundationLessons }],
    },
    levelCourse('N5', n5UnitBlueprints),
    levelCourse('N4', n4UnitBlueprints),
  ];
}

function referenceEntries(lesson: CourseLessonDefinition): { type: CourseReferenceType; id: string }[] {
  return [
    ...lesson.vocabularyIds.map((id) => ({ type: 'vocabulary' as const, id })),
    ...lesson.grammarIds.map((id) => ({ type: 'grammar' as const, id })),
    ...lesson.kanjiIds.map((id) => ({ type: 'kanji' as const, id })),
    ...lesson.readingIds.map((id) => ({ type: 'reading' as const, id })),
    ...lesson.listeningIds.map((id) => ({ type: 'listening' as const, id })),
    ...lesson.vocabularyQuestionIds.map((id) => ({ type: 'vocabulary-question' as const, id })),
    ...lesson.practiceQuestionIds.map((id) => ({ type: 'practice-question' as const, id })),
    ...lesson.assessmentQuestionIds.map((id) => ({ type: 'assessment-question' as const, id })),
  ];
}

export interface CourseValidationIssue { path: string; message: string; }

let cachedDefaultManifest: CourseManifest | undefined;

function manifestHash(content: Pick<CourseManifest, 'schemaVersion' | 'courses' | 'supplementalItemIds'>): string {
  // Course data is authored deterministically in source order. JSON.stringify
  // preserves that order and avoids recursively sorting a multi-megabyte guided
  // activity graph on the mobile JavaScript thread.
  return `sha256:${sha256Text(JSON.stringify(content))}`;
}

const verbFormDependencies: Partial<Record<VerbFormId, VerbFormId>> = {
  nai: 'dictionary',
  past: 'dictionary',
  te: 'dictionary',
  potential: 'dictionary',
  volitional: 'masu',
  tara: 'past',
  nara: 'dictionary',
  ba: 'dictionary',
  passive: 'dictionary',
  causative: 'dictionary',
  causative_passive: 'causative',
};

export function validateCourseManifest(manifest: CourseManifest, bundle: BundledCurriculum = loadBundledCurriculum()): CourseValidationIssue[] {
  const issues: CourseValidationIssue[] = [];
  const itemById = new Map(canonicalItems(bundle).map((item) => [item.id, item]));
  const vocabularyQuestionIds = new Set(bundle.vocabularyQuestions.map((question) => question.id));
  const practiceQuestionIds = new Set(bundle.practiceQuestions.map((question) => question.id));
  const assessmentQuestionIds = new Set(assessmentQuestionSeed.map((question) => question.id));
  const vocabularyQuestionById = new Map(bundle.vocabularyQuestions.map((question) => [question.id, question]));
  const practiceQuestionById = new Map(bundle.practiceQuestions.map((question) => [question.id, question]));
  const assessmentQuestionById = new Map(assessmentQuestionSeed.map((question) => [question.id, question]));
  for (const course of manifest.courses) {
    const seenUnitOrders = new Set<number>();
    const lessons = course.units.flatMap((unit) => unit.lessons);
    if ((course.level === 'N5' || course.level === 'N4') && lessons.length < 25) issues.push({ path: course.id, message: 'A JLPT course requires at least 25 substantial lessons.' });
    // N4 begins after the N5 core forms; within each course later forms still
    // have to follow the form they build on.
    const introducedVerbForms = new Set<VerbFormId>(course.level === 'N4' ? ['masu', 'dictionary', 'nai', 'past', 'te'] : []);
    for (const lesson of lessons.slice().sort((left, right) => left.order - right.order)) {
      for (const form of lesson.verbForms) {
        const dependency = verbFormDependencies[form];
        if (dependency && !introducedVerbForms.has(dependency)) issues.push({ path: lesson.id, message: `${form} form is introduced before its ${dependency} form prerequisite.` });
        introducedVerbForms.add(form);
      }
    }
    const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const seenOrders = new Set<number>();
    for (const unit of course.units) {
      if (seenUnitOrders.has(unit.order)) issues.push({ path: course.id, message: `Duplicate unit order ${unit.order}.` });
      seenUnitOrders.add(unit.order);
      for (const lesson of unit.lessons) {
        if (seenOrders.has(lesson.order)) issues.push({ path: lesson.id, message: `Duplicate lesson order ${lesson.order}.` });
        seenOrders.add(lesson.order);
        if (lesson.vocabularyIds.length > 20 || lesson.grammarIds.length > 3 || lesson.kanjiIds.length > 5) issues.push({ path: lesson.id, message: 'Lesson exceeds the configured introduction limit.' });
        if (lesson.depthException && !lesson.depthExceptionReason?.trim()) issues.push({ path: lesson.id, message: 'A depth exception requires a written justification.' });
        if (!lesson.depthException && lesson.estimatedMinutes < 45) issues.push({ path: lesson.id, message: 'A normal lesson must estimate at least 45 minutes.' });
        if (!lesson.depthException && lesson.vocabularyIds.length < 12) issues.push({ path: lesson.id, message: 'A normal lesson requires at least 12 vocabulary items.' });
        if (!lesson.depthException && lesson.patternObjectives.length < 2) issues.push({ path: lesson.id, message: 'A normal lesson requires at least two pattern objectives.' });
        if (!lesson.depthException && lesson.kanjiIds.length < 2) issues.push({ path: lesson.id, message: 'A normal lesson requires at least two kanji.' });
        for (const prerequisite of lesson.prerequisiteLessonIds) if (!lessonsById.has(prerequisite)) issues.push({ path: lesson.id, message: `Missing prerequisite ${prerequisite}.` });
        for (const reference of referenceEntries(lesson)) {
          const exists = reference.type === 'vocabulary-question' ? vocabularyQuestionIds.has(reference.id)
            : reference.type === 'practice-question' ? practiceQuestionIds.has(reference.id)
              : reference.type === 'assessment-question' ? assessmentQuestionIds.has(reference.id)
                : itemById.get(reference.id)?.type === reference.type;
          if (!exists) issues.push({ path: lesson.id, message: `Missing canonical ${reference.type} reference ${reference.id}.` });
        }
        const taught = new Set([...lesson.vocabularyIds, ...lesson.grammarIds, ...lesson.kanjiIds, ...lesson.readingIds, ...lesson.listeningIds]);
        for (const id of lesson.vocabularyQuestionIds) if (vocabularyQuestionById.get(id) && !taught.has(vocabularyQuestionById.get(id)?.vocabularyId ?? '')) issues.push({ path: lesson.id, message: `Vocabulary question ${id} does not target taught content.` });
        for (const id of lesson.practiceQuestionIds) if (practiceQuestionById.get(id) && !taught.has(practiceQuestionById.get(id)?.itemId ?? '')) issues.push({ path: lesson.id, message: `Practice question ${id} does not target taught content.` });
        for (const id of lesson.assessmentQuestionIds) if (assessmentQuestionById.get(id) && !taught.has(assessmentQuestionById.get(id)?.curriculumItemId ?? '')) issues.push({ path: lesson.id, message: `Assessment question ${id} does not target taught content.` });
        const sectionOrders = new Set<number>();
        for (const section of lesson.sections) {
          if (sectionOrders.has(section.order)) issues.push({ path: lesson.id, message: `Duplicate section order ${section.order}.` });
          sectionOrders.add(section.order);
        }
        const activityOrders = new Set<number>();
        const activityIds = new Set<string>();
        const requiredTypes = new Set(lesson.activities.filter((activity) => activity.required).map((activity) => activity.type));
        const totalInteractions = lesson.activities.reduce((total, activity) => total + activity.interactionCount, 0);
        const manipulationInteractions = lesson.activities
          .filter((activity) => ['substitution_drill', 'sentence_transformation', 'conjugation_drill', 'error_correction'].includes(activity.type))
          .reduce((total, activity) => total + activity.interactionCount, 0);
        for (const activity of lesson.activities) {
          if (activityOrders.has(activity.order)) issues.push({ path: lesson.id, message: `Duplicate activity order ${activity.order}.` });
          activityOrders.add(activity.order);
          if (activityIds.has(activity.id)) issues.push({ path: lesson.id, message: `Duplicate activity ID ${activity.id}.` });
          activityIds.add(activity.id);
          if (activity.interactionCount !== activity.exercises.length || activity.interactionCount < 1) issues.push({ path: activity.id, message: 'Activity interaction count must match its exercises.' });
          const exerciseIds = new Set<string>();
          for (const exercise of activity.exercises) {
            if (exerciseIds.has(exercise.id)) issues.push({ path: activity.id, message: `Duplicate exercise ID ${exercise.id}.` });
            exerciseIds.add(exercise.id);
            if ((exercise.responseKind === 'typed' || exercise.responseKind === 'select') && !exercise.acceptedAnswers?.length) issues.push({ path: activity.id, message: `Exercise ${exercise.id} has no accepted answer.` });
          }
        }
        if (!lesson.depthException && totalInteractions < 40) issues.push({ path: lesson.id, message: 'A normal lesson requires at least 40 guided interactions.' });
        if (!lesson.depthException && lesson.kind !== 'workshop' && totalInteractions > 90) issues.push({ path: lesson.id, message: 'A normal lesson has more than 90 guided interactions; split or consolidate the activity flow.' });
        if (!lesson.depthException && manipulationInteractions < 8) issues.push({ path: lesson.id, message: 'A normal lesson requires at least eight sentence-manipulation interactions.' });
        for (const type of ['reading', 'listening', 'sentence_production', 'checkpoint'] as const) if (!requiredTypes.has(type)) issues.push({ path: lesson.id, message: `Missing required ${type} activity.` });
        const checkpoint = lesson.activities.find((activity) => activity.type === 'checkpoint');
        if (!lesson.depthException && (checkpoint?.interactionCount ?? 0) < 20) issues.push({ path: lesson.id, message: 'A normal lesson checkpoint requires at least 20 interactions.' });
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (lessonId: string): void => {
      if (visiting.has(lessonId)) { issues.push({ path: lessonId, message: 'Impossible prerequisite cycle.' }); return; }
      if (visited.has(lessonId)) return;
      visiting.add(lessonId);
      for (const prerequisite of lessonsById.get(lessonId)?.prerequisiteLessonIds ?? []) visit(prerequisite);
      visiting.delete(lessonId);
      visited.add(lessonId);
    };
    for (const lesson of lessons) visit(lesson.id);
  }
  const computedHash = manifestHash({ schemaVersion: manifest.schemaVersion, courses: manifest.courses, supplementalItemIds: manifest.supplementalItemIds });
  if (manifest.hash !== computedHash) issues.push({ path: 'manifest', message: 'Manifest hash does not match deterministic course content.' });
  return issues;
}

export function buildCourseManifest(bundle?: BundledCurriculum): CourseManifest {
  if (!bundle && cachedDefaultManifest) return cachedDefaultManifest;
  const source = bundle ?? loadBundledCurriculum();
  const courses = [buildFoundations(source), buildLevelCourse(source, 'N5'), buildLevelCourse(source, 'N4')];
  const referenced = new Set(courses.flatMap((course) => course.units.flatMap((unit) => unit.lessons.flatMap((lesson) => [...lesson.vocabularyIds, ...lesson.grammarIds, ...lesson.kanjiIds, ...lesson.readingIds, ...lesson.listeningIds]))));
  const supplementalItemIds = canonicalItems(source).filter((item) => !referenced.has(item.id)).map((item) => item.id).sort();
  const content = { schemaVersion: 1 as const, courses, supplementalItemIds };
  const manifest = { ...content, hash: manifestHash(content) };
  if (!bundle) cachedDefaultManifest = manifest;
  return manifest;
}
