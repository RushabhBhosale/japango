import type { V3ChatMessage, V3JapaneseLine, V3JapaneseText, V3StoryChoices } from '@/types/lesson-v3';

export type EpisodeOneConversationPhase = 'availability' | 'finish-time';

export interface EpisodeOneConversationDecision {
  accepted: boolean;
  requiresFollowUp: boolean;
  storyChoices: Partial<V3StoryChoices>;
  suggestedResponse?: string;
}

export interface EpisodeOneLanguageFeedback {
  title: string;
  feedback: string;
  suggestedResponse?: string;
}

export interface EpisodeOneConversationTurn {
  feedback: EpisodeOneLanguageFeedback;
  yukiReply: V3ChatMessage;
  requiresFollowUp: boolean;
}

interface ReadingToken {
  surface: string;
  reading: string;
}

const readingTokens: ReadingToken[] = [
  { surface: '新宿駅', reading: 'しんじゅくえき' },
  { surface: '新宿', reading: 'しんじゅく' },
  { surface: 'お茶', reading: 'おちゃ' },
  { surface: '午後', reading: 'ごご' },
  { surface: '仕事', reading: 'しごと' },
  { surface: '何時', reading: 'なんじ' },
  { surface: '終わる', reading: 'おわる' },
  { surface: '会おう', reading: 'あおう' },
  { surface: '楽しみ', reading: 'たのしみ' },
  { surface: '今週末', reading: 'こんしゅうまつ' },
  { surface: '明日', reading: 'あした' },
  { surface: '時', reading: 'じ' },
];

function line(raw: string, englishHelp?: string): V3JapaneseLine {
  const tokens: V3JapaneseText['tokens'] = [];
  let remaining = raw;
  let index = 0;
  while (remaining) {
    const readingToken = readingTokens.find((candidate) => remaining.startsWith(candidate.surface));
    if (readingToken) {
      tokens.push({
        id: `dynamic-${index}`,
        kind: 'word',
        surface: readingToken.surface,
        reading: readingToken.reading,
        vocabularyId: `v3-dynamic-${readingToken.surface}`,
        kanjiIds: [],
      });
      remaining = remaining.slice(readingToken.surface.length);
    } else {
      const character = remaining[0] ?? '';
      tokens.push({ id: `dynamic-${index}`, kind: 'plain', surface: character, kanjiIds: [] });
      remaining = remaining.slice(character.length);
    }
    index += 1;
  }
  return { text: { raw, tokens }, englishHelp };
}

export function learnerEnteredLine(raw: string): V3JapaneseLine {
  return {
    text: {
      raw,
      tokens: [{ id: 'learner-entered-message', kind: 'plain', surface: raw, kanjiIds: [] }],
    },
  };
}

function compact(value: string): string {
  return value.trim().replace(/[\s。！!？?、,]/gu, '').toLowerCase();
}

function containsJapanese(value: string): boolean {
  return /[ぁ-んァ-ヶ一-龯]/u.test(value);
}

function hasTime(value: string): boolean {
  return /(?:[0-9０-９]+|[一二三四五六七八九十]+)(?:時|じ)/u.test(value) || /(午後|ごご|夜|よる|夕方)/u.test(value);
}

export function episodeOneConversationPhase(choices: V3StoryChoices): EpisodeOneConversationPhase {
  return choices.availabilityTomorrow === 'working' && !choices.preferredMeetingTime
    ? 'finish-time'
    : 'availability';
}

// This classifies only the learner's intent. It never writes a character reply
// or decides a grammar correction, which keeps those responsibilities separate.
export function decideEpisodeOneConversation(answer: string, phase: EpisodeOneConversationPhase): EpisodeOneConversationDecision {
  const normalized = compact(answer);
  if (!normalized || !containsJapanese(normalized)) {
    return { accepted: false, requiresFollowUp: false, storyChoices: {}, suggestedResponse: phase === 'availability' ? 'うん、ひまだよ！' : '6時に終わるよ。' };
  }

  if (phase === 'finish-time') {
    if (!hasTime(normalized)) return { accepted: false, requiresFollowUp: true, storyChoices: {}, suggestedResponse: '6時に終わるよ。' };
    return { accepted: true, requiresFollowUp: false, storyChoices: { preferredMeetingTime: 'evening' } };
  }

  if (/(仕事|しごと|勤務)/u.test(normalized)) {
    return { accepted: true, requiresFollowUp: true, storyChoices: { availabilityTomorrow: 'working' } };
  }
  if (/(午後|ごご)/u.test(normalized)) {
    return { accepted: true, requiresFollowUp: false, storyChoices: { availabilityTomorrow: 'afternoon-only', preferredMeetingTime: 'afternoon' } };
  }
  if (/(忙しい|忙|むり|無理|だめ|ダメ|行けない|いけない)/u.test(normalized)) {
    return { accepted: true, requiresFollowUp: false, storyChoices: { availabilityTomorrow: 'unavailable', preferredMeetingTime: 'afternoon' } };
  }
  if (/(ひま|暇|大丈夫|いいよ|いいね|行こう|行きたい|ぜひ|何かする|なにかする)/u.test(normalized)) {
    return { accepted: true, requiresFollowUp: false, storyChoices: { availabilityTomorrow: 'free', preferredMeetingTime: 'morning' } };
  }
  return { accepted: false, requiresFollowUp: false, storyChoices: {}, suggestedResponse: 'うん、明日はひまだよ！' };
}

export function fallbackEpisodeOneLanguageFeedback(answer: string, phase: EpisodeOneConversationPhase, accepted: boolean): EpisodeOneLanguageFeedback {
  if (!answer.trim()) return { title: 'Write a short reply', feedback: 'A short Japanese message is enough.' };
  if (!containsJapanese(answer)) return { title: 'Try it in Japanese', feedback: 'Use a short Japanese message so Yuki can understand you.', suggestedResponse: phase === 'availability' ? 'うん、ひまだよ！' : '6時に終わるよ。' };
  if (!accepted) return { title: 'I understood part of it', feedback: phase === 'availability' ? 'Tell Yuki whether you are free, busy, or working tomorrow.' : 'Tell Yuki roughly what time work finishes.', suggestedResponse: phase === 'availability' ? 'うん、明日はひまだよ！' : '6時に終わるよ。' };
  const natural = phase === 'availability'
    ? /(うん|はい|明日|午後|仕事|ひま|暇|何かする|なにかする)/u.test(answer)
    : hasTime(answer);
  return natural
    ? { title: 'Clear message', feedback: 'Your meaning is clear and Yuki can reply naturally.' }
    : { title: 'I understood you', feedback: 'Your meaning is clear. Here is a slightly more natural casual version.', suggestedResponse: phase === 'availability' ? 'うん、明日はひまだよ！' : '6時に終わるよ。' };
}

export function episodeOneYukiFollowUp(choices: V3StoryChoices): V3ChatMessage | undefined {
  if (episodeOneConversationPhase(choices) !== 'finish-time') return undefined;
  return { id: 'yuki-work-finish', sender: 'yuki', line: line('そっか。何時に仕事が終わる？', 'I see. What time does work finish?') };
}

export function episodeOneYukiProposal(choices: V3StoryChoices): V3ChatMessage | undefined {
  if (!choices.availabilityTomorrow || episodeOneConversationPhase(choices) === 'finish-time') return undefined;
  if (choices.availabilityTomorrow === 'afternoon-only') {
    return { id: 'yuki-afternoon-proposal', sender: 'yuki', line: line('じゃあ、午後2時に新宿駅でお茶しない？', 'Then shall we have tea at Shinjuku Station at 2 PM?') };
  }
  if (choices.availabilityTomorrow === 'working') {
    return { id: 'yuki-evening-proposal', sender: 'yuki', line: line('じゃあ、7時に新宿駅でお茶しよう！', 'Then let’s have tea at Shinjuku Station at 7 PM!') };
  }
  if (choices.availabilityTomorrow === 'unavailable') {
    return { id: 'yuki-weekend-proposal', sender: 'yuki', line: line('そっか。じゃあ、今週末の午後に新宿駅でお茶しない？', 'I see. Then shall we have tea at Shinjuku Station this weekend afternoon?') };
  }
  return { id: 'yuki-morning-proposal', sender: 'yuki', line: line('じゃあ、新宿でお茶しよう！10時ごろに新宿駅でどう？', 'Then let’s have tea in Shinjuku! How about Shinjuku Station around 10?') };
}

export function episodeOneMeetingCheckpoint(choices: V3StoryChoices): V3ChatMessage[] {
  const time = choices.preferredMeetingTime === 'evening'
    ? '7時'
    : choices.preferredMeetingTime === 'afternoon'
      ? '午後2時'
      : '10時';
  const day = choices.availabilityTomorrow === 'unavailable' ? '今週末の午後' : '明日';
  return [
    { id: 'meet-checkpoint', sender: 'yuki', line: line(`じゃあ、${day}${time}に新宿駅で会おう！`, `Great—let’s meet at Shinjuku Station ${day === '明日' ? 'tomorrow' : 'this weekend'}.`) },
    { id: 'meet-checkpoint-2', sender: 'yuki', line: line('楽しみにしてるね！', 'I’m looking forward to it!') },
  ];
}
