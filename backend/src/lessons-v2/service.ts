import { randomUUID } from 'node:crypto';

import {
  lessonV2DraftInputSchema,
  lessonV2GenerationPlanInputSchema,
  lessonV2UpdateDraftInputSchema,
  type LessonV2ValidationIssue,
} from './contracts';
import { LessonsV2DependencyResolver } from './dependency-resolver';
import { LessonsV2Repository } from './repository';
import { validateLessonV2Version } from './validator';

export class LessonsV2Service {
  constructor(
    private readonly repository = new LessonsV2Repository(),
    private readonly dependencies = new LessonsV2DependencyResolver(),
  ) {}

  listPublished() { return this.repository.listLessons({ publishedOnly: true }); }
  listManagement() { return this.repository.listLessons(); }
  getPublished(lessonId: string) { return this.repository.getLesson(lessonId, true); }
  getManagement(lessonId: string) { return this.repository.getLesson(lessonId); }
  createDraft(input: unknown) { return this.repository.createDraft(lessonV2DraftInputSchema.parse(input)); }
  updateDraft(lessonId: string, input: unknown) { return this.repository.updateLatestDraft(lessonId, lessonV2UpdateDraftInputSchema.parse(input)); }
  duplicate(lessonId: string, slug: string) { return this.repository.duplicate(lessonId, slug); }
  createNextVersion(lessonId: string) { return this.repository.createNextVersion(lessonId); }
  archive(lessonId: string) { return this.repository.archive(lessonId); }

  async validate(lessonId: string): Promise<{ issues: LessonV2ValidationIssue[] }> {
    const lesson = await this.repository.getLesson(lessonId);
    const issues = await this.collectValidationIssues(lesson);
    await this.repository.replaceValidationIssues(lesson.id, issues);
    return { issues };
  }

  async publish(lessonId: string) {
    const lesson = await this.repository.getLesson(lessonId);
    return this.repository.publish(lessonId, await this.collectValidationIssues(lesson));
  }

  async resolveDependencies(lessonId: string, input: unknown) {
    const lesson = await this.repository.getLesson(lessonId);
    return this.dependencies.resolve(lesson, input);
  }

  listVocabulary(limit?: number) { return this.dependencies.listVocabulary(limit); }
  listKanji(limit?: number) { return this.dependencies.listKanji(limit); }

  async createGenerationPlan(input: unknown): Promise<{ id: string; status: 'planned'; plan: unknown }> {
    const plan = lessonV2GenerationPlanInputSchema.parse(input);
    // Planning is intentionally deterministic and draft-only. A configured
    // model may later consume this plan, but it cannot publish content itself.
    const output = {
      title: plan.title,
      level: plan.level,
      objectives: plan.objectives,
      sourceQuery: plan.sourceQuery,
      sourceChunkIds: plan.sourceChunkIds,
      requiredSections: ['introduction', 'dialogue', 'vocabulary', 'grammar', 'guided_practice', 'quiz', 'review_cards'],
      publishPolicy: 'draft_only',
    };
    const id = randomUUID();
    return { id, status: 'planned', plan: output };
  }

  private async collectValidationIssues(lesson: Awaited<ReturnType<LessonsV2Repository['getLesson']>>): Promise<LessonV2ValidationIssue[]> {
    return [...validateLessonV2Version(lesson).issues, ...await this.repository.unresolvedDependencyIssues(lesson.id)];
  }
}
