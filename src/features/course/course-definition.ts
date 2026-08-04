import { assessmentQuestionSeed } from '../assessment/seed';
import { loadBundledCurriculum, type BundledCurriculum } from '../curriculum/bundled-curriculum';
import { n5CurriculumSeed } from '../curriculum/seed';
import { sha256Text } from '../../utils/deterministic-hash';
import type { AdjectiveFormId, CourseDefinition, CourseLessonDefinition, CourseManifest, CourseReferenceType, CourseSectionDefinition, LessonActivityDefinition, LessonActivityExercise, VerbFormId } from '../../types/course';
import type { CurriculumItem } from '../../types/learning';
import { conjugateAdjectiveForm, conjugateNounForm, conjugateVerb } from './conjugation-service';
import { createTransformation } from './sentence-transformation';
import { lessonExperienceFor, validateLessonExperience, validateLessonTemplateDistribution } from './lesson-experience';

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

function informationExercise(id: string, category: LessonActivityExercise['category'], prompt: string, itemId?: string, readingText?: string, listeningText?: string): LessonActivityExercise {
  return { id, responseKind: 'continue', category, prompt, itemId, readingText, listeningText, expectedResponse: { script: 'none' } };
}

/** A self-confirmed listening step keeps the context non-evaluative while remaining tactile. */
function acknowledgementExercise(id: string, category: LessonActivityExercise['category'], prompt: string, itemId?: string, listeningText?: string): LessonActivityExercise {
  const acknowledgement = 'I heard the situation';
  return {
    id,
    responseKind: 'typed',
    category,
    prompt,
    itemId,
    listeningText,
    acceptedAnswers: [acknowledgement],
    options: [{ id: 'acknowledged', label: acknowledgement }],
    expectedResponse: { script: 'choice', format: 'Continue when you have listened once.' },
  };
}

function stableOptionHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16_777_619);
  return hash >>> 0;
}

function distributedChoices(id: string, correct: string, distractors: readonly string[]): { id: string; label: string; correct: boolean }[] {
  const incorrect = distractors
    .filter((value, index, values) => value.length > 0 && value !== correct && values.indexOf(value) === index)
    .sort((left, right) => stableOptionHash(`${id}:${left}`) - stableOptionHash(`${id}:${right}`));
  const count = Math.min(4, incorrect.length + 1);
  const correctIndex = stableOptionHash(id) % count;
  const choices: { id: string; label: string; correct: boolean }[] = [];
  let distractorIndex = 0;
  for (let index = 0; index < count; index += 1) {
    const isCorrect = index === correctIndex;
    choices.push({ id: isCorrect ? 'correct' : `option-${index + 1}`, label: isCorrect ? correct : incorrect[distractorIndex++]!, correct: isCorrect });
  }
  return choices;
}

function selectExercise(id: string, category: LessonActivityExercise['category'], prompt: string, correct: string, distractors: string[], itemId?: string, explanation?: string, listeningText?: string): LessonActivityExercise {
  const answers = distributedChoices(id, correct, distractors);
  return { id, responseKind: 'select', category, prompt, itemId, options: answers.map(({ id: optionId, label }) => ({ id: optionId, label })), acceptedAnswers: ['correct'], explanation, listeningText, expectedResponse: { script: 'choice', format: 'Choose one answer.' }, correctReinforcement: explanation };
}

function relatedFormDistractors(correct: string): string[] {
  const candidates = new Set<string>();
  if (correct.includes('てから')) {
    candidates.add(correct.replace('てから', 'て'));
    candidates.add(correct.replace('てから', 'ますから'));
    if (correct === 'ご飯を食べてから、学校へ行きます') candidates.add('学校へ行ってから、ご飯を食べます');
  }
  if (correct.includes('ています')) {
    candidates.add(correct.replace('ています', 'ていません'));
    candidates.add(correct.replace('ています', 'ます'));
  }
  if (correct.includes('です')) {
    candidates.add(correct.replace('です', 'ではありません'));
    candidates.add(correct.replace('です', 'ですか'));
    candidates.add(correct.replace('は', 'が'));
  }
  const endings: Record<string, string[]> = {
    'ませんでした': ['ました', 'ません', 'ます'],
    'ました': ['ます', 'ません', 'ませんでした'],
    'ません': ['ます', 'ました', 'ませんでした'],
    'ます': ['ません', 'ました', 'て'],
    'なかった': ['ない', 'ます', 'ました'],
    'ない': ['ます', 'て', 'ました'],
    'て': ['ます', 'た', 'ない'],
    'た': ['て', 'ます', 'ない'],
    'る': ['ます', 'て', 'ない'],
  };
  const ending = Object.keys(endings).find((candidate) => correct.endsWith(candidate));
  if (ending) {
    const stem = correct.slice(0, -ending.length);
    for (const replacement of endings[ending] ?? []) candidates.add(`${stem}${replacement}`);
  }
  if (correct.includes('を')) candidates.add(correct.replace('を', 'に'));
  if (correct.includes('に')) candidates.add(correct.replace('に', 'で'));
  return [...candidates].filter((candidate) => candidate !== correct && candidate.length > 0);
}

const fallbackDistractors: Record<Exclude<LessonActivityExercise['category'], 'production'>, string[]> = {
  vocabulary: ['学生', '先生', '友だち'],
  grammar: ['これは本です', 'わたしは学生です', '食べません'],
  conjugation: ['食べません', '食べました', '食べて'],
  kanji: ['にち', 'ひ', 'がく'],
  reading: ['A practical plan', 'A short conversation', 'An everyday message'],
  listening: ['もう一度聞いてください', '確認します', 'ありがとうございます'],
};

function guidedChoiceDistractors(
  category: Exclude<LessonActivityExercise['category'], 'production'>,
  correct: string,
  preferred: string[] = [],
): string[] {
  const related = category === 'grammar' || category === 'conjugation'
    ? relatedFormDistractors(correct)
    : [];
  return [...preferred, ...related, ...fallbackDistractors[category]]
    .filter((value, index, values) => value !== correct && values.indexOf(value) === index)
    .slice(0, 3);
}

function choiceTask(category: Exclude<LessonActivityExercise['category'], 'production'>, prompt: string): string {
  if (prompt.includes('Model:') || prompt.includes('Which complete sentence')) return 'Use the model as a pattern. Apply every change named in the question, then choose the complete sentence.';
  if (prompt.startsWith('Correct:')) return 'Find the mistake, then choose the corrected Japanese sentence.';
  if (prompt.startsWith('Read ')) return 'Choose the reading used in the word shown.';
  if (prompt.startsWith('Rewrite ') || prompt.startsWith('Combine ') || prompt.startsWith('Put in order:')) return 'Make only the requested form or word-order change, then choose the correct result.';
  if (prompt.startsWith('Write Japanese for:') || prompt.startsWith('Translate into Japanese:') || prompt.startsWith('Complete the situation with:')) return 'Choose the Japanese word or sentence that matches the English meaning.';
  if (category === 'listening') return 'Listen first, then choose the answer that matches the audio.';
  if (category === 'vocabulary') return 'Choose the Japanese word that matches the meaning.';
  if (category === 'kanji') return 'Choose the reading of the complete word, not an isolated kanji reading.';
  return 'Choose the one answer that completes the task above.';
}

function typedExercise(id: string, category: LessonActivityExercise['category'], prompt: string, acceptedAnswers: string[], itemId?: string, explanation?: string, readingText?: string, listeningText?: string, distractors?: string[]): LessonActivityExercise {
  const polite = /polite|ます|です/u.test(prompt);
  if (category !== 'production') {
    const answer = acceptedAnswers[0] ?? '';
    return {
      id,
      responseKind: 'typed',
      category,
      prompt: prompt.replace(/\bType\b/gu, 'Choose').replace(/\btype\b/gu, 'choose'),
      itemId,
      acceptedAnswers,
      explanation,
      readingText,
      listeningText,
      options: distributedChoices(id, answer, guidedChoiceDistractors(category, answer, distractors)).map(({ id: optionId, label }) => ({ id: optionId, label })),
      expectedResponse: { script: 'choice', format: choiceTask(category, prompt) },
      hints: category === 'conjugation'
        ? ['Look at the final kana of the verb.', answer ? `It begins: ${answer.slice(0, Math.max(1, Math.ceil(answer.length / 2)))}…` : 'Use the model.', answer ? `Answer: ${answer}` : undefined]
        : undefined,
      correctReinforcement: explanation,
    };
  }
  return {
    id,
    responseKind: 'production',
    category,
    prompt,
    itemId,
    acceptedAnswers,
    explanation,
    readingText,
    listeningText,
    optional: true,
    expectedResponse: {
      script: 'japanese_sentence',
      politeness: polite ? 'polite' : 'either',
      format: 'Optional challenge: write one short Japanese sentence.',
    },
    correctReinforcement: explanation,
  };
}

function lookupItems(ids: readonly string[], lookup: ItemLookup): CurriculumItem[] {
  return ids.flatMap((id) => {
    const item = lookup.get(id);
    return item ? [item] : [];
  });
}

interface LessonScenario {
  speakers: readonly [string, string];
  place: string;
  firstAction: string;
  firstActionEnglish: string;
  clarification: string;
  clarificationEnglish: string;
  note: string;
  noteEnglish: string;
}

interface LessonNarrative {
  reading: string;
  listening: string;
  situation: string;
  vocabularyModel: string;
  readingMainPrompt: string;
  readingMainAnswer: string;
  readingMainDistractors: string[];
  readingDetailPrompt: string;
  readingDetailAnswer: string;
  readingDetailDistractors: string[];
  listeningGlobalPrompt: string;
  listeningGlobalAnswer: string;
  listeningGlobalDistractors: string[];
  listeningDetailPrompt: string;
  listeningDetailAnswer: string;
  listeningDetailDistractors: string[];
  dictationPrompt: string;
  heardPhrase: string;
}

const lessonScenarios: readonly LessonScenario[] = [
  { speakers: ['さき', 'けん'], place: '図書館', firstAction: '開く時間を先に見ます', firstActionEnglish: 'Check the library opening time first.', clarification: '読めないところは、ゆっくり言ってください。', clarificationEnglish: 'Ask the speaker to say it slowly.', note: '借りる本の名前', noteEnglish: 'the title of the book to borrow' },
  { speakers: ['みお', 'たく'], place: '駅', firstAction: '出る時間を確認します', firstActionEnglish: 'Confirm the departure time.', clarification: '聞こえなかったので、もう一度言ってください。', clarificationEnglish: 'Ask for the information again.', note: '電車の番線', noteEnglish: 'the train platform number' },
  { speakers: ['りな', 'そうた'], place: '教室', firstAction: '先生に聞いてから始めます', firstActionEnglish: 'Ask the teacher before starting.', clarification: '字が小さいです。見せてください。', clarificationEnglish: 'Ask to see the small writing.', note: '宿題を出す日', noteEnglish: 'the homework due date' },
  { speakers: ['ゆい', 'はる'], place: '店', firstAction: '値段を比べます', firstActionEnglish: 'Compare the prices.', clarification: 'すみません、もう少しゆっくり話してください。', clarificationEnglish: 'Ask the clerk to speak more slowly.', note: '買う物の数', noteEnglish: 'the number of items to buy' },
  { speakers: ['のぞみ', 'こう'], place: '公園', firstAction: '会う場所を決めます', firstActionEnglish: 'Decide where to meet.', clarification: 'よく聞こえませんでした。もう一度お願いします。', clarificationEnglish: 'Ask to hear the plan once more.', note: '入口の近く', noteEnglish: 'the place near the entrance' },
  { speakers: ['えま', 'りく'], place: '病院', firstAction: '予約の時間を電話で聞きます', firstActionEnglish: 'Call to ask the appointment time.', clarification: '早いので、ゆっくりお願いします。', clarificationEnglish: 'Ask the caller to speak slowly.', note: '持って行く物', noteEnglish: 'what to bring' },
  { speakers: ['なな', 'だいき'], place: '市役所', firstAction: '書く場所をたしかめます', firstActionEnglish: 'Check where to write on the form.', clarification: 'ここをもう一度言ってください。', clarificationEnglish: 'Ask about that part again.', note: '必要な書類', noteEnglish: 'the required documents' },
  { speakers: ['ひな', 'ゆうと'], place: '会社', firstAction: '会議の部屋を見に行きます', firstActionEnglish: 'Go and check the meeting room.', clarification: '大事な所をもう一度聞かせてください。', clarificationEnglish: 'Ask to hear the important part again.', note: '会議の始まる時刻', noteEnglish: 'the meeting start time' },
  { speakers: ['まい', 'しゅん'], place: '家', firstAction: '買い物の紙を見直します', firstActionEnglish: 'Check the shopping list again.', clarification: 'その言葉の意味を教えてください。', clarificationEnglish: 'Ask what the word means.', note: '今夜の食事', noteEnglish: 'tonight’s meal' },
  { speakers: ['あおい', 'れお'], place: '案内所', firstAction: '地図で道を調べます', firstActionEnglish: 'Look up the route on a map.', clarification: '駅までの道を、もう一度お願いします。', clarificationEnglish: 'Ask for the directions again.', note: 'バスの出る場所', noteEnglish: 'where the bus leaves' },
  { speakers: ['かほ', 'じん'], place: '体育館', firstAction: '始まる前に入口を見ます', firstActionEnglish: 'Check the entrance before it begins.', clarification: '時間をもう一度言ってください。', clarificationEnglish: 'Ask for the time again.', note: '必要な運動ぐつ', noteEnglish: 'the needed sports shoes' },
  { speakers: ['ふうか', 'なお'], place: '郵便局', firstAction: '出す前に住所を確認します', firstActionEnglish: 'Check the address before sending it.', clarification: '数字をゆっくり読んでください。', clarificationEnglish: 'Ask the clerk to read the numbers slowly.', note: '切手の値段', noteEnglish: 'the stamp price' },
];

function lessonNarrative(lesson: Pick<CourseLessonDefinition, 'number' | 'contentLevel' | 'vocabularyIds'>, lookup: ItemLookup): LessonNarrative {
  const words = lookupItems(lesson.vocabularyIds, lookup).slice(0, 4).map((item) => item.title);
  const topic = words[0] ?? '予定';
  const detail = words[1] ?? '時間';
  const support = words[2] ?? '友だち';
  const outcome = words[3] ?? '大事なこと';
  const scenario = lessonScenarios[(lesson.number - 1) % lessonScenarios.length] ?? lessonScenarios[0]!;
  const [firstSpeaker, secondSpeaker] = scenario.speakers;
  const listening = `${firstSpeaker}：${scenario.place}で「${topic}」を見つけました。\n${secondSpeaker}：「${detail}」もいっしょに見ましょう。\n${firstSpeaker}：では、${scenario.firstAction}。\n${secondSpeaker}：${scenario.clarification}`;
  const flows = [
    [
      `${firstSpeaker}は朝、${scenario.place}で小さな案内を見つけました。`,
      `案内には「${topic}」と「${detail}」という言葉がありました。`,
      `${firstSpeaker}は意味を急いで決めず、${secondSpeaker}と一つずつ読みました。`,
      `${secondSpeaker}は、${scenario.firstAction}と言いました。`,
      `二人は${support}にも分かるように、短い言葉で話すことにしました。`,
      `分からない所では、${secondSpeaker}は「${scenario.clarification}」と言いました。`,
      `話したあと、${firstSpeaker}はノートに${scenario.note}と「${topic}」を書きました。`,
      `最後に、二人は${outcome}を確認してから次の行動を決めました。`,
      `${firstSpeaker}は、場面によって聞き方を変えると話しやすいと感じました。`,
      `${secondSpeaker}も、短く確認すると間違いが少ないと言いました。`,
      `帰る前に、二人は明日もう一度この案内を見る約束をしました。`,
      `次の日、${firstSpeaker}は自分で「${detail}」を見つけられました。`,
    ],
    [
      `午後、${secondSpeaker}は${scenario.place}で${firstSpeaker}を待っていました。`,
      `${firstSpeaker}は「${topic}」について聞きたいことがあると言いました。`,
      `二人は案内を見ながら、「${detail}」がどこに書いてあるか探しました。`,
      `すぐに決めないで、${scenario.firstAction}ことにしました。`,
      `${secondSpeaker}は早口にならないように気をつけました。`,
      `${firstSpeaker}は分からない時に「${scenario.clarification}」と伝えました。`,
      `その後、${scenario.note}を紙に書いて、必要な物を数えました。`,
      `${support}に知らせるため、二人は短いメッセージも作りました。`,
      `話し合うと、「${topic}」の使い方が前よりよく分かりました。`,
      `二人は急がず確認したので、${outcome}を忘れませんでした。`,
      `帰り道に、${firstSpeaker}は次に同じ場面になった時の言い方を練習しました。`,
      `${secondSpeaker}は、相手の返事を待つことも大切だと教えました。`,
    ],
    [
      `${firstSpeaker}と${secondSpeaker}には、${scenario.place}で確認したい用事がありました。`,
      `まず、二人は「${topic}」という言葉を見て、知っている意味を出し合いました。`,
      `次に「${detail}」について、案内の数字と時間を見直しました。`,
      `二人が選んだ最初の行動は、${scenario.firstAction}ことでした。`,
      `説明が長くなった時、${secondSpeaker}は「${scenario.clarification}」と頼みました。`,
      `${firstSpeaker}は言い直してから、${support}にも同じ説明をしました。`,
      `メモには「${topic}」と${scenario.note}が並んでいました。`,
      `二人はメモを見ながら、${outcome}を先に終える方法を考えました。`,
      `答えが一つに見えても、案内全体を読む必要があると分かりました。`,
      `だから、二人は次の文に進む前に内容を短く確認しました。`,
      `用事が終わると、${firstSpeaker}は自分の言葉で今日の予定を言えました。`,
      `${secondSpeaker}は、その話し方なら相手にも伝わると言いました。`,
    ],
    [
      `休日に、${firstSpeaker}は${scenario.place}で${secondSpeaker}と会いました。`,
      `${firstSpeaker}が持ってきた紙には「${topic}」と書いてありました。`,
      `${secondSpeaker}は「${detail}」も調べると役に立つと言いました。`,
      `二人は相談して、${scenario.firstAction}ことから始めました。`,
      `聞き取れない言葉が出た時は、${scenario.clarification}と落ち着いて言いました。`,
      `二人は相手が話し終わってから、自分の考えを一文で伝えました。`,
      `その紙の下には、${scenario.note}と連絡する時間が書かれていました。`,
      `${support}にも見せるため、二人は字を大きく書き直しました。`,
      `確認した後なら、${outcome}について安心して決められます。`,
      `${firstSpeaker}は、知らない言葉でもすぐにあきらめないことにしました。`,
      `${secondSpeaker}は、相手に聞き返す時の言い方をもう一度練習しました。`,
      `二人は次の予定でも、同じように案内を最後まで読むつもりです。`,
    ],
  ] as const;
  const lines = flows[(lesson.number - 1) % flows.length] ?? flows[0];
  const extensionLines = [
    `${firstSpeaker}は${scenario.place}で聞いた言葉を、家でもう一度声に出して読みました。`,
    `${secondSpeaker}は${scenario.note}が分かれば、次の用事も安心して進められると考えました。`,
    `二人は「${topic}」を使った短い文を作り、${detail}との違いを比べました。`,
    `もし案内が変わったら、すぐに決めず、もう一度全体を読むことにしました。`,
    `${support}から質問が来た時も、二人は最初に確認した内容から順番に答えました。`,
    `急ぐ時ほど、${scenario.firstAction}ことが役に立つと二人は気づきました。`,
    `${firstSpeaker}は相手の言葉を最後まで聞いてから、必要な時だけ聞き返しました。`,
    `${secondSpeaker}は、今日のような短い会話を何度も練習したいと言いました。`,
  ];
  const target = lesson.contentLevel === 'N4'
    ? lesson.number >= 28 ? 600 : lesson.number >= 16 ? 400 : 250
    : 130;
  let reading = '';
  for (const line of [...lines, ...extensionLines]) { reading += line; if (reading.length >= target) break; }
  return {
    reading,
    listening,
    situation: `${firstSpeaker} and ${secondSpeaker} are at the ${scenario.place}. They need to understand an everyday detail before acting.`,
    vocabularyModel: `${firstSpeaker}：「${topic}」を見つけました。\n${secondSpeaker}：では、「${detail}」も見ましょう。`,
    readingMainPrompt: `What do ${firstSpeaker} and ${secondSpeaker} do first after they find “${topic}”?`,
    readingMainAnswer: `${scenario.firstActionEnglish} This helps them check “${topic}” carefully.`,
    readingMainDistractors: [`Buy something related to “${topic}” without checking it.`, `Leave before they find the detail about “${detail}”.`, `Ask someone else to make the decision for them.`],
    readingDetailPrompt: `What does ${firstSpeaker} write in the notes after the conversation?`,
    readingDetailAnswer: `“${topic}” and ${scenario.noteEnglish}.`,
    readingDetailDistractors: [`Only a plan for “${detail}”.`, `A message about a different place.`, `A list that does not mention “${topic}”.`],
    listeningGlobalPrompt: `After listening at ${scenario.place}, what should the speaker do when “${topic}” or another detail is unclear?`,
    listeningGlobalAnswer: `${scenario.clarificationEnglish} while checking “${topic}”.`,
    listeningGlobalDistractors: [`Guess what “${detail}” means from the next word.`, `Change the plan before checking “${topic}”.`, `Continue without asking about the unclear detail.`],
    listeningDetailPrompt: `What do ${firstSpeaker} and ${secondSpeaker} agree to do first about “${topic}”?`,
    listeningDetailAnswer: `${scenario.firstActionEnglish} Then they can use “${topic}” in the right context.`,
    listeningDetailDistractors: [`Repeat a greeting instead of checking “${topic}”.`, `Write a notebook page before looking at “${detail}”.`, `Leave ${scenario.place} without a plan.`],
    dictationPrompt: `Which Japanese phrase do you hear when ${secondSpeaker} asks for clarification at ${scenario.place}?`,
    heardPhrase: scenario.clarification,
  };
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

function moveActivityAfter(activities: LessonActivityDefinition[], title: string, afterTitle: string): void {
  const sourceIndex = activities.findIndex((activity) => activity.title === title);
  const targetIndex = activities.findIndex((activity) => activity.title === afterTitle);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex + 1) return;
  const [activityToMove] = activities.splice(sourceIndex, 1);
  if (!activityToMove) return;
  const adjustedTarget = activities.findIndex((activity) => activity.title === afterTitle);
  activities.splice(adjustedTarget + 1, 0, activityToMove);
}

/** Changes lesson rhythm without changing the authoritative learning items. */
function arrangeActivitiesForExperience(lesson: CourseLessonDefinition, source: LessonActivityDefinition[]): LessonActivityDefinition[] {
  const activities = [...source];
  // The first greeting is introduced before its recognition check. Keep the
  switch (lesson.experience.template) {
    case 'pattern_workshop':
      moveActivityAfter(activities, 'Vocabulary batch two', 'Verb and form drill');
      moveActivityAfter(activities, 'Vocabulary in context', 'Vocabulary batch two');
      break;
    case 'reading_first':
      moveActivityAfter(activities, 'Reading passage', 'Vocabulary batch two');
      break;
    case 'situation_challenge':
      moveActivityAfter(activities, 'Dialogue replay and breakdown', 'Vocabulary recognition');
      break;
    case 'review_workshop':
      moveActivityAfter(activities, 'Find and correct the mistake', 'Transform and connect');
      break;
    case 'story_chapter':
    case 'conversation_first':
      break;
  }
  return activities.map((activity, index) => ({ ...activity, order: index + 1 }));
}

function standardActivities(lesson: CourseLessonDefinition, lookup: ItemLookup): LessonActivityDefinition[] {
  const vocabulary = lookupItems(lesson.vocabularyIds, lookup).slice(0, 16);
  const grammar = patternObjectivesFor(lesson, lookup);
  const kanji = lookupItems(lesson.kanjiIds, lookup).slice(0, 4);
  const wordForKanji = (kanjiItem: CurriculumItem) => vocabulary.find((word) => word.title.includes(kanjiItem.title));
  const vocabularyDistractors = (targetId: string | undefined) => {
    const target = vocabulary.find((item) => item.id === targetId);
    return vocabulary
      .filter((item) => item.id !== targetId)
      .sort((left, right) => {
        const leftOverlap = target ? left.tags.filter((tag) => target.tags.includes(tag)).length : 0;
        const rightOverlap = target ? right.tags.filter((tag) => target.tags.includes(tag)).length : 0;
        if (rightOverlap !== leftOverlap) return rightOverlap - leftOverlap;
        return left.title.localeCompare(right.title);
      })
      .map((item) => item.title);
  };
  const vocabularyMeaningDistractors = (target: CurriculumItem) => vocabularyDistractors(target.id)
    .map((title) => vocabulary.find((item) => item.title === title)?.meaning ?? title);
  const kanjiReadingDistractors = (targetId: string | undefined) => kanji
    .filter((item) => item.id !== targetId)
    .flatMap((item) => [wordForKanji(item)?.reading, item.reading].filter((reading): reading is string => Boolean(reading)));
  const vocabularyPreviewExercises = (prefix: string, words: CurriculumItem[]) => Array.from(
    { length: Math.ceil(words.length / 4) },
    (_, groupIndex) => {
      const group = words.slice(groupIndex * 4, groupIndex * 4 + 4);
      return informationExercise(
        `${prefix}-${groupIndex + 1}`,
        'vocabulary',
        group.map((item) => `${item.title} · ${item.meaning ?? 'See the meaning in context.'}`).join('\n'),
        group[0]?.id,
      );
    },
  );
  const verb = '食べる';
  const forms = lesson.verbForms.length ? lesson.verbForms : ['dictionary' as const];
  const narrative = lessonNarrative(lesson, lookup);
  const { reading, listening } = narrative;
  const activities: LessonActivityDefinition[] = [];
  const add = (type: LessonActivityDefinition['type'], title: string, instruction: string, minutes: number, exercises: LessonActivityExercise[], refs: string[] = [], required = true) => activities.push(activity(lesson.id, activities.length + 1, type, title, instruction, minutes, exercises, refs, required));
  if (lesson.contentLevel === 'N5' && lesson.number === 1) {
    add('dialogue', 'Meet Aya', 'Today you will learn one polite greeting and use it in a short introduction. Listen once, then choose its meaning.', 1, [selectExercise('first-greeting', 'vocabulary', 'Aya says 「おはようございます」. What does it mean?', 'Good morning.', ['Good evening.', 'Thank you.', 'Nice to meet you.'], lesson.vocabularyIds[0], 'おはようございます is the polite morning greeting.', 'おはようございます。')], lesson.vocabularyIds.slice(0, 1));
    add('vocabulary_intro', 'Hear the greeting again', 'Aya says おはようございます. Use this polite greeting in the morning.', 1, [informationExercise('meet-aya', 'vocabulary', 'Aya says: おはようございます。\n\nMeaning: Good morning.', lesson.vocabularyIds[0], 'おはようございます。')], lesson.vocabularyIds.slice(0, 1));
    add('introduction', 'What happens next', 'You will hear words in context, notice a sentence pattern, practise with support, then use it yourself.', 1, [informationExercise('lesson-map', 'production', `By the end, you can: ${lesson.objectives.join(' · ')}.`)]);
  } else {
    add('introduction', 'Today’s goal', `By the end, you will be able to ${lesson.communicationGoal.charAt(0).toLowerCase()}${lesson.communicationGoal.slice(1)}`, 1, [informationExercise('opening', 'production', `Practical outcome: ${lesson.objectives.join(' · ')}`)]);
    add('story', 'Situation', 'Read today’s specific everyday situation before you practise the language.', 2, [informationExercise('story', 'reading', narrative.situation, undefined, reading)]);
    add('dialogue', 'First dialogue exposure', 'Listen once for the situation. Notice what the speakers need to confirm; you will use this context after the key words are introduced.', 3, [acknowledgementExercise('dialogue-global', 'listening', 'Listen for the overall situation. You do not need to answer yet.', lesson.listeningIds[0], listening)], lesson.listeningIds);
  }
  const batchOne = vocabulary.slice(0, Math.ceil(vocabulary.length / 2));
  const batchTwo = vocabulary.slice(batchOne.length);
  add('vocabulary_intro', 'Vocabulary batch one', 'Preview four new words at a time before using them in the conversation.', 4, vocabularyPreviewExercises('vocab-one', batchOne), batchOne.map((item) => item.id));
  add('dialogue', 'Words in a real line', 'Listen to a line from today’s situation. Notice how two words work together in a real exchange.', 2, [informationExercise('vocab-model', 'vocabulary', `${batchOne[0]?.title ?? '日本語'} is used naturally in today’s situation.`, batchOne[0]?.id, narrative.vocabularyModel)], batchOne.slice(0, 1).map((item) => item.id));
  add('vocabulary_intro', 'Notice the word again', 'Hear the key word once more, then keep it in mind for the recognition practice.', 1, [informationExercise('vocab-hear', 'vocabulary', `Listen for: ${batchOne[0]?.title ?? '日本語'} — ${batchOne[0]?.meaning ?? 'a word from today’s lesson'}.`, batchOne[0]?.id, batchOne[0]?.title)], batchOne.slice(0, 1).map((item) => item.id));
  add('vocabulary_practice', 'Vocabulary recognition', 'Choose between close words from the same lesson topic.', 4, batchOne.slice(0, 6).map((item, index) => selectExercise(`vocab-recognition-${index + 1}`, 'vocabulary', `What does ${item.title} mean?`, item.meaning ?? item.title, vocabularyMeaningDistractors(item), item.id)), batchOne.map((item) => item.id));
  add('vocabulary_practice', 'Vocabulary recall', 'Type the Japanese word. Kana or the canonical written form is accepted.', 4, batchOne.slice(0, 6).map((item, index) => typedExercise(`vocab-recall-${index + 1}`, 'vocabulary', `Write Japanese for: ${item.meaning ?? item.title}`, [item.title, item.reading ?? item.title], item.id, undefined, undefined, undefined, vocabularyDistractors(item.id))), batchOne.map((item) => item.id));
  add('vocabulary_intro', 'Vocabulary batch two', 'Preview the next four words, then reuse both groups in context.', 4, vocabularyPreviewExercises('vocab-two', batchTwo), batchTwo.map((item) => item.id));
  add('vocabulary_practice', 'Vocabulary in context', 'Choose or type the word that completes a practical situation.', 3, vocabulary.slice(0, 3).map((item, index) => typedExercise(`vocab-context-${index + 1}`, 'vocabulary', `Complete the situation with: ${item.meaning ?? item.title}`, [item.title, item.reading ?? item.title], item.id, undefined, undefined, undefined, vocabularyDistractors(item.id))), lesson.vocabularyIds.slice(0, 6));
  add('grammar_explanation', `Pattern one: ${grammar[0] ?? 'Core pattern'}`, 'Start with meaning, then notice the changing form. The technical label can wait until the pattern feels familiar.', 3, [informationExercise('grammar-one', 'grammar', `Situation: Aya is introducing herself.\n\nModel: わたしはアヤです。\n\nUse ${grammar[0] ?? 'this pattern'} when the situation calls for it.`, lesson.grammarIds[0], 'わたしはアヤです。')], lesson.grammarIds.slice(0, 1));
  add('substitution_drill', 'Build a sentence from a model', 'Use the model to see the sentence pattern. Then make only the changes listed in the cue.', 4, [
    typedExercise('substitution-1', 'grammar', 'Model: 田中さんは本を読んでいます。\n\nChange the topic to 先生 and the object to 新聞. Keep 読んでいます.\n\nWhich complete sentence is correct?', ['先生は新聞を読んでいます'], lesson.grammarIds[0], 'The topic is 先生, the object is 新聞, and the verb stays 読んでいます.'),
    typedExercise('substitution-2', 'grammar', 'Use the same pattern.\n\nTopic: 母\nAction: テレビを見る\n\nWhich complete sentence says that Mother is watching television?', ['母はテレビを見ています'], lesson.grammarIds[0], 'Use 母 as the topic, then change 見る to 見ています.'),
    typedExercise('substitution-3', 'grammar', 'Use the same pattern.\n\nTopic: 友だち\nAction: コーヒーを飲む\n\nWhich complete sentence says that a friend is drinking coffee?', ['友だちはコーヒーを飲んでいます'], lesson.grammarIds[0], 'Use 友だち as the topic, then change 飲む to 飲んでいます.'),
  ], lesson.grammarIds.slice(0, 1));
  const transformations = ['dictionary-to-masu', 'dictionary-to-te', 'affirmative-to-negative'] as const;
  add('sentence_transformation', 'Change one form at a time', 'Read the requested form first. Only the verb form changes; the meaning stays the same.', 4, transformations.map((kind, index) => { const transformation = createTransformation(kind, kind === 'affirmative-to-negative' ? '食べます' : '食べる', verb); return typedExercise(`transform-one-${index + 1}`, 'conjugation', `${transformation.instruction}\n\nWord to change: ${transformation.source}`, transformation.expectedAnswers, lesson.grammarIds[0], transformation.instruction); }), lesson.grammarIds.slice(0, 1));
  add('grammar_explanation', `Pattern two: ${grammar[1] ?? grammar[0] ?? 'Second pattern'}`, 'Compare the new meaning with the first model, then use the form in a controlled sentence.', 3, [informationExercise('grammar-two', 'grammar', `Situation: Aya answers politely.\n\nModel: はい、学生です。\n\nNotice how ${grammar[1] ?? grammar[0] ?? 'this pattern'} makes the response fit the situation.`, lesson.grammarIds[1] ?? lesson.grammarIds[0], 'はい、学生です。')], lesson.grammarIds.slice(1, 2));
  add('substitution_drill', 'Controlled grammar drill', 'Use the pattern in a complete response. Read the situation first; do not just name the grammar point.', 4, [
    typedExercise('controlled-1', 'grammar', 'A classmate asks: 「これは何ですか。」\nAnswer: “It is a book.”\n\nType the complete polite sentence.', ['これは本です'], lesson.grammarIds[1] ?? lesson.grammarIds[0], 'Use です to make a polite identity sentence.'),
    typedExercise('controlled-2', 'grammar', 'Introduce yourself to Aya.\n\nType: “I am a student.” in polite Japanese.', ['わたしは学生です', '私は学生です'], lesson.grammarIds[1] ?? lesson.grammarIds[0], 'The topic comes first, followed by the polite identity form.'),
    typedExercise('controlled-3', 'grammar', 'Aya points to a book.\n\nReply with a complete sentence: “This is a book.”', ['これは本です'], lesson.grammarIds[1] ?? lesson.grammarIds[0], 'Use the model sentence rather than a single noun.'),
  ], lesson.grammarIds.slice(0, 2));
  const connectionTransformations = ['combine-te-kara', 'present-to-past', 'masu-to-dictionary'] as const;
  add('sentence_transformation', 'Transform and connect', 'Change the form or combine two short sentences while keeping the meaning.', 4, connectionTransformations.map((kind, index) => { const transformation = createTransformation(kind, kind === 'combine-te-kara' ? '' : '食べます', verb); return typedExercise(`transform-two-${index + 1}`, 'conjugation', `${transformation.instruction} ${transformation.source}`, transformation.expectedAnswers, lesson.grammarIds[0]); }), lesson.grammarIds.slice(0, 2));
  const teFormMastery = lesson.contentLevel === 'N5' && lesson.number === 24;
  const conjugationCount = teFormMastery ? 32 : lesson.verbForms.includes('te') ? 4 : 3;
  add('conjugation_drill', teFormMastery ? 'て-form mastery drill' : 'Verb and form drill', teFormMastery ? 'Work through one verb at a time. First identify the final sound, then apply the rule. This is an intentional high-volume drill.' : 'Change one verb form at a time. Type only the changed verb, then use it in the next sentence.', teFormMastery ? 18 : 4, Array.from({ length: conjugationCount }, (_, index) => { const form = forms[index % forms.length] ?? 'dictionary'; const answer = conjugateVerb(verb, form) ?? verb; return typedExercise(`conjugation-${index + 1}`, 'conjugation', `Rewrite 食べる in the ${form.replaceAll('_', ' ')} form.\n\nType only the changed verb.`, [answer], lesson.grammarIds[0], `食べる changes to ${answer}.`); }), lesson.grammarIds.slice(0, 1));
  if (teFormMastery) add('sentence_ordering', 'て-form application workshop', 'Put the parts in a natural order, then use the same pattern in your own speech.', 8, Array.from({ length: 4 }, (_, index) => typedExercise(`te-application-${index + 1}`, 'grammar', index % 2 === 0 ? 'Put in order: ご飯を / 食べてから / 学校へ行きます' : 'Complete: ドアを開けて、部屋に___。', index % 2 === 0 ? ['ご飯を食べてから学校へ行きます', 'ご飯を食べてから、学校へ行きます'] : ['入ります'], lesson.grammarIds[0])), lesson.grammarIds.slice(0, 1));
  if (lesson.adjectiveForms.length) add('conjugation_drill', 'Adjective and noun conjugation', 'Change adjectives and nouns with the copula. Use the form that matches the time and polarity.', 5, lesson.adjectiveForms.map((form, index) => {
    const nounForm = form === 'noun_past' || form === 'noun_past_negative';
    const answer = nounForm ? conjugateNounForm('学生', form) : conjugateAdjectiveForm(form.startsWith('i_') ? '高い' : '静か', form) ?? '静かです';
    const source = nounForm ? '学生です' : form.startsWith('i_') ? '高いです' : '静かです';
    return typedExercise(`adjective-${index + 1}`, 'conjugation', `Rewrite ${source} as ${form.replaceAll('_', ' ')}.`, [answer], lesson.grammarIds[0]);
  }), lesson.grammarIds.slice(0, 1));
  add('kanji_intro', 'Kanji in context', 'Read each character in a word from today’s lesson. The reading shown is the one used in that word, not a list of every possible reading.', 3, kanji.map((item, index) => {
    const word = wordForKanji(item);
    return informationExercise(`kanji-intro-${index + 1}`, 'kanji', `Word meaning: ${word?.meaning ?? item.meaning ?? 'See the linked word.'}`, item.id, word?.title ?? item.title);
  }), kanji.map((item) => item.id));
  add('kanji_practice', 'Kanji reading in words', 'Choose the reading used in the familiar lesson word.', 3, kanji.slice(0, 2).map((item, index) => {
    const word = wordForKanji(item);
    return typedExercise(`kanji-practice-${index + 1}`, 'kanji', `Read ${word?.title ?? item.title} in this word.`, [word?.reading ?? item.reading ?? item.title], item.id, 'Use the reading of the whole word.', word?.title ?? item.title, undefined, kanjiReadingDistractors(item.id));
  }), kanji.slice(0, 2).map((item) => item.id));
  add('dialogue', 'Dialogue replay and breakdown', 'Replay one line at a time. Notice how the target patterns make the exchange work.', 3, [informationExercise('dialogue-replay', 'listening', 'Shadow the line after listening.', lesson.listeningIds[0], undefined)], lesson.listeningIds);
  add('reading', 'Reading passage', 'Read once without translation. Open the help only after making a first attempt.', 4, [informationExercise('reading-passage', 'reading', 'Read the passage and identify the main situation.', lesson.readingIds[0], reading)], lesson.readingIds);
  add('reading', 'Reading comprehension', 'Answer a main-idea and a detail question. The passage stays directly above each question so you can check it while you answer.', 3, [
    { ...selectExercise('reading-main', 'reading', narrative.readingMainPrompt, narrative.readingMainAnswer, narrative.readingMainDistractors, lesson.readingIds[0]), readingText: reading },
    { ...selectExercise('reading-detail', 'reading', narrative.readingDetailPrompt, narrative.readingDetailAnswer, narrative.readingDetailDistractors, lesson.readingIds[0]), readingText: reading },
  ], lesson.readingIds);
  add('timed_reading', 'Timed reading', 'Read for meaning at a steady pace. Speed matters only when comprehension remains sound.', 2, [informationExercise('timed-reading', 'reading', 'Start the timer, read the passage, and continue when you understand the main idea.', lesson.readingIds[0], reading)], lesson.readingIds);
  add('listening', 'Listen for the clarification phrase', 'Listen once without reading the transcript. Then identify how the speaker asks for help.', 3, [selectExercise('listening-global', 'listening', narrative.listeningGlobalPrompt, narrative.listeningGlobalAnswer, narrative.listeningGlobalDistractors, lesson.listeningIds[0], undefined, listening)], lesson.listeningIds);
  add('listening', 'Listen for the first action', 'Replay the dialogue and identify the practical first step the speakers agree on.', 3, [selectExercise('listening-detail', 'listening', narrative.listeningDetailPrompt, narrative.listeningDetailAnswer, narrative.listeningDetailDistractors, lesson.listeningIds[0], undefined, listening)], lesson.listeningIds);
  add('dictation', 'Recognise a phrase you heard', 'Listen to the phrase, then choose its Japanese wording.', 3, [typedExercise('dictation', 'listening', narrative.dictationPrompt, [narrative.heardPhrase], lesson.listeningIds[0], undefined, undefined, listening)], lesson.listeningIds);
  add('shadowing', 'Transcript review and shadowing', 'Reveal the transcript, replay a line, and repeat at a comfortable pace.', 2, [informationExercise('shadowing', 'listening', 'Optional speaking practice: shadow one line before continuing.', lesson.listeningIds[0], listening)], lesson.listeningIds, false);
  add('sentence_production', 'Your own sentence', 'Optional: write one short sentence about your own life using today’s pattern. Many answers can be valid.', 3, [typedExercise('production', 'production', `Optional challenge: write an original sentence using ${grammar[0] ?? 'today’s pattern'}.`, grammar[0] ? [grammar[0]] : ['です'], lesson.grammarIds[0], 'Use the pattern; offline you may self-confirm a different valid sentence.')], lesson.grammarIds.slice(0, 1));
  add('error_correction', 'Find and correct the mistake', 'Correct the form, then read the explanation.', 3, [typedExercise('error-one', 'grammar', 'Correct: わたしは学生だです。', ['わたしは学生です'], lesson.grammarIds[0], 'Use either だ or です, not both.'), typedExercise('error-two', 'conjugation', 'Correct: 食べるます。', ['食べます'], lesson.grammarIds[0], 'Attach ます to the verb stem.')], lesson.grammarIds.slice(0, 1));
  add('mixed_practice', 'Mixed lesson practice', 'Switch between recognition, recall, and a complete sentence. This prepares you for the checkpoint without repeating one exercise shape.', 4, [
    typedExercise('mixed-1', 'vocabulary', `Translate into Japanese: ${vocabulary[0]?.meaning ?? 'today’s first word'}.`, [vocabulary[0]?.title ?? '日本語', vocabulary[0]?.reading ?? '日本語'], vocabulary[0]?.id, undefined, undefined, undefined, vocabularyDistractors(vocabulary[0]?.id)),
    typedExercise('mixed-2', 'grammar', 'A classmate asks: 「これは何ですか。」\n\nReply in a complete polite sentence.', ['これは本です'], lesson.grammarIds[0], 'A complete answer uses the topic and です.'),
    typedExercise('mixed-3', 'vocabulary', `Translate into Japanese: ${vocabulary[1]?.meaning ?? 'today’s second word'}.`, [vocabulary[1]?.title ?? '日本語', vocabulary[1]?.reading ?? '日本語'], vocabulary[1]?.id, undefined, undefined, undefined, vocabularyDistractors(vocabulary[1]?.id)),
    typedExercise('mixed-4', 'grammar', 'Look at a book near you.\n\nSay “This is a book” in Japanese.', ['これは本です'], lesson.grammarIds[0], 'Use the complete sentence you have practised.'),
  ], [...lesson.vocabularyIds.slice(0, 2), ...lesson.grammarIds.slice(0, 1)]);
  const checkpointExercises: LessonActivityExercise[] = Array.from({ length: 20 }, (_, index) => {
    if (index < 6) { const item = vocabulary[index % Math.max(vocabulary.length, 1)]; return typedExercise(`checkpoint-vocab-${index + 1}`, 'vocabulary', `Write Japanese for: ${item?.meaning ?? 'today’s word'}`, [item?.title ?? '日本語', item?.reading ?? '日本語'], item?.id, undefined, undefined, undefined, vocabularyDistractors(item?.id)); }
    if (index < 11) { const transformation = createTransformation((['dictionary-to-masu', 'dictionary-to-te', 'affirmative-to-negative', 'present-to-past', 'combine-te-kara'] as const)[index - 6] ?? 'dictionary-to-masu', index === 10 ? '' : '食べる', verb); return typedExercise(`checkpoint-form-${index + 1}`, 'conjugation', `${transformation.instruction} ${transformation.source}`, transformation.expectedAnswers, lesson.grammarIds[0]); }
    if (index < 14) { const item = kanji[(index - 11) % Math.max(kanji.length, 1)]; const word = item ? wordForKanji(item) : undefined; return typedExercise(`checkpoint-kanji-${index + 1}`, 'kanji', `Read ${word?.title ?? item?.title ?? '日'} in this word.`, [word?.reading ?? item?.reading ?? 'にち'], item?.id, undefined, word?.title, undefined, kanjiReadingDistractors(item?.id)); }
    if (index === 14) return selectExercise(`checkpoint-reading-${index + 1}`, 'reading', narrative.readingMainPrompt, narrative.readingMainAnswer, narrative.readingMainDistractors, lesson.readingIds[0]);
    if (index === 15) return selectExercise(`checkpoint-reading-${index + 1}`, 'reading', narrative.readingDetailPrompt, narrative.readingDetailAnswer, narrative.readingDetailDistractors, lesson.readingIds[0]);
    if (index === 16) return selectExercise(`checkpoint-reading-${index + 1}`, 'reading', 'Which detail should you check in the passage before you act?', narrative.readingMainAnswer, ['The colour of a restaurant menu.', 'A new job application.', 'A train ticket bought yesterday.'], lesson.readingIds[0]);
    if (index === 17) return selectExercise(`checkpoint-listening-${index + 1}`, 'listening', narrative.listeningGlobalPrompt, narrative.listeningGlobalAnswer, narrative.listeningGlobalDistractors, lesson.listeningIds[0]);
    if (index === 18) return selectExercise(`checkpoint-listening-${index + 1}`, 'listening', narrative.listeningDetailPrompt, narrative.listeningDetailAnswer, narrative.listeningDetailDistractors, lesson.listeningIds[0]);
    return typedExercise(`checkpoint-listening-${index + 1}`, 'listening', narrative.dictationPrompt, [narrative.heardPhrase], lesson.listeningIds[0], undefined, undefined, listening);
  });
  add('checkpoint', 'Lesson checkpoint', 'Complete the mixed chapter check. Your weak items will enter the existing review systems.', 12, checkpointExercises, [...lesson.vocabularyIds, ...lesson.grammarIds, ...lesson.kanjiIds, ...lesson.readingIds, ...lesson.listeningIds]);
  add('reflection', 'Lesson reflection', 'Optional: name one skill you will revisit in Review or the Study Library.', 2, [typedExercise('reflection', 'production', `Optional challenge: you can now ${lesson.objectives.join(' · ')}. Write one skill you will revisit in Review or the Study Library.`, [])], [], false);
  return arrangeActivitiesForExperience(lesson, activities);
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
    experience: lessonExperienceFor({ contentLevel: options.level, number: index + 1, title: blueprint.title }),
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
      experience: lessonExperienceFor(completed),
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
      experience: lessonExperienceFor({ contentLevel: 'N5', number: index + 1, title: blueprint.title }),
      activities: [],
      depthException: 'focused-workshop' as const,
      depthExceptionReason: 'Foundations chapters deliberately focus on kana and a small reusable set of first expressions.',
    } satisfies Omit<CourseLessonDefinition, 'sections'>;
    const lesson: CourseLessonDefinition = {
      ...base,
      patternObjectives: patternObjectivesFor(base, itemLookup),
      verbForms: verbFormsFor(base),
    adjectiveForms: adjectiveFormsFor(base),
      experience: lessonExperienceFor(base),
      sections: [],
    };
    const withActivities = { ...lesson, activities: standardActivities(lesson, itemLookup) };
    return { ...withActivities, sections: sectionBlueprint(withActivities) };
  });
  void items;
  return { id: 'foundations', level: 'foundations', title: 'Japanese Foundations', description: 'Build kana, sound, and sentence confidence before the main N5 course.', manifestVersion: 3, units: [{ id: 'foundations-unit-1', order: 1, title: 'First steps in Japanese', goal: 'Read a little kana and use your first practical sentences.', lessons }] };
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
    manifestVersion: 3,
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
    experience: lessonExperienceFor({ contentLevel, number: order, title: kind === 'workshop' ? `${blueprint.title} workshop` : blueprint.title, kind }),
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
      manifestVersion: 3,
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
      manifestVersion: 3,
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
        issues.push(...validateLessonExperience(lesson));
      }
    }
    issues.push(...validateLessonTemplateDistribution(lessons));
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
