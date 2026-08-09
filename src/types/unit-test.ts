export type UnitTestDomain = 'vocabulary' | 'kanji' | 'grammar' | 'reading' | 'listening';
export type UnitTestQuestionKind = 'vocabulary-meaning' | 'vocabulary-context' | 'kanji-reading' | 'choose-kanji' | 'grammar-selection' | 'sentence-completion' | 'sentence-ordering' | 'reading-comprehension' | 'listening-comprehension';

export interface UnitTestQuestion {
  id: string;
  domain: UnitTestDomain;
  kind: UnitTestQuestionKind;
  prompt: string;
  passage?: string;
  listeningSpeech?: string;
  choices: { id: string; text: string }[];
  correctChoiceId: string;
  explanation: string;
  linkedEpisodeItemIds: string[];
}

export interface UnitTest { id: string; title: string; level: 'N5' | 'N4'; episodeIds: string[]; estimatedMinutes: number; questions: UnitTestQuestion[]; }
export interface UnitTestAttempt { unitTestId: string; questionIndex: number; answers: Record<string, string>; completedAt?: string; }
