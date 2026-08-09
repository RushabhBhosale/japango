import { describe, expect, it } from 'vitest';

import n4Grammar from '../../../assets/generated-content/grammar/n4.json';
import n5Grammar from '../../../assets/generated-content/grammar/n5.json';
import type { V3JapaneseLine, V3Scene } from '@/types/lesson-v3';

import { v3EpisodeList } from './episodes';

function japaneseLines(scene: V3Scene): V3JapaneseLine[] {
  switch (scene.type) {
    case 'chat':
      return scene.messages.map(({ line }) => line);
    case 'interaction':
      return [
        ...(scene.context ? [scene.context] : []),
        ...scene.options.flatMap((option) => option.line ? [option.line] : []),
      ];
    case 'teachingMoment':
      return scene.contrast;
    case 'sentenceBuild':
      return [scene.answer];
    case 'freeResponse':
      return [scene.message.line];
    default:
      return [];
  }
}

describe('V3 episode catalogue', () => {
  it('adds exactly 50 episodes split evenly between N5 and N4', () => {
    const addedEpisodes = v3EpisodeList.filter(({ episodeNumber }) => episodeNumber > 1);

    expect(v3EpisodeList).toHaveLength(51);
    expect(addedEpisodes.filter(({ level }) => level === 'N5')).toHaveLength(25);
    expect(addedEpisodes.filter(({ level }) => level === 'N4')).toHaveLength(25);
    expect(v3EpisodeList.map(({ episodeNumber }) => episodeNumber)).toEqual(
      Array.from({ length: 51 }, (_, index) => index + 1),
    );
  });

  it('gives every authored grammar family eight interactive retrievals', () => {
    for (const episode of v3EpisodeList.slice(1)) {
      const practiceScenes = episode.scenes.filter((scene) => /^pattern-\d+-\d{2}-/u.test(scene.id));
      const grammarObjectives = episode.learningObjectives.filter(({ kind }) => kind === 'grammar');

      expect(grammarObjectives).toHaveLength(2);
      expect(practiceScenes).toHaveLength(grammarObjectives.length * 8);
      for (let conceptIndex = 1; conceptIndex <= grammarObjectives.length; conceptIndex += 1) {
        expect(practiceScenes.filter(({ id }) => id.startsWith(`pattern-${conceptIndex}-`))).toHaveLength(8);
      }
      expect(episode.scenes.length).toBeGreaterThanOrEqual(24);
      expect(episode.estimatedMinutes).toBeGreaterThanOrEqual(25);
    }
  });

  it('gives every canonical grammar pattern at least eight questions', () => {
    for (const episode of v3EpisodeList.slice(1)) {
      for (const [grammarIndex] of episode.curriculumGrammarIds.entries()) {
        const prefix = `canonical-${grammarIndex + 1}-`;
        expect(episode.scenes.filter(({ id }) => id.startsWith(prefix))).toHaveLength(8);
      }
    }
  });

  it('attaches word-level furigana to every episode kanji', () => {
    const tokens = v3EpisodeList
      .flatMap(({ scenes }) => scenes)
      .flatMap(japaneseLines)
      .flatMap(({ text }) => text.tokens);
    const plainKanji = tokens.filter((token) => token.kind === 'plain' && /[\u3400-\u9fff々ヶ]/u.test(token.surface));
    const kanjiWithoutReading = tokens.filter((token) => token.kind === 'word' && /[\u3400-\u9fff々ヶ]/u.test(token.surface) && !token.reading);
    const sentenceWideKanjiTokens = tokens.filter((token) => token.kind === 'word' && /[\u3400-\u9fff々ヶ]/u.test(token.surface) && /[、。！？]/u.test(token.surface));

    expect(plainKanji).toEqual([]);
    expect(kanjiWithoutReading).toEqual([]);
    expect(sentenceWideKanjiTokens).toEqual([]);
  });

  it('uses unique episode and scene IDs and links the full sequence', () => {
    expect(new Set(v3EpisodeList.map(({ id }) => id)).size).toBe(v3EpisodeList.length);
    for (const [index, episode] of v3EpisodeList.entries()) {
      expect(new Set(episode.scenes.map(({ id }) => id)).size).toBe(episode.scenes.length);
      if (index < v3EpisodeList.length - 1) {
        expect(episode.nextEpisode.id).toBe(v3EpisodeList[index + 1].id);
      }
    }
  });

  it('repeats the JLPT task families across both levels', () => {
    for (const level of ['N5', 'N4'] as const) {
      const skills = new Set(v3EpisodeList.filter((episode) => episode.level === level).flatMap(({ examSkills }) => examSkills));
      expect(skills.size).toBeGreaterThanOrEqual(6);
      expect([...skills].some((skill) => /grammar|sentence|form/u.test(skill))).toBe(true);
      expect([...skills].some((skill) => /reading|information/u.test(skill))).toBe(true);
      expect(skills.has('listening-comprehension')).toBe(true);
    }
  });

  it('covers every canonical N5 record and every resolved N4 grammar record', () => {
    const coveredN5 = new Set(v3EpisodeList.filter(({ level }) => level === 'N5').flatMap(({ curriculumGrammarIds }) => curriculumGrammarIds));
    const coveredN4 = new Set(v3EpisodeList.filter(({ level }) => level === 'N4').flatMap(({ curriculumGrammarIds }) => curriculumGrammarIds));
    const expectedN4 = n4Grammar.filter(({ id }) => !id.endsWith('-unresolved'));

    expect([...new Set(n5Grammar.map(({ id }) => id))].filter((id) => !coveredN5.has(id))).toEqual([]);
    expect([...new Set(expectedN4.map(({ id }) => id))].filter((id) => !coveredN4.has(id))).toEqual([]);
    expect(coveredN4.has('grammar-n4-oki-ni-unresolved')).toBe(false);
    expect(coveredN4.has('grammar-n4-wa-ga-wa-unresolved')).toBe(false);
  });
});
