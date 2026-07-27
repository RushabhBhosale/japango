import type { AdjectiveFormId, VerbFormId } from '../../types/course';

export type VerbGroup = 'ichidan' | 'godan' | 'irregular';

const irregular: Record<string, Record<VerbFormId, string>> = {
  する: { masu: 'します', dictionary: 'する', nai: 'しない', past: 'した', te: 'して', potential: 'できる', volitional: 'しよう', tara: 'したら', nara: 'するなら', ba: 'すれば', passive: 'される', causative: 'させる', causative_passive: 'させられる' },
  来る: { masu: '来ます', dictionary: '来る', nai: '来ない', past: '来た', te: '来て', potential: '来られる', volitional: '来よう', tara: '来たら', nara: '来るなら', ba: '来れば', passive: '来られる', causative: '来させる', causative_passive: '来させられる' },
  くる: { masu: 'きます', dictionary: 'くる', nai: 'こない', past: 'きた', te: 'きて', potential: 'こられる', volitional: 'こよう', tara: 'きたら', nara: 'くるなら', ba: 'くれば', passive: 'こられる', causative: 'こさせる', causative_passive: 'こさせられる' },
};
const godanRu = new Set(['入る', '走る', '帰る', '切る', '知る', '要る', '減る', '滑る', '握る', '限る']);
const godanEndings: Record<string, { a: string; i: string; e: string; o: string; te: string; past: string }> = {
  う: { a: 'わ', i: 'い', e: 'え', o: 'お', te: 'って', past: 'った' },
  つ: { a: 'た', i: 'ち', e: 'て', o: 'と', te: 'って', past: 'った' },
  る: { a: 'ら', i: 'り', e: 'れ', o: 'ろ', te: 'って', past: 'った' },
  む: { a: 'ま', i: 'み', e: 'め', o: 'も', te: 'んで', past: 'んだ' },
  ぶ: { a: 'ば', i: 'び', e: 'べ', o: 'ぼ', te: 'んで', past: 'んだ' },
  ぬ: { a: 'な', i: 'に', e: 'ね', o: 'の', te: 'んで', past: 'んだ' },
  く: { a: 'か', i: 'き', e: 'け', o: 'こ', te: 'いて', past: 'いた' },
  ぐ: { a: 'が', i: 'ぎ', e: 'げ', o: 'ご', te: 'いで', past: 'いだ' },
  す: { a: 'さ', i: 'し', e: 'せ', o: 'そ', te: 'して', past: 'した' },
};

export function classifyVerb(dictionaryForm: string): VerbGroup {
  if (dictionaryForm in irregular) return 'irregular';
  if (dictionaryForm.endsWith('る') && !godanRu.has(dictionaryForm)) return 'ichidan';
  return 'godan';
}

export function conjugateVerb(dictionaryForm: string, form: VerbFormId): string | undefined {
  const special = irregular[dictionaryForm]?.[form];
  if (special) return special;
  const group = classifyVerb(dictionaryForm);
  if (group === 'ichidan') {
    const stem = dictionaryForm.slice(0, -1);
    const forms: Record<VerbFormId, string> = { masu: `${stem}ます`, dictionary: dictionaryForm, nai: `${stem}ない`, past: `${stem}た`, te: `${stem}て`, potential: `${stem}られる`, volitional: `${stem}よう`, tara: `${stem}たら`, nara: `${dictionaryForm}なら`, ba: `${stem}れば`, passive: `${stem}られる`, causative: `${stem}させる`, causative_passive: `${stem}させられる` };
    return forms[form];
  }
  const ending = dictionaryForm.at(-1);
  const rule = ending ? godanEndings[ending] : undefined;
  if (!rule) return undefined;
  const stem = dictionaryForm.slice(0, -1);
  if (dictionaryForm === '行く') {
    if (form === 'te') return '行って';
    if (form === 'past') return '行った';
  }
  const forms: Record<VerbFormId, string> = { masu: `${stem}${rule.i}ます`, dictionary: dictionaryForm, nai: `${stem}${rule.a}ない`, past: `${stem}${rule.past}`, te: `${stem}${rule.te}`, potential: `${stem}${rule.e}る`, volitional: `${stem}${rule.o}う`, tara: `${stem}${rule.past}ら`, nara: `${dictionaryForm}なら`, ba: `${stem}${rule.e}ば`, passive: `${stem}${rule.a}れる`, causative: `${stem}${rule.a}せる`, causative_passive: `${stem}${rule.a}せられる` };
  return forms[form];
}

export function conjugateIAdjective(dictionaryForm: string, form: 'present_negative' | 'past' | 'past_negative' | 'adverb'): string | undefined {
  if (!dictionaryForm.endsWith('い')) return undefined;
  const stem = dictionaryForm.slice(0, -1);
  if (form === 'present_negative') return `${stem}くない`;
  if (form === 'past') return `${stem}かった`;
  if (form === 'past_negative') return `${stem}くなかった`;
  return `${stem}く`;
}

export function conjugateNaAdjective(word: string, form: 'present_negative' | 'past' | 'past_negative' | 'adverb'): string {
  if (form === 'present_negative') return `${word}ではありません`;
  if (form === 'past') return `${word}でした`;
  if (form === 'past_negative') return `${word}ではありませんでした`;
  return `${word}に`;
}

/** Course-facing adjective forms, kept deterministic for offline drills. */
export function conjugateAdjectiveForm(word: string, form: AdjectiveFormId): string | undefined {
  if (form === 'i_present_negative') return conjugateIAdjective(word, 'present_negative');
  if (form === 'i_past') return conjugateIAdjective(word, 'past');
  if (form === 'i_past_negative') return conjugateIAdjective(word, 'past_negative');
  if (form === 'na_present_negative') return conjugateNaAdjective(word, 'present_negative');
  if (form === 'na_past') return conjugateNaAdjective(word, 'past');
  if (form === 'na_past_negative') return conjugateNaAdjective(word, 'past_negative');
  return undefined;
}

/** Noun + copula transformations used alongside adjective drills. */
export function conjugateNounForm(noun: string, form: Extract<AdjectiveFormId, 'noun_past' | 'noun_past_negative'>): string {
  return form === 'noun_past' ? `${noun}でした` : `${noun}ではありませんでした`;
}
