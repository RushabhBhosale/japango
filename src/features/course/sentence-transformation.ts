import { conjugateVerb } from './conjugation-service';
import { answerMatchesAcceptedVariants } from './answer-normalization';

export type SentenceTransformationKind = 'masu-to-dictionary' | 'dictionary-to-masu' | 'dictionary-to-te' | 'affirmative-to-negative' | 'present-to-past' | 'combine-te-kara' | 'statement-to-question' | 'reason-kara';

export interface SentenceTransformation { kind: SentenceTransformationKind; source: string; expectedAnswers: string[]; instruction: string; }

export function createTransformation(kind: SentenceTransformationKind, source: string, dictionaryVerb?: string): SentenceTransformation {
  const verb = dictionaryVerb ?? '食べる';
  const dictionary = conjugateVerb(verb, 'dictionary') ?? verb;
  const masu = conjugateVerb(verb, 'masu') ?? '食べます';
  const te = conjugateVerb(verb, 'te') ?? '食べて';
  if (kind === 'dictionary-to-masu') return { kind, source: dictionary, expectedAnswers: [masu], instruction: 'Rewrite in polite ます-form.' };
  if (kind === 'masu-to-dictionary') return { kind, source: masu, expectedAnswers: [dictionary], instruction: 'Rewrite in dictionary form.' };
  if (kind === 'dictionary-to-te') return { kind, source: dictionary, expectedAnswers: [te], instruction: 'Rewrite in て-form.' };
  if (kind === 'affirmative-to-negative') return { kind, source: masu, expectedAnswers: [conjugateVerb(verb, 'nai') ?? '食べない', '食べません'], instruction: 'Rewrite as a negative sentence.' };
  if (kind === 'present-to-past') return { kind, source: masu, expectedAnswers: [conjugateVerb(verb, 'past') ?? '食べた', '食べました'], instruction: 'Rewrite in the past.' };
  if (kind === 'combine-te-kara') return { kind, source: 'ご飯を食べます。学校へ行きます。', expectedAnswers: ['ご飯を食べてから、学校へ行きます', 'ご飯を食べてから学校へ行きます'], instruction: 'Combine the sentences using 〜てから.' };
  if (kind === 'statement-to-question') return { kind, source, expectedAnswers: [`${source.replace(/[。.]$/u, '')}か`], instruction: 'Rewrite as a polite question.' };
  return { kind, source, expectedAnswers: [`${source.replace(/[。.]$/u, '')}からです`], instruction: 'Give a reason using から.' };
}

export function validateTransformation(answer: string, transformation: SentenceTransformation): boolean {
  return answerMatchesAcceptedVariants(answer, transformation.expectedAnswers);
}
