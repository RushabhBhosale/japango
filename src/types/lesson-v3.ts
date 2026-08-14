export const learningGoals = [
  'jlpt',
  'conversation',
  'travel',
  'anime-manga',
  'living-in-japan',
  'work-study',
  'general-interest',
] as const;
export type LearningGoal = (typeof learningGoals)[number];

export const selfReportedLevels = [
  'completely-new',
  'kana',
  'n5',
  'n4',
  'n3-plus',
  'not-sure',
] as const;
export type SelfReportedLevel = (typeof selfReportedLevels)[number];
export type AssistanceMode = 'guided' | 'supported' | 'independent';

export type V3AssessmentCategory = 'kana' | 'vocabulary' | 'kanji' | 'grammar' | 'reading';

export interface V3AssessmentQuestion {
  id: string;
  category: V3AssessmentCategory;
  difficulty: 'beginner' | 'N5' | 'N4';
  label: string;
  prompt: string;
  passage?: string;
  options: { id: string; label: string }[];
  correctOptionId: string;
  explanation: string;
}

export interface V3AssessmentAnswer {
  questionId: string;
  selectedOptionId: string;
  correct: boolean;
}

export interface V3AssessmentResult {
  startingLevel: 'Beginner' | 'Around N5' | 'Around N4';
  assistanceMode: AssistanceMode;
  correctCount: number;
  questionCount: number;
  kana: 'Comfortable' | 'Developing';
  kanji: 'Comfortable' | 'Developing' | 'Just starting';
  grammar: 'Foundations developing' | 'N5 foundations' | 'N5 strong / early N4';
  reading: 'Just starting' | 'Developing' | 'Comfortable';
}

export interface V3LearnerState {
  onboardingCompleted: boolean;
  learningGoal?: LearningGoal;
  selfReportedLevel?: SelfReportedLevel;
  assistanceMode: AssistanceMode;
  assessmentCompleted: boolean;
  assessmentIndex: number;
  assessmentAnswers: V3AssessmentAnswer[];
  assessmentResult?: V3AssessmentResult;
  updatedAt: string;
}

export interface V3LearningObjective {
  id: string;
  kind: 'vocabulary' | 'expression' | 'grammar';
  japanese: string;
  reading: string;
  meaning: string;
}

export interface V3Character {
  id: string;
  nameJapanese: string;
  nameEnglish: string;
  avatarText: string;
  description: string;
}

export interface V3JapaneseLine {
  text: V3JapaneseText;
  englishHelp?: string;
}

export interface V3JapaneseToken {
  id: string;
  kind: 'plain' | 'word';
  surface: string;
  reading?: string;
  vocabularyId?: string;
  kanjiIds: string[];
}

/** V3 owns its text representation and does not use the legacy lesson types. */
export interface V3JapaneseText {
  raw: string;
  tokens: V3JapaneseToken[];
}

export interface V3ChatMessage {
  id: string;
  sender: 'yuki' | 'learner' | 'unknown';
  line: V3JapaneseLine;
  time?: string;
}

interface V3BaseScene {
  id: string;
  learnedItemIds?: string[];
}

export interface V3StoryScene extends V3BaseScene {
  type: 'story';
  eyebrow?: string;
  title: string;
  body: string;
}

export interface V3ChatScene extends V3BaseScene {
  type: 'chat';
  messages: V3ChatMessage[];
}

export interface V3ChoiceScene extends V3BaseScene {
  type: 'interaction';
  interaction: 'chatChoice' | 'meaningCheck';
  prompt: string;
  context?: V3JapaneseLine;
  options: {
    id: string;
    line?: V3JapaneseLine;
    label?: string;
    contextualReading?: string;
    correct: boolean;
    feedback: string;
  }[];
}

export interface V3TeachingMomentScene extends V3BaseScene {
  type: 'teachingMoment';
  title: string;
  contrast: V3JapaneseLine[];
  explanation: string;
  learnedItemIds: string[];
  kanjiFocus?: {
    kanji: string;
    reading: string;
    meaning: string;
  };
}

export interface V3SentenceBuildScene extends V3BaseScene {
  type: 'sentenceBuild';
  prompt: string;
  parts: { id: string; text: string; contextualReading?: string }[];
  correctOrder: string[];
  answer: V3JapaneseLine;
  explanation: string;
}

export interface V3FreeResponseScene extends V3BaseScene {
  type: 'freeResponse';
  prompt: string;
  message: V3ChatMessage;
  intent: 'accept-invitation' | 'episode-one-availability' | 'recap-contact';
  suggestedStarters: { text: string; contextualReading?: string }[];
}

// Keep only durable choices that can make a later story beat feel personal.
// Deliberately do not use this as a chat transcript.
export interface V3StoryChoices {
  availabilityTomorrow?: 'free' | 'afternoon-only' | 'working' | 'unavailable';
  preferredMeetingTime?: 'morning' | 'afternoon' | 'evening';
  foodPreference?: string;
  hobbies?: string[];
}

export interface V3CompletionScene extends V3BaseScene {
  type: 'completion';
}

export type V3Scene =
  | V3StoryScene
  | V3ChatScene
  | V3ChoiceScene
  | V3TeachingMomentScene
  | V3SentenceBuildScene
  | V3FreeResponseScene
  | V3CompletionScene;

export interface V3Episode {
  id: string;
  episodeNumber: number;
  level: 'N5' | 'N4';
  arcId: string;
  arcTitleJapanese: string;
  arcTitleReading: string;
  arcTitleEnglish: string;
  titleJapanese: string;
  titleReading: string;
  titleEnglish: string;
  estimatedMinutes: number;
  /** Canonical curriculum records covered by the episode. */
  curriculumGrammarIds: string[];
  /** JLPT task families deliberately practised inside the episode. */
  examSkills: string[];
  characters: V3Character[];
  learningObjectives: V3LearningObjective[];
  scenes: V3Scene[];
  nextEpisode: {
    id?: string;
    titleJapanese: string;
    titleReading: string;
    titleEnglish: string;
    setup: string;
    hook: string;
  };
}

export interface V3EpisodeResponse {
  sceneId: string;
  kind: 'choice' | 'sentenceBuild' | 'freeResponse';
  answer: string;
  correct: boolean;
  feedbackTitle: string;
  feedback: string;
  suggestedResponse?: string;
}

export interface V3EpisodeProgress {
  episodeId: string;
  currentSceneIndex: number;
  responses: V3EpisodeResponse[];
  learnedItemIds: string[];
  storyChoices: V3StoryChoices;
  completedAt?: string;
  updatedAt: string;
}
