import type {
  AssistanceMode,
  SelfReportedLevel,
  V3AssessmentAnswer,
  V3AssessmentQuestion,
  V3AssessmentResult,
} from '@/types/lesson-v3';

export const v3AssessmentQuestions: V3AssessmentQuestion[] = [
  {
    id: 'v3-assessment-kana-a', category: 'kana', difficulty: 'beginner', label: 'KANA',
    prompt: 'Which sound does あ represent?',
    options: [{ id: 'a', label: 'a' }, { id: 'i', label: 'i' }, { id: 'u', label: 'u' }, { id: 'e', label: 'e' }],
    correctOptionId: 'a', explanation: 'あ is the hiragana for the sound “a”.',
  },
  {
    id: 'v3-assessment-kana-me', category: 'kana', difficulty: 'beginner', label: 'KANA',
    prompt: 'What is the reading of メ?',
    options: [{ id: 'nu', label: 'nu' }, { id: 'me', label: 'me' }, { id: 'ne', label: 'ne' }, { id: 'no', label: 'no' }],
    correctOptionId: 'me', explanation: 'メ is the katakana for “me”.',
  },
  {
    id: 'v3-assessment-vocab', category: 'vocabulary', difficulty: 'N5', label: 'A QUICK WORD',
    prompt: 'What does 友達 mean?',
    options: [{ id: 'friend', label: 'friend' }, { id: 'teacher', label: 'teacher' }, { id: 'family', label: 'family' }, { id: 'station', label: 'station' }],
    correctOptionId: 'friend', explanation: '友達（ともだち）means “friend”.',
  },
  {
    id: 'v3-assessment-kanji', category: 'kanji', difficulty: 'N5', label: 'KANJI IN CONTEXT',
    prompt: 'What is 駅 in 「駅で会います」?',
    options: [{ id: 'station', label: 'station' }, { id: 'school', label: 'school' }, { id: 'shop', label: 'shop' }, { id: 'home', label: 'home' }],
    correctOptionId: 'station', explanation: '駅（えき）means “station”. 駅で会います means “meet at the station”.',
  },
  {
    id: 'v3-assessment-particle', category: 'grammar', difficulty: 'N5', label: 'NATURAL JAPANESE',
    prompt: '日本 ___ 昨日着きました。',
    options: [{ id: 'ni', label: 'に' }, { id: 'ga', label: 'が' }, { id: 'wo', label: 'を' }, { id: 'de', label: 'で' }],
    correctOptionId: 'ni', explanation: '着く takes the destination with に: 日本に着きました。',
  },
  {
    id: 'v3-assessment-dialogue', category: 'reading', difficulty: 'N5', label: 'SHORT MESSAGE',
    passage: 'A: 日本にはもう着いた？\nB: うん、昨日着いたよ！',
    prompt: 'What did B say?',
    options: [{ id: 'arrived', label: 'I arrived yesterday.' }, { id: 'tomorrow', label: 'I will arrive tomorrow.' }, { id: 'not-yet', label: 'I have not arrived yet.' }],
    correctOptionId: 'arrived', explanation: '昨日着いた means “arrived yesterday”.',
  },
  {
    id: 'v3-assessment-kara', category: 'grammar', difficulty: 'N5', label: 'CONNECT THE IDEA',
    prompt: '雨です ___、傘を持っていきます。',
    options: [{ id: 'kara', label: 'から' }, { id: 'made', label: 'まで' }, { id: 'demo', label: 'でも' }, { id: 'yori', label: 'より' }],
    correctOptionId: 'kara', explanation: 'から gives the reason: “Because it is raining, I will take an umbrella.”',
  },
  {
    id: 'v3-assessment-youni', category: 'grammar', difficulty: 'N4', label: 'A LITTLE HARDER',
    prompt: '毎日練習して、ひらがなが速く読める ___。',
    options: [{ id: 'you', label: 'ようになりました' }, { id: 'sou', label: 'そうでした' }, { id: 'tokoro', label: 'ところでした' }, { id: 'hazudatta', label: 'はずでした' }],
    correctOptionId: 'you', explanation: '～ようになりました describes a change in ability: “I became able to read hiragana quickly.”',
  },
  {
    id: 'v3-assessment-reading-n4', category: 'reading', difficulty: 'N4', label: 'READ THE SITUATION',
    passage: 'ゆきへ\n雨なのに来てくれてありがとう。駅の東口で待ってるね。',
    prompt: 'Where is the writer waiting?',
    options: [{ id: 'east', label: 'At the east exit' }, { id: 'west', label: 'At the west exit' }, { id: 'cafe', label: 'At a café' }, { id: 'home', label: 'At home' }],
    correctOptionId: 'east', explanation: '駅の東口 means “the station’s east exit”.',
  },
];

function correctIn(categories: V3AssessmentQuestion['category'][], answers: V3AssessmentAnswer[]): number {
  const ids = new Set(v3AssessmentQuestions.filter((question) => categories.includes(question.category)).map((question) => question.id));
  return answers.filter((answer) => ids.has(answer.questionId) && answer.correct).length;
}

function questionCountIn(categories: V3AssessmentQuestion['category'][]): number {
  return v3AssessmentQuestions.filter((question) => categories.includes(question.category)).length;
}

export function assistanceFromStartingPoint(score: number, selfReportedLevel?: SelfReportedLevel): AssistanceMode {
  if (score >= 7 && selfReportedLevel !== 'completely-new') return 'independent';
  if (score >= 4 && !['completely-new', 'not-sure'].includes(selfReportedLevel ?? 'not-sure')) return 'supported';
  return 'guided';
}

export function scoreV3Assessment(
  answers: V3AssessmentAnswer[],
  selfReportedLevel?: SelfReportedLevel,
): V3AssessmentResult {
  const correctCount = answers.filter((answer) => answer.correct).length;
  const kanaCorrect = correctIn(['kana'], answers);
  const kanjiCorrect = correctIn(['kanji'], answers);
  const grammarCorrect = correctIn(['grammar'], answers);
  const readingCorrect = correctIn(['reading'], answers);
  const n4Correct = answers.filter((answer) => answer.correct && v3AssessmentQuestions.find((question) => question.id === answer.questionId)?.difficulty === 'N4').length;
  const startingLevel = correctCount <= 3 ? 'Beginner' : correctCount <= 6 || n4Correct === 0 ? 'Around N5' : 'Around N4';

  return {
    startingLevel,
    assistanceMode: assistanceFromStartingPoint(correctCount, selfReportedLevel),
    correctCount,
    questionCount: v3AssessmentQuestions.length,
    kana: kanaCorrect === questionCountIn(['kana']) ? 'Comfortable' : 'Developing',
    kanji: kanjiCorrect === 1 ? 'Developing' : 'Just starting',
    grammar: grammarCorrect <= 1 ? 'Foundations developing' : grammarCorrect === 2 ? 'N5 foundations' : 'N5 strong / early N4',
    reading: readingCorrect === 0 ? 'Just starting' : readingCorrect === questionCountIn(['reading']) ? 'Comfortable' : 'Developing',
  };
}
