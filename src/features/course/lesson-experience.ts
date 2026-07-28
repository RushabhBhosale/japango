import type { CourseLessonDefinition, LessonActivityDefinition, LessonExperienceConfig, LessonExperienceTemplate } from '@/types/course';

const templates: readonly LessonExperienceTemplate[] = [
  'conversation_first',
  'pattern_workshop',
  'reading_first',
  'situation_challenge',
  'story_chapter',
  'review_workshop',
];

/**
 * Keeps lesson presentation intentional without making the curriculum itself
 * conditional on UI state. The course generator owns this assignment so it is
 * stable offline and simple to audit.
 */
export function lessonExperienceFor(
  lesson: Pick<CourseLessonDefinition, 'contentLevel' | 'number' | 'kind' | 'title'>,
): LessonExperienceConfig {
  const plannedTemplate = templates[(lesson.number - 1) % templates.length] ?? 'conversation_first';
  // Workshops are a focused practice mode, but they still inherit the unit’s
  // reading/story/review identity when that is the intended progression.
  const template = lesson.kind === 'workshop' && !['reading_first', 'story_chapter', 'review_workshop'].includes(plannedTemplate)
    ? 'pattern_workshop'
    : plannedTemplate;
  const primarySkill = template === 'reading_first'
    ? 'Read for meaning'
    : template === 'pattern_workshop'
      ? 'Build accurate sentence patterns'
      : template === 'conversation_first' || template === 'story_chapter'
        ? 'Use Japanese in a short conversation'
        : template === 'review_workshop'
          ? 'Repair and strengthen earlier skills'
          : 'Respond naturally in a real situation';
  return {
    template,
    primarySkill,
    sectionOrder: template === 'reading_first'
      ? ['reading', 'vocabulary', 'grammar', 'practice', 'listening', 'checkpoint']
      : template === 'pattern_workshop'
        ? ['introduction', 'grammar', 'practice', 'reading', 'listening', 'checkpoint']
        : ['introduction', 'vocabulary', 'dialogue', 'grammar', 'practice', 'reading', 'listening', 'checkpoint'],
    feedbackStyle: lesson.contentLevel === 'N4' ? 'instructional' : 'concise',
    allowOptionalSpeaking: true,
    showFullOverviewAtStart: false,
    transitionStyle: template === 'story_chapter' ? 'story' : template === 'pattern_workshop' ? 'workbook' : 'minimal',
  };
}

export interface LessonExperienceIssue { path: string; message: string; }

const basicChoiceTypes = new Set<LessonActivityDefinition['type']>([
  'vocabulary_practice',
  'mixed_practice',
  'checkpoint',
]);

/** Lightweight authored-content linting, intentionally pure for build/tests. */
export function validateLessonExperience(lesson: CourseLessonDefinition): LessonExperienceIssue[] {
  const issues: LessonExperienceIssue[] = [];
  const activities = lesson.activities;
  let run = 0;
  let previousResponseKind: string | undefined;
  let selectCount = 0;
  const promptCounts = new Map<string, number>();

  for (const activity of activities) {
    const activityResponseKind = activity.exercises[0]?.responseKind;
    if (previousResponseKind === activityResponseKind) run += 1;
    else run = 1;
    previousResponseKind = activityResponseKind;
    if (run > 5 && activity.type !== 'conjugation_drill') {
      issues.push({ path: activity.id, message: 'More than five consecutive activities use the same interaction style.' });
      run = 0;
    }
    for (const exercise of activity.exercises) {
      if (exercise.responseKind === 'select') selectCount += 1;
      const promptKey = exercise.prompt.replace(/\d+/gu, '#').trim();
      const count = (promptCounts.get(promptKey) ?? 0) + 1;
      promptCounts.set(promptKey, count);
      if (count > 5 && activity.type !== 'conjugation_drill' && activity.type !== 'checkpoint') {
        issues.push({ path: activity.id, message: 'A prompt template repeats too often outside an intentional drill.' });
      }
      if ((exercise.responseKind === 'typed' || exercise.responseKind === 'production') && !exercise.expectedResponse) {
        issues.push({ path: `${activity.id}:${exercise.id}`, message: 'Typed activity does not state its expected response format.' });
      }
    }
  }

  const total = activities.reduce((sum, activity) => sum + activity.interactionCount, 0);
  if (total && selectCount / total > 0.3) issues.push({ path: lesson.id, message: 'More than 30% of interactions are basic multiple choice.' });
  if (lesson.number === 1 && activities.some((activity) => activity.type === 'warm_up')) {
    issues.push({ path: lesson.id, message: 'Lesson 1 cannot contain a previous-lesson warm-up.' });
  }
  if (!activities.some((activity) => activity.type === 'introduction')) issues.push({ path: lesson.id, message: 'Lesson has no clear opening.' });
  if (!activities.some((activity) => basicChoiceTypes.has(activity.type))) issues.push({ path: lesson.id, message: 'Lesson needs a meaningful recognition check.' });
  return issues;
}

export function validateLessonTemplateDistribution(lessons: readonly CourseLessonDefinition[]): LessonExperienceIssue[] {
  const issues: LessonExperienceIssue[] = [];
  for (let index = 1; index < lessons.length; index += 1) {
    const previous = lessons[index - 1];
    const current = lessons[index];
    if (previous && current && previous.experience.template === current.experience.template && current.kind !== 'workshop') {
      issues.push({ path: current.id, message: 'Consecutive lessons use the same experience template.' });
    }
  }
  return issues;
}
