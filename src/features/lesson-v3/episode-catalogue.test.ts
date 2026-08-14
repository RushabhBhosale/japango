import { describe, expect, it } from 'vitest';

import n4Grammar from '../../../assets/generated-content/grammar/n4.json';
import n5Grammar from '../../../assets/generated-content/grammar/n5.json';
import { hasCompleteContextualReading } from '../japanese-text/contextual-reading';
import type { V3JapaneseLine, V3Scene } from '@/types/lesson-v3';

import episodePracticeBank from './data/episode-grammar-practice.json';
import { sourceTokensMatchReviewedReading, type SourcedSentence } from './authored-episode-factory';
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
    const invalidReadings = tokens.filter((token) => token.reading && !/^[\u3041-\u3096\u309d\u309e\u30a1-\u30faー]+$/u.test(token.reading));

    expect(plainKanji).toEqual([]);
    expect(kanjiWithoutReading).toEqual([]);
    expect(sentenceWideKanjiTokens).toEqual([]);
    expect(invalidReadings).toEqual([]);
  });

  it('matches every pre-tokenized episode sentence to its reviewed full reading', () => {
    const sentences = Object.values(episodePracticeBank.sentences) as SourcedSentence[];
    expect(sentences).toHaveLength(816);
    for (const sentence of sentences) {
      expect(sourceTokensMatchReviewedReading(sentence), sentence.japanese).toBe(true);
    }
  });

  it('keeps contextual readings intact at ambiguous token boundaries', () => {
    const sentences = Object.values(episodePracticeBank.sentences) as SourcedSentence[];
    const directlyHeard = sentences.find(({ japanese }) => japanese.startsWith('本人に聞いた'))!;
    const repeatedCounter = sentences.find(({ japanese }) => japanese.startsWith('京都へ二回行った'))!;
    const nara = sentences.find(({ japanese }) => japanese.includes('奈良とか'))!;

    expect(directlyHeard.tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: '本人', reading: 'ほんにん' }),
      expect.objectContaining({ surface: '聞', reading: 'き' }),
    ]));
    expect(repeatedCounter.tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: '二回行', reading: 'にかいい' }),
    ]));
    expect(nara.tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: '奈良', reading: 'なら' }),
    ]));
  });

  it('provides contextual furigana for every Japanese option and starter outside a V3 line', () => {
    const invalidReadings: string[] = [];
    const validate = (episodeId: string, text: string, reading?: string) => {
      if (!/[\u3400-\u9fff々ヶ]/u.test(text)) return;
      if (!reading || !hasCompleteContextualReading(text, reading)) {
        invalidReadings.push(`${episodeId}: ${text} → ${reading ?? 'missing'}`);
      }
    };

    for (const episode of v3EpisodeList) {
      for (const scene of episode.scenes) {
        if (scene.type === 'interaction') {
          scene.options.forEach((option) => {
            if (option.label) validate(episode.id, option.label, option.contextualReading);
          });
        }
        if (scene.type === 'sentenceBuild') {
          scene.parts.forEach((part) => validate(episode.id, part.text, part.contextualReading));
        }
        if (scene.type === 'freeResponse') {
          scene.suggestedStarters.forEach((starter) => validate(episode.id, starter.text, starter.contextualReading));
        }
      }
    }
    expect(invalidReadings).toEqual([]);
  });

  it('provides contextual furigana for every episode, arc, and learning-objective title', () => {
    const invalidReadings: string[] = [];
    for (const episode of v3EpisodeList) {
      if (!hasCompleteContextualReading(episode.titleJapanese, episode.titleReading)) invalidReadings.push(`${episode.id} title: ${episode.titleJapanese} → ${episode.titleReading}`);
      if (!hasCompleteContextualReading(episode.arcTitleJapanese, episode.arcTitleReading)) invalidReadings.push(`${episode.id} arc: ${episode.arcTitleJapanese} → ${episode.arcTitleReading}`);
      if (!hasCompleteContextualReading(episode.nextEpisode.titleJapanese, episode.nextEpisode.titleReading)) invalidReadings.push(`${episode.id} next: ${episode.nextEpisode.titleJapanese} → ${episode.nextEpisode.titleReading}`);
      for (const objective of episode.learningObjectives) {
        if (!hasCompleteContextualReading(objective.japanese, objective.reading)) invalidReadings.push(`${episode.id} objective: ${objective.japanese} → ${objective.reading}`);
      }
    }
    expect(invalidReadings).toEqual([]);
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
