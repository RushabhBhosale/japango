import { describe, expect, it } from 'vitest';

import { classifyVerb, conjugateAdjectiveForm, conjugateNounForm, conjugateVerb } from './conjugation-service';

describe('course conjugation service', () => {
  it('conjugates ichidan, godan, and irregular verbs', () => {
    expect(conjugateVerb('食べる', 'te')).toBe('食べて');
    expect(conjugateVerb('書く', 'nai')).toBe('書かない');
    expect(conjugateVerb('する', 'potential')).toBe('できる');
    expect(conjugateVerb('来る', 'causative_passive')).toBe('来させられる');
  });

  it('handles the 行く exception and godan る verbs', () => {
    expect(conjugateVerb('行く', 'past')).toBe('行った');
    expect(classifyVerb('帰る')).toBe('godan');
  });

  it('supports adjective and noun copula transformations', () => {
    expect(conjugateAdjectiveForm('高い', 'i_past_negative')).toBe('高くなかった');
    expect(conjugateAdjectiveForm('静か', 'na_past')).toBe('静かでした');
    expect(conjugateNounForm('学生', 'noun_past_negative')).toBe('学生ではありませんでした');
  });
});
