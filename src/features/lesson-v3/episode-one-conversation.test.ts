import { describe, expect, it } from 'vitest';

import {
  decideEpisodeOneConversation,
  episodeOneConversationPhase,
  episodeOneMeetingCheckpoint,
  episodeOneYukiFollowUp,
  episodeOneYukiProposal,
} from './episode-one-conversation';

describe('Episode 1 controlled conversation checkpoint', () => {
  it('accepts a free alternative and proposes a Shinjuku plan', () => {
    const decision = decideEpisodeOneConversation('うん！何かする？', 'availability');

    expect(decision).toMatchObject({ accepted: true, requiresFollowUp: false, storyChoices: { availabilityTomorrow: 'free' } });
    expect(episodeOneYukiProposal(decision.storyChoices)?.line.text.raw).toContain('新宿');
  });

  it('keeps an afternoon preference and changes the proposed time', () => {
    const decision = decideEpisodeOneConversation('午後ならひまだよ。', 'availability');

    expect(decision.storyChoices).toMatchObject({ availabilityTomorrow: 'afternoon-only', preferredMeetingTime: 'afternoon' });
    expect(episodeOneYukiProposal(decision.storyChoices)?.line.text.raw).toContain('午後2時');
  });

  it('asks about work finishing time, then converges on an evening meeting', () => {
    const work = decideEpisodeOneConversation('明日は仕事がある。', 'availability');
    const choices = work.storyChoices;

    expect(work).toMatchObject({ accepted: true, requiresFollowUp: true });
    expect(episodeOneConversationPhase(choices)).toBe('finish-time');
    expect(episodeOneYukiFollowUp(choices)?.line.text.raw).toContain('何時');

    const finishTime = decideEpisodeOneConversation('6時に終わるよ。', 'finish-time');
    const finalChoices = { ...choices, ...finishTime.storyChoices };
    expect(finishTime).toMatchObject({ accepted: true, requiresFollowUp: false });
    expect(episodeOneYukiProposal(finalChoices)?.line.text.raw).toContain('7時');
    expect(episodeOneMeetingCheckpoint(finalChoices)[0]?.line.text.raw).toContain('新宿駅');
  });

  it('does not turn an unavailable response into a forced acceptance', () => {
    const decision = decideEpisodeOneConversation('明日はちょっと無理。', 'availability');

    expect(decision).toMatchObject({ accepted: true, requiresFollowUp: false, storyChoices: { availabilityTomorrow: 'unavailable' } });
    expect(episodeOneYukiProposal(decision.storyChoices)?.line.text.raw).toContain('今週末');
  });

  it('annotates every kanji in Yuki’s dynamic replies', () => {
    const working = { availabilityTomorrow: 'working' as const };
    const messages = [
      episodeOneYukiFollowUp(working),
      episodeOneYukiProposal({ availabilityTomorrow: 'free', preferredMeetingTime: 'morning' }),
      episodeOneYukiProposal({ availabilityTomorrow: 'afternoon-only', preferredMeetingTime: 'afternoon' }),
      episodeOneYukiProposal({ availabilityTomorrow: 'working', preferredMeetingTime: 'evening' }),
      ...episodeOneMeetingCheckpoint({ availabilityTomorrow: 'working', preferredMeetingTime: 'evening' }),
    ].filter((message): message is NonNullable<typeof message> => Boolean(message));

    for (const message of messages) {
      for (const token of message.line.text.tokens) {
        if (!/[\u3400-\u9fff]/u.test(token.surface)) continue;
        expect(token.kind).toBe('word');
        if (token.kind === 'word') expect(token.reading).toBeTruthy();
      }
    }
  });
});
