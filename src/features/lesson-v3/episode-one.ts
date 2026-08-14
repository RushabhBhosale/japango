import type { V3Episode, V3JapaneseLine, V3JapaneseText } from '@/types/lesson-v3';

type Segment = string | { surface: string; reading: string; itemId: string; kanjiIds?: string[] };

function japanese(...segments: Segment[]): V3JapaneseText {
  const raw = segments.map((segment) => typeof segment === 'string' ? segment : segment.surface).join('');
  return {
    raw,
    tokens: segments.map((segment, index) => typeof segment === 'string'
      ? { id: `plain-${index}-${raw.length}`, kind: 'plain' as const, surface: segment, kanjiIds: [] }
      : {
          id: `${segment.itemId}-${index}`,
          kind: 'word' as const,
          surface: segment.surface,
          reading: segment.reading,
          vocabularyId: segment.itemId,
          kanjiIds: segment.kanjiIds ?? [],
        }),
  };
}

function line(text: V3JapaneseText, englishHelp?: string): V3JapaneseLine {
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
const yotei = { surface: '予定', reading: 'よてい', itemId: 'v3-vocab-yotei' };
const shinjuku = { surface: '新宿', reading: 'しんじゅく', itemId: 'v3-vocab-shinjuku' };
const eki = { surface: '駅', reading: 'えき', itemId: 'v3-vocab-eki' };
const kitabakari = { surface: '来たばかり', reading: 'きたばかり', itemId: 'v3-expression-kitabakari' };
const sukunai = { surface: '少ない', reading: 'すくない', itemId: 'v3-vocab-sukunai' };
const itteta = { surface: '言ってた', reading: 'いってた', itemId: 'v3-vocab-iu' };
const renrakuShitemita = { surface: '連絡してみた', reading: 'れんらくしてみた', itemId: 'v3-vocab-renraku-suru' };
const renrakuShita = { surface: '連絡した', reading: 'れんらくした', itemId: 'v3-vocab-renraku-suru' };
const tsuiteinai = { surface: '着いてない', reading: 'ついてない', itemId: 'v3-vocab-tsuku' };
const juuji = { surface: '10時', reading: 'じゅうじ', itemId: 'v3-vocab-juuji' };
const okurenai = { surface: '遅れない', reading: 'おくれない', itemId: 'v3-vocab-okureru' };
const wara = { surface: '笑', reading: 'わら', itemId: 'v3-expression-wara' };

export const episodeOne: V3Episode = {
  id: 'episode-1',
  episodeNumber: 1,
  level: 'N5',
  arcId: 'new-life-in-japan',
  arcTitleJapanese: '日本での新生活',
  arcTitleReading: 'にほんでのしんせいかつ',
  arcTitleEnglish: 'New Life in Japan',
  titleJapanese: '知らないメッセージ',
  titleReading: 'しらないめっせーじ',
  titleEnglish: "A Message From Someone You Don't Know",
  estimatedMinutes: 10,
  curriculumGrammarIds: [
    'grammar-mou',
    'grammar-mada',
    'grammar-mada-teimasen',
    'grammar-ni',
  ],
  examSkills: ['listening-task', 'appropriate-response', 'grammar-cloze'],
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
    { id: 'v3-vocab-yotei', kind: 'vocabulary', japanese: '予定', reading: 'よてい', meaning: 'plans; schedule' },
    { id: 'v3-vocab-shinjuku', kind: 'vocabulary', japanese: '新宿', reading: 'しんじゅく', meaning: 'Shinjuku' },
    { id: 'v3-vocab-eki', kind: 'vocabulary', japanese: '駅', reading: 'えき', meaning: 'station' },
    { id: 'v3-expression-kitabakari', kind: 'expression', japanese: '来たばかり', reading: 'きたばかり', meaning: 'have just arrived' },
    { id: 'v3-vocab-sukunai', kind: 'vocabulary', japanese: '少ない', reading: 'すくない', meaning: 'few; not many' },
    { id: 'v3-vocab-iu', kind: 'vocabulary', japanese: '言う', reading: 'いう', meaning: 'to say' },
    { id: 'v3-vocab-renraku-suru', kind: 'vocabulary', japanese: '連絡', reading: 'れんらく', meaning: 'contact; to contact' },
    { id: 'v3-vocab-juuji', kind: 'vocabulary', japanese: '10時', reading: 'じゅうじ', meaning: "ten o'clock" },
    { id: 'v3-vocab-okureru', kind: 'vocabulary', japanese: '遅れる', reading: 'おくれる', meaning: 'to be late' },
    { id: 'v3-vocab-ocha', kind: 'vocabulary', japanese: 'お茶', reading: 'おちゃ', meaning: 'tea' },
    { id: 'v3-expression-wara', kind: 'expression', japanese: '笑', reading: 'わら', meaning: 'a casual “haha” in messages' },
    { id: 'v3-expression-mou', kind: 'expression', japanese: 'もう', reading: 'もう', meaning: 'already; yet' },
    { id: 'v3-expression-mada', kind: 'expression', japanese: 'まだ', reading: 'まだ', meaning: 'still; not yet' },
    { id: 'v3-grammar-mou-mada', kind: 'grammar', japanese: 'もう／まだ', reading: 'もう／まだ', meaning: 'already / still not yet' },
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
        { id: 'lost-phone', label: 'Yuki found Mia’s lost phone.', correct: false, feedback: '連絡先 means contact details, not a phone.' },
        { id: 'wrong-person', label: 'Yuki thinks you are Mia.', correct: false, feedback: 'ミアから says Mia was the source.' },
      ],
    },
    {
      id: 'arrived-question', type: 'chat', learnedItemIds: ['v3-vocab-tsuku', 'v3-expression-mou', 'v3-expression-mada'], messages: [
        { id: 'arrived-1', sender: 'yuki', time: '7:43 PM', line: line(japanese(nihon, 'には', mou, tsuku, '？'), 'Have you arrived in Japan yet?') },
        { id: 'arrived-2', sender: 'yuki', line: line(japanese(mada, tsuiteinai, 'なら、ゆっくりでいいよ。')) },
      ],
    },
    {
      id: 'arrived-choice', type: 'interaction', interaction: 'chatChoice',
      prompt: 'You arrived yesterday. Reply to Yuki.',
      options: [
        { id: 'arrived-yesterday', line: line(japanese('うん、', kinou, tsuku, 'よ！'), 'Yeah, I arrived yesterday!'), correct: true, feedback: 'Natural and friendly. に is understood from Yuki’s question, so it can be omitted in your reply.' },
        { id: 'arrive-tomorrow', line: line(japanese(mada, '。', ashita, tsukuPlain, 'よ。'), 'Not yet. I’ll arrive tomorrow.'), correct: false, feedback: 'Natural Japanese, but you already arrived yesterday.' },
        { id: 'japan-subject', line: line(japanese('うん、', nihon, 'が', tsuku, 'よ。')), correct: false, feedback: 'Use に with 着く: 日本に着いたよ。' },
      ],
    },
    {
      id: 'discovery-mou-mada', type: 'teachingMoment', title: 'もう / まだ — one situation, two viewpoints',
      contrast: [
        line(japanese(mou, tsuku, '？'), 'Have you arrived already / yet?'),
        line(japanese(mada, tsuiteinai, '。'), 'I have not arrived yet.'),
      ],
      explanation: 'もう asks whether something has happened by now. まだ says it has not happened yet. You just saw both with arriving.',
      kanjiFocus: { kanji: '着', reading: 'つ(く) / つ(いた)', meaning: 'arrive' },
      learnedItemIds: ['v3-expression-mou', 'v3-expression-mada', 'v3-grammar-mou-mada', 'v3-vocab-tsuku'],
    },
    {
      id: 'mia-context', type: 'chat', learnedItemIds: ['v3-vocab-renraku-suru'], messages: [
        { id: 'mia-1', sender: 'yuki', line: line(japanese('ほんと？よかった！'), 'Really? Great!') },
        { id: 'mia-2', sender: 'yuki', line: line(japanese('ミアが「', nihon, 'に', kitabakari, 'で、', mada, tomodachi, 'が', sukunai, '」って', itteta, 'から、', renrakuShitemita, '😊'), 'Mia said you just arrived in Japan and do not have many friends yet, so I thought I would message you.') },
        { id: 'mia-3', sender: 'yuki', line: line(japanese('これからよろしくね！'), "Let's get along from here on!") },
      ],
    },
    {
      id: 'build-reply', type: 'sentenceBuild',
      prompt: 'Guided reply: build a warm, natural answer.',
      parts: [{ id: 'kochira', text: 'こちらこそ、' }, { id: 'yoroshiku', text: 'よろしく！' }],
      correctOrder: ['kochira', 'yoroshiku'],
      answer: line(japanese('こちらこそ、よろしく！'), 'Likewise—nice to meet you!'),
      explanation: 'こちらこそ means “likewise” and answers Yuki’s よろしく naturally.',
    },
    {
      id: 'invitation', type: 'chat', learnedItemIds: ['v3-vocab-ashita', 'v3-vocab-hima', 'v3-vocab-yotei'], messages: [
        { id: 'invite-1', sender: 'yuki', line: line(japanese(ashita, hima, '？'), 'Are you free tomorrow?') },
        { id: 'invite-2', sender: 'yuki', line: line(japanese(ashita, 'は', mou, yotei, 'ある？')) },
      ],
    },
    {
      id: 'free-reply', type: 'freeResponse', intent: 'episode-one-availability',
      prompt: 'Reply naturally. Tell Yuki when you are free, if you are working, or suggest something to do.',
      message: { id: 'free-prompt', sender: 'yuki', line: line(japanese(ashita, hima, '？')) },
      suggestedStarters: [
        { text: 'うん、ひまだよ！' },
        { text: '午後ならひまだよ。', contextualReading: 'ごごならひまだよ。' },
        { text: '明日は仕事がある。', contextualReading: 'あしたはしごとがある。' },
      ],
    },
    {
      id: 'meeting-place', type: 'chat', learnedItemIds: ['v3-vocab-eki'], messages: [
        { id: 'meet-1', sender: 'yuki', line: line(japanese('やった！じゃあ、', ashita, juuji, 'に', shinjuku, eki, 'で！'), 'Great! Then tomorrow at 10 at Shinjuku Station!') },
        { id: 'meet-2', sender: 'yuki', line: line(japanese(okurenai, 'でね', wara), "Don't be late, okay? haha") },
      ],
    },
    {
      id: 'mia-recap', type: 'freeResponse', intent: 'recap-contact', learnedItemIds: ['v3-expression-mou', 'v3-expression-mada', 'v3-vocab-renraku-suru'],
      prompt: 'One last message to Yuki — reply naturally in Japanese.',
      message: { id: 'mia-recap-prompt', sender: 'yuki', line: line(japanese('そういえば、ミアには', mou, renrakuShita, '？')) },
      suggestedStarters: [
        { text: 'うん、もう連絡したよ。', contextualReading: 'うん、もうれんらくしたよ。' },
        { text: 'まだしてない。' },
      ],
    },
    { id: 'complete', type: 'completion' },
  ],
  nextEpisode: {
    id: 'episode-2',
    titleJapanese: '新宿で会おう',
    titleReading: 'しんじゅくであおう',
    titleEnglish: "Let's Meet in Shinjuku",
    setup: "You and Yuki have made plans to meet at Shinjuku Station.",
    hook: 'But getting there might not go exactly as planned.',
  },
};
