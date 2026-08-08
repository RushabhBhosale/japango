export interface FreeResponseEvaluation {
  accepted: boolean;
  title: string;
  feedback: string;
  suggestedResponse?: string;
  source: 'deterministic' | 'ai';
}

function compact(value: string): string {
  return value.trim().replace(/[\s。！!？?]/gu, '').toLowerCase();
}

export function evaluateAcceptanceDeterministically(answer: string): FreeResponseEvaluation {
  const normalized = compact(answer);
  if (!normalized) {
    return { accepted: false, title: 'Write a short reply', feedback: 'Try telling Yuki that you are free or that you would like to go.', source: 'deterministic' };
  }
  if (!/[ぁ-んァ-ヶ一-龯]/u.test(normalized)) {
    return { accepted: false, title: 'Try it in Japanese', feedback: 'A short message is enough. For example: うん、ひまだよ！', suggestedResponse: 'うん、ひまだよ！', source: 'deterministic' };
  }
  if (/(忙しい|むり|無理|行けない|だめ|ダメ)/u.test(normalized)) {
    return { accepted: false, title: 'I understood you', feedback: 'That sounds like you cannot go. In this scene, you would like to accept Yuki’s invitation.', suggestedResponse: 'いいね、行こう！', source: 'deterministic' };
  }
  const accepting = /(ひま|暇|いいね|いいよ|行こう|行きたい|大丈夫|ぜひ|会おう)/u.test(normalized);
  if (!accepting) {
    return { accepted: false, title: 'I understood part of it', feedback: 'Make the acceptance a little clearer for Yuki.', suggestedResponse: 'うん、明日はひまだよ！', source: 'deterministic' };
  }
  const natural = /(うん.*(ひま|暇).*だよ|いいね.*行こう|ぜひ.*行きたい|明日.*大丈夫)/u.test(normalized);
  return natural
    ? { accepted: true, title: 'Sounds natural', feedback: 'Friendly, clear, and right for a message to a new friend.', source: 'deterministic' }
    : { accepted: true, title: 'I understood you', feedback: 'Your meaning is clear. A slightly more natural message to a friend:', suggestedResponse: 'うん、ひまだよ！', source: 'deterministic' };
}
