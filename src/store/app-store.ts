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
  settings: AppSettings;
  assessmentQuestions: AssessmentQuestion[];
  assessmentAttempts: LearningAttempt[];
  assessmentIndex: number;
  assessmentLoading: boolean;
  bootstrap: () => Promise<void>;
  completeOnboarding: (displayName: string, dailyGoalMinutes: number) => Promise<void>;
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
      const [profile, themePreference] = await Promise.all([
        getLearnerProfile(),
        getSetting('theme_preference', themePreferenceSchema),
      ]);
      set({
        initializationStatus: 'ready',
        profile,
        settings: { themePreference: themePreference ?? 'system' },
      });
    } catch {
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
