export type MockExamLevel = 'N5' | 'N4';
export type MockExamDomain = 'vocabulary' | 'kanji' | 'grammar' | 'reading' | 'listening';

export interface MockExamChoice { id: string; text: string; }
export interface MockExamQuestion {
  id: string;
  domain: MockExamDomain;
  level: MockExamLevel;
  prompt: string;
  promptLanguage: 'ja';
  presentation: string;
  explanation: string | null;
  correctOptionId: string | null;
  choices: MockExamChoice[];
  linkedItemIds: string[];
  stimulus: { type: string; id: string } | null;
}

export interface MockExamSection {
  id: string;
  title: string;
  order: number;
  recommendedMinutes: number;
  questionPlacementIds: string[];
}

export interface MockExamPlacement {
  id: string;
  sectionId: string;
  questionId: string;
  position: number;
  domain: MockExamDomain;
  questionType: string;
  parentType: 'reading-passage' | 'listening-activity' | null;
  parentId: string | null;
  primaryTargetId: string | null;
}

export interface MockExamParent { id: string; sectionId: string; parentType: 'reading-passage' | 'listening-activity'; parentId: string; position: number; questionIds: string[]; }
export interface MockExamTiming { totalMinutes: number | null; resumable: boolean; }
export interface MockExam { id: string; level: MockExamLevel; title: string; sections: MockExamSection[]; placements: MockExamPlacement[]; parents: MockExamParent[]; timing: MockExamTiming; }
export interface MockExamReading { id: string; title: string; japanese: string; questionIds: string[]; }
export interface MockExamListening { id: string; title: string; speechText: string; transcript: string; questionIds: string[]; }

export interface MockExamAttempt {
  examId: string;
  questionIndex: number;
  selectedAnswers: Record<string, string>;
  elapsedSeconds: number;
  paused: boolean;
  completedAt?: string;
}
