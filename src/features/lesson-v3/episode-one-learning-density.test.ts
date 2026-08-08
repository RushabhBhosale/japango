import { describe, expect, it } from 'vitest';

import { episodeOne } from './episode-one';

describe('Episode 1 learning density', () => {
  it('centres もう / まだ and revisits the pair in the story', () => {
    const authoredJapanese = episodeOne.scenes.flatMap((scene) => {
      if (scene.type === 'chat') return scene.messages.map((message) => message.line.text.raw);
      if (scene.type === 'teachingMoment') return scene.contrast.map((line) => line.text.raw);
      if (scene.type === 'freeResponse') return [scene.message.line.text.raw];
      return [];
    }).join('\n');

    expect(episodeOne.learningObjectives.some((item) => item.id === 'v3-grammar-mou-mada')).toBe(true);
    expect((authoredJapanese.match(/もう/gu) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((authoredJapanese.match(/まだ/gu) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps five high-value words and the 着 kanji focus in the story', () => {
    const objectiveIds = new Set(episodeOne.learningObjectives.map((item) => item.id));

    expect([...objectiveIds]).toEqual(expect.arrayContaining([
      'v3-vocab-tsuku',
      'v3-vocab-hima',
      'v3-vocab-renraku-suru',
      'v3-vocab-ashita',
      'v3-vocab-eki',
    ]));
    const teachingMoment = episodeOne.scenes.find((scene) => scene.id === 'discovery-mou-mada');
    expect(teachingMoment?.type === 'teachingMoment' && teachingMoment.kanjiFocus).toMatchObject({ kanji: '着', reading: 'つ(く) / つ(いた)' });
  });

  it('has guided and genuine free Japanese production inside the story', () => {
    const guided = episodeOne.scenes.find((scene) => scene.id === 'build-reply');
    const recap = episodeOne.scenes.find((scene) => scene.id === 'mia-recap');

    expect(guided?.type).toBe('sentenceBuild');
    expect(recap).toMatchObject({ type: 'freeResponse', intent: 'recap-contact' });
  });
});
