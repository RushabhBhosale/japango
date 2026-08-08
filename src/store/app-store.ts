import { create } from 'zustand';

import { assessmentIndexSchema, themePreferenceSchema } from '@/features/settings/schemas';
import {
  completeAssessment,
  getAssessmentAttempts,
  getAssessmentIndex,
  getAssessmentQuestions,
  saveAssessmentIndex,
  submitAssessmentAnswer,
} from '@/services/database/assessment-repository';
import { initializeDatabase } from '@/services/database/database';
import {
  completeOnboarding as persistOnboarding,
  getLearnerProfile,
  saveDailyGoal,
} from '@/services/database/profile-repository';
import { getSetting, setSetting } from '@/services/database/settings-repository';
import {
  completeV3Assessment as persistV3Assessment,
  completeV3Onboarding as persistV3Onboarding,
  getV3LearnerState,
  resetV3LearnerState as persistV3Reset,
  saveV3AssessmentAnswer,
} from '@/services/database/lesson-v3-repository';
import type {
  LearningGoal,
  SelfReportedLevel,
  V3AssessmentAnswer,
  V3LearnerState,
} from '@/types/lesson-v3';
import type {
  AppSettings,
  AssessmentQuestion,
  LearnerProfile,
  LearningAttempt,
  ThemePreference,
} from '@/types/learning';

type InitializationStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AppState {
  initializationStatus: InitializationStatus;
  errorMessage?: string;
  profile?: LearnerProfile;
  v3Learner?: V3LearnerState;
  settings: AppSettings;
  assessmentQuestions: AssessmentQuestion[];
  assessmentAttempts: LearningAttempt[];
  assessmentIndex: number;
  assessmentLoading: boolean;
  bootstrap: () => Promise<void>;
  completeOnboarding: (displayName: string, dailyGoalMinutes: number) => Promise<void>;
  completeV3Onboarding: (learningGoal: LearningGoal, selfReportedLevel: SelfReportedLevel) => Promise<void>;
  answerV3Assessment: (answer: V3AssessmentAnswer) => Promise<void>;
  finishV3Assessment: () => Promise<void>;
  resetV3State: () => Promise<void>;
  loadAssessment: () => Promise<void>;
  answerAssessment: (
    question: AssessmentQuestion,
    selectedOptionId: string,
    responseTimeMs: number,
  ) => Promise<LearningAttempt>;
  goToAssessmentIndex: (index: number) => Promise<void>;
  finishAssessment: () => Promise<void>;
  updateDailyGoal: (minutes: number) => Promise<void>;
  updateThemePreference: (preference: ThemePreference) => Promise<void>;
  clearError: () => void;
}

const initialSettings: AppSettings = { themePreference: 'system' };

export const useAppStore = create<AppState>((set, get) => ({
  initializationStatus: 'idle',
  settings: initialSettings,
  assessmentQuestions: [],
  assessmentAttempts: [],
  assessmentIndex: 0,
  assessmentLoading: false,

  bootstrap: async () => {
    if (get().initializationStatus === 'loading') return;
    set({ initializationStatus: 'loading', errorMessage: undefined });
    try {
      await initializeDatabase();
      const [profile, themePreference, v3Learner] = await Promise.all([
        getLearnerProfile(),
        getSetting('theme_preference', themePreferenceSchema),
        getV3LearnerState(),
      ]);
      set({
        initializationStatus: 'ready',
        profile,
        v3Learner,
        settings: { themePreference: themePreference ?? 'system' },
      });
    } catch (error: unknown) {
      console.error(
        '[JapanGo database] Initialization failed',
        error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
      );
      set({
        initializationStatus: 'error',
        errorMessage: "JapanGo couldn't open its local learning data. Restart the app and try again.",
      });
    }
  },

  completeOnboarding: async (displayName, dailyGoalMinutes) => {
    const profile = await persistOnboarding(displayName, dailyGoalMinutes);
    set({ profile });
  },

  completeV3Onboarding: async (learningGoal, selfReportedLevel) => {
    const v3Learner = await persistV3Onboarding(learningGoal, selfReportedLevel);
    set({ v3Learner });
  },

  answerV3Assessment: async (answer) => {
    const v3Learner = await saveV3AssessmentAnswer(answer);
    set({ v3Learner });
  },

  finishV3Assessment: async () => {
    const v3Learner = await persistV3Assessment();
    set({ v3Learner });
  },

  resetV3State: async () => {
    const v3Learner = await persistV3Reset();
    set({ v3Learner });
  },

  loadAssessment: async () => {
    if (get().assessmentLoading) return;
    set({ assessmentLoading: true, errorMessage: undefined });
    try {
      const [assessmentQuestions, assessmentAttempts, assessmentIndex] = await Promise.all([
        getAssessmentQuestions(),
        getAssessmentAttempts(),
        getAssessmentIndex(),
      ]);
      const safeIndex = Math.min(assessmentIndexSchema.parse(assessmentIndex), assessmentQuestions.length);
      set({ assessmentQuestions, assessmentAttempts, assessmentIndex: safeIndex });
    } catch {
      set({ errorMessage: 'Your assessment could not be loaded. Your saved progress is still on this device.' });
    } finally {
      set({ assessmentLoading: false });
    }
  },

  answerAssessment: async (question, selectedOptionId, responseTimeMs) => {
    const existing = get().assessmentAttempts.find((attempt) => attempt.questionId === question.id);
    if (existing) return existing;
    const attempt = await submitAssessmentAnswer(question, selectedOptionId, responseTimeMs);
    set((state) => ({ assessmentAttempts: [...state.assessmentAttempts, attempt] }));
    return attempt;
  },

  goToAssessmentIndex: async (index) => {
    const parsed = assessmentIndexSchema.parse(index);
    await saveAssessmentIndex(parsed);
    set({ assessmentIndex: parsed });
  },

  finishAssessment: async () => {
    await completeAssessment();
    const profile = await getLearnerProfile();
    set({ profile });
  },

  updateDailyGoal: async (minutes) => {
    const profile = await saveDailyGoal(minutes);
    set({ profile });
  },

  updateThemePreference: async (preference) => {
    const parsed = themePreferenceSchema.parse(preference);
    await setSetting('theme_preference', parsed, themePreferenceSchema);
    set({ settings: { themePreference: parsed } });
  },

  clearError: () => set({ errorMessage: undefined }),
}));
