import type { StructuredJapaneseText } from '@/types/lessons-v2';
import type { V3Episode, V3JapaneseLine } from '@/types/lesson-v3';

type Segment = string | { surface: string; reading: string; itemId: string; kanjiIds?: string[] };

function japanese(...segments: Segment[]): StructuredJapaneseText {
  const raw = segments.map((segment) => typeof segment === 'string' ? segment : segment.surface).join('');
  return {
    raw,
    status: 'verified',
    tokens: segments.map((segment, index) => typeof segment === 'string'
      ? { id: `plain-${index}-${raw.length}`, kind: 'plain' as const, surface: segment, kanjiIds: [], status: 'verified' as const }
      : {
          id: `${segment.itemId}-${index}`,
          kind: 'word' as const,
          surface: segment.surface,
          reading: segment.reading,
          vocabularyId: segment.itemId,
          kanjiIds: segment.kanjiIds ?? [],
          status: 'verified' as const,
        }),
  };
}

function line(text: StructuredJapaneseText, englishHelp?: string): V3JapaneseLine {
  return { text, englishHelp };
}

const renrakusaki = { surface: '連絡先', reading: 'れんらくさき', itemId: 'v3-vocab-renrakusaki' };
const kiku = { surface: '聞きました', reading: 'ききました', itemId: 'v3-vocab-kiku' };
const nihon = { surface: '日本', reading: 'にほん', itemId: 'v3-vocab-nihon' };
const tsuku = { surface: '着いた', reading: 'ついた', itemId: 'v3-vocab-tsuku' };
const tsukuPlain = { surface: '着く', reading: 'つく', itemId: 'v3-vocab-tsuku' };
const mou = { surface: 'もう', reading: 'もう', itemId: 'v3-expression-mou' };
const mada = { surface: 'まだ', reading: 'まだ', itemId: 'v3-expression-mada' };
const kinou = { surface: '昨日', reading: 'きのう', itemId: 'v3-vocab-kinou' };
const ashita = { surface: '明日', reading: 'あした', itemId: 'v3-vocab-ashita' };
const tomodachi = { surface: '友達', reading: 'ともだち', itemId: 'v3-vocab-tomodachi' };
const hima = { surface: 'ひま', reading: 'ひま', itemId: 'v3-vocab-hima' };
const shinjuku = { surface: '新宿駅', reading: 'しんじゅくえき', itemId: 'v3-vocab-shinjukueki' };
const kitabakari = { surface: '来たばかり', reading: 'きたばかり', itemId: 'v3-expression-kitabakari' };
const sukunai = { surface: '少ない', reading: 'すくない', itemId: 'v3-vocab-sukunai' };
const itteta = { surface: '言ってた', reading: 'いってた', itemId: 'v3-vocab-iu' };
const renrakuShitemita = { surface: '連絡してみた', reading: 'れんらくしてみた', itemId: 'v3-vocab-renraku-suru' };
const tsuiteinai = { surface: '着いてない', reading: 'ついてない', itemId: 'v3-vocab-tsuku' };
const juuji = { surface: '10時', reading: 'じゅうじ', itemId: 'v3-vocab-juuji' };
const okurenai = { surface: '遅れない', reading: 'おくれない', itemId: 'v3-vocab-okureru' };
const wara = { surface: '笑', reading: 'わら', itemId: 'v3-expression-wara' };

export const episodeOne: V3Episode = {
  id: 'episode-1',
  arcId: 'new-life-in-japan',
  arcTitleJapanese: '日本での新生活',
  arcTitleEnglish: 'New Life in Japan',
  titleJapanese: '知らないメッセージ',
  titleEnglish: "A Message From Someone You Don't Know",
  estimatedMinutes: 10,
  characters: [
    {
      id: 'yuki',
      nameJapanese: 'ゆき',
      nameEnglish: 'Yuki',
      avatarText: 'ゆ',
      description: 'Friendly, slightly playful, and direct. Yuki messages naturally without excessive slang.',
    },
  ],
  learningObjectives: [
    { id: 'v3-vocab-renrakusaki', kind: 'vocabulary', japanese: '連絡先', reading: 'れんらくさき', meaning: 'contact details' },
    { id: 'v3-vocab-kiku', kind: 'vocabulary', japanese: '聞く', reading: 'きく', meaning: 'to ask; to hear' },
    { id: 'v3-vocab-nihon', kind: 'vocabulary', japanese: '日本', reading: 'にほん', meaning: 'Japan' },
    { id: 'v3-vocab-tsuku', kind: 'vocabulary', japanese: '着く', reading: 'つく', meaning: 'to arrive' },
    { id: 'v3-vocab-kinou', kind: 'vocabulary', japanese: '昨日', reading: 'きのう', meaning: 'yesterday' },
    { id: 'v3-vocab-ashita', kind: 'vocabulary', japanese: '明日', reading: 'あした', meaning: 'tomorrow' },
    { id: 'v3-vocab-tomodachi', kind: 'vocabulary', japanese: '友達', reading: 'ともだち', meaning: 'friend' },
    { id: 'v3-vocab-hima', kind: 'vocabulary', japanese: '暇', reading: 'ひま', meaning: 'free; not busy' },
    { id: 'v3-vocab-shinjukueki', kind: 'vocabulary', japanese: '新宿駅', reading: 'しんじゅくえき', meaning: 'Shinjuku Station' },
    { id: 'v3-expression-kitabakari', kind: 'expression', japanese: '来たばかり', reading: 'きたばかり', meaning: 'have just arrived' },
    { id: 'v3-vocab-sukunai', kind: 'vocabulary', japanese: '少ない', reading: 'すくない', meaning: 'few; not many' },
    { id: 'v3-vocab-iu', kind: 'vocabulary', japanese: '言う', reading: 'いう', meaning: 'to say' },
    { id: 'v3-vocab-renraku-suru', kind: 'vocabulary', japanese: '連絡する', reading: 'れんらくする', meaning: 'to contact' },
    { id: 'v3-vocab-juuji', kind: 'vocabulary', japanese: '10時', reading: 'じゅうじ', meaning: "ten o'clock" },
    { id: 'v3-vocab-okureru', kind: 'vocabulary', japanese: '遅れる', reading: 'おくれる', meaning: 'to be late' },
    { id: 'v3-vocab-ocha', kind: 'vocabulary', japanese: 'お茶', reading: 'おちゃ', meaning: 'tea' },
    { id: 'v3-expression-wara', kind: 'expression', japanese: '笑', reading: 'わら', meaning: 'a casual “haha” in messages' },
    { id: 'v3-expression-mou', kind: 'expression', japanese: 'もう', reading: 'もう', meaning: 'already; yet' },
    { id: 'v3-expression-mada', kind: 'expression', japanese: 'まだ', reading: 'まだ', meaning: 'still; not yet' },
    { id: 'v3-grammar-destination-ni', kind: 'grammar', japanese: '～に着く', reading: '～につく', meaning: 'arrive at/in ~' },
  ],
  scenes: [
    {
      id: 'opening', type: 'story', eyebrow: 'TOKYO · 7:42 PM',
      title: 'Your phone vibrates.',
      body: 'You arrived in Japan yesterday. The room is still full of half-open boxes. A message appears from a number you do not know.',
    },
    {
      id: 'unknown-intro', type: 'chat', learnedItemIds: ['v3-vocab-renrakusaki', 'v3-vocab-kiku'], messages: [
        { id: 'intro-1', sender: 'unknown', line: line(japanese('こんにちは！'), 'Hi!') },
        { id: 'intro-2', sender: 'unknown', line: line(japanese('ミアから', renrakusaki, 'を', kiku, '。'), 'Mia gave me your contact details.') },
        { id: 'intro-3', sender: 'unknown', line: line(japanese('ゆきです！'), "I'm Yuki!") },
      ],
    },
    {
      id: 'meaning-contact', type: 'interaction', interaction: 'meaningCheck',
      prompt: 'Why is Yuki messaging you?',
      context: line(japanese('ミアから', renrakusaki, 'を', kiku, '。')),
      options: [
        { id: 'mia', label: 'Mia gave Yuki your contact details.', correct: true, feedback: 'Exactly. 連絡先 means contact details, and ミアから tells you the information came from Mia.' },
        { id: 'lost-phone', label: 'Yuki found Mia’s lost phone.', correct: false, feedback: '連絡先 is contact information—not a phone itself. Yuki says she heard your contact details from Mia.' },
        { id: 'wrong-person', label: 'Yuki thinks you are Mia.', correct: false, feedback: 'Yuki names Mia as the source with ミアから. She knows she is messaging someone else.' },
      ],
    },
    {
      id: 'arrived-question', type: 'chat', learnedItemIds: ['v3-vocab-tsuku'], messages: [
        { id: 'arrived-1', sender: 'yuki', time: '7:43 PM', line: line(japanese(nihon, 'には', mou, tsuku, '？'), 'Have you arrived in Japan yet?') },
      ],
    },
    {
      id: 'arrived-choice', type: 'interaction', interaction: 'chatChoice',
      prompt: 'You arrived yesterday. Reply to Yuki.',
      options: [
        { id: 'arrived-yesterday', line: line(japanese('うん、', kinou, tsuku, 'よ！'), 'Yeah, I arrived yesterday!'), correct: true, feedback: 'Natural and friendly. に is understood from Yuki’s question, so it can be omitted in your reply.' },
        { id: 'arrive-tomorrow', line: line(japanese(mada, '。', ashita, tsukuPlain, 'よ。'), 'Not yet. I’ll arrive tomorrow.'), correct: false, feedback: 'This is natural Japanese, but it changes the story: you are already in Japan.' },
        { id: 'japan-subject', line: line(japanese('うん、', nihon, 'が', tsuku, 'よ。')), correct: false, feedback: '着く marks the destination with に, not が. Say 日本に着いた. In this reply, just 昨日着いたよ is most natural.' },
      ],
    },
    {
      id: 'discovery-mou-mada', type: 'teachingMoment', title: 'A useful contrast',
      contrast: [
        line(japanese(mou, tsuku, '？'), 'Have you arrived already / yet?'),
        line(japanese(mada, tsuiteinai, '。'), 'I have not arrived yet.'),
      ],
      explanation: 'もう asks whether something has happened by now. まだ says the situation has not changed yet. You will hear this pair constantly.',
      learnedItemIds: ['v3-expression-mou', 'v3-expression-mada', 'v3-vocab-tsuku'],
    },
    {
      id: 'mia-context', type: 'chat', messages: [
        { id: 'mia-1', sender: 'yuki', line: line(japanese('ほんと？よかった！'), 'Really? Great!') },
        { id: 'mia-2', sender: 'yuki', line: line(japanese('ミアが「', nihon, 'に', kitabakari, 'で、', mada, tomodachi, 'が', sukunai, '」って', itteta, 'から、', renrakuShitemita, '😊'), 'Mia said you just arrived in Japan and do not have many friends yet, so I thought I would message you.') },
        { id: 'mia-3', sender: 'yuki', line: line(japanese('これからよろしくね！'), "Let's get along from here on!") },
      ],
    },
    {
      id: 'build-reply', type: 'sentenceBuild',
      prompt: 'Build a warm, natural reply.',
      parts: [{ id: 'kochira', text: 'こちらこそ、' }, { id: 'yoroshiku', text: 'よろしく！' }],
      correctOrder: ['kochira', 'yoroshiku'],
      answer: line(japanese('こちらこそ、よろしく！'), 'Likewise—nice to meet you!'),
      explanation: 'こちらこそ means “likewise” and answers Yuki’s よろしく naturally.',
    },
    {
      id: 'invitation', type: 'chat', learnedItemIds: ['v3-vocab-ashita', 'v3-vocab-hima'], messages: [
        { id: 'invite-1', sender: 'yuki', line: line(japanese(ashita, hima, '？'), 'Are you free tomorrow?') },
      ],
    },
    {
      id: 'free-reply', type: 'freeResponse', intent: 'episode-one-availability',
      prompt: 'Reply naturally. Tell Yuki when you are free, if you are working, or suggest something to do.',
      message: { id: 'free-prompt', sender: 'yuki', line: line(japanese(ashita, hima, '？')) },
      suggestedStarters: ['うん、ひまだよ！', '午後ならひまだよ。', '明日は仕事がある。'],
    },
    {
      id: 'meeting-place', type: 'chat', messages: [
        { id: 'meet-1', sender: 'yuki', line: line(japanese('やった！じゃあ、', ashita, juuji, 'に', shinjuku, 'で！'), 'Great! Then tomorrow at 10 at Shinjuku Station!') },
        { id: 'meet-2', sender: 'yuki', line: line(japanese(okurenai, 'でね', wara), "Don't be late, okay? haha") },
      ],
    },
    { id: 'complete', type: 'completion' },
  ],
  nextEpisode: {
    titleJapanese: '新宿で会おう',
    titleEnglish: "Let's Meet in Shinjuku",
    setup: "You and Yuki have made plans to meet at Shinjuku Station.",
    hook: 'But getting there might not go exactly as planned.',
  },
};

export const v3Episodes: Record<string, V3Episode> = { [episodeOne.id]: episodeOne };
