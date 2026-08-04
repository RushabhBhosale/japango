import {
  audioLessonDraftInputSchema,
  audioLessonListFilterSchema,
  audioLessonUpdateDraftInputSchema,
  audioPilotSeedInputSchema,
  type AudioLessonVersion,
} from './contracts';
import { auditAudioLessonContent, audioAuditIssuesForLesson } from './content-audit';
import { buildAudioLessonPilots } from './pilots';
import { AudioLessonsDependencyResolver } from './dependency-resolver';
import { AudioLessonsError } from './errors';
import { AudioLessonsRepository } from './repository';
import { loadAudioTtsProvider, type AudioTtsProvider } from './tts';
import { validateAudioLessonVersion } from './validator';
import type { LessonV2ValidationIssue } from '../lessons-v2/contracts';

const maximumTtsAttempts = 3;

export class AudioLessonsService {
  constructor(
    private readonly repository = new AudioLessonsRepository(),
    private readonly tts: AudioTtsProvider = loadAudioTtsProvider(),
    private readonly dependencies = new AudioLessonsDependencyResolver(),
  ) {}

  async listPublished(input: unknown = {}) {
    const filters = audioLessonListFilterSchema.parse(input);
    return this.repository.listLessons({
      publishedOnly: true,
      level: filters.level,
      lessonType: filters.lessonType,
      minMinutes: filters.minMinutes,
      maxMinutes: filters.maxMinutes,
    });
  }

  listManagement() { return this.repository.listLessons(); }
  getPublished(lessonId: string) { return this.repository.getLesson(lessonId, true); }
  getManagement(lessonId: string) { return this.repository.getLesson(lessonId); }
  listPublishedPlaylists() { return this.repository.listPlaylists(true); }
  listManagementPlaylists() { return this.repository.listPlaylists(false); }
  createDraft(input: unknown) { return this.repository.createDraft(audioLessonDraftInputSchema.parse(input)); }
  updateDraft(lessonId: string, input: unknown) { return this.repository.updateLatestDraft(lessonId, audioLessonUpdateDraftInputSchema.parse(input)); }
  createNextVersion(lessonId: string) { return this.repository.createNextVersion(lessonId); }
  archive(lessonId: string) { return this.repository.archive(lessonId); }
  resolveDependencies(lessonId: string, input: unknown) { return this.dependencies.resolve(lessonId, input); }

  async validate(lessonId: string): Promise<{ issues: LessonV2ValidationIssue[] }> {
    const lesson = await this.repository.getLesson(lessonId);
    const issues = await this.collectValidationIssues(lesson, false);
    await this.repository.replaceValidationIssues(lesson.id, issues);
    return { issues };
  }

  async publish(lessonId: string) {
    const lesson = await this.repository.getLesson(lessonId);
    return this.repository.publish(lessonId, await this.collectValidationIssues(lesson, true));
  }

  async auditContent() {
    return auditAudioLessonContent(await this.repository.listAuditLessons());
  }

  async generateDraftAudio(lessonId: string): Promise<AudioLessonVersion> {
    const lesson = await this.repository.getLesson(lessonId);
    const preflight = validateAudioLessonVersion(lesson).issues.filter((item) => item.severity === 'critical');
    if (preflight.length) {
      await this.repository.replaceValidationIssues(lesson.id, preflight);
      return lesson;
    }
    const runId = await this.repository.createGenerationRun(lesson.id, { provider: this.tts.name, sectionCount: lesson.scriptSections.length });
    try {
      const sections = [];
      for (const section of lesson.scriptSections) {
        const result = await this.synthesizeWithRetries(section);
        sections.push({
          ...section,
          audioUrl: result.audioUrl,
          audioStatus: result.audioStatus,
          estimatedDurationMs: result.estimatedDurationMs,
        });
      }
      const updated = await this.repository.replaceAudioSections(lessonId, sections, this.tts.name);
      await this.repository.finishGenerationRun(runId, { provider: this.tts.name, sectionCount: sections.length, statuses: sections.map((section) => section.audioStatus) });
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Audio synthesis failed.';
      await this.repository.finishGenerationRun(runId, { provider: this.tts.name }, message);
      throw error;
    }
  }

  async seedPilots(input: unknown, dryRun = false): Promise<{ pilots: AudioLessonVersion[]; created: boolean }> {
    const binding = audioPilotSeedInputSchema.parse(input);
    const pilots = buildAudioLessonPilots({
      source: { sourceChunkId: binding.sourceChunkId, sourcePath: binding.sourcePath, patternId: binding.patternId },
      vocabularyIds: binding.vocabularyIds,
      grammarIds: binding.grammarIds,
      kanjiIds: binding.kanjiIds,
      relatedLessonIds: binding.relatedLessonIds,
    });
    const validation = pilots.flatMap((pilot) => validateAudioLessonVersion(pilot).issues.filter((item) => item.severity === 'critical'));
    const audit = auditAudioLessonContent(pilots);
    const criticalAudit = audit.issues.filter((item) => item.severity === 'critical');
    if (validation.length || criticalAudit.length) {
      throw new Error(`Pilot content is not publishable as a draft: ${validation.length + criticalAudit.length} critical validation issue(s).`);
    }
    if (dryRun) return { pilots, created: false };
    const existingBySlug = new Map((await this.repository.listLessons()).map((lesson) => [lesson.slug, lesson]));
    const created = await Promise.all(pilots.map(async (pilot) => {
      const {
        id: _id,
        lessonId: _lessonId,
        version: _version,
        status: _status,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        publishedAt: _publishedAt,
        ...draftInput
      } = pilot;
      const existing = existingBySlug.get(pilot.slug);
      if (existing?.status === 'published') throw new AudioLessonsError('CONFLICT', `Pilot ${pilot.slug} is already published and cannot be reseeded.`, 409);
      const draft = existing ?? await this.repository.createDraft(audioLessonDraftInputSchema.parse(draftInput));
      return this.generateDraftAudio(draft.lessonId);
    }));
    return { pilots: created, created: true };
  }

  private async collectValidationIssues(lesson: AudioLessonVersion, forPublication: boolean): Promise<LessonV2ValidationIssue[]> {
    const audit = await this.auditContent();
    return [
      ...validateAudioLessonVersion(lesson, { forPublication }).issues,
      ...audioAuditIssuesForLesson(audit, lesson.id),
      ...await this.repository.unresolvedDependencyIssues(lesson.id),
      ...await this.repository.verifyLinkedDependencies(lesson),
    ];
  }

  private async synthesizeWithRetries(section: AudioLessonVersion['scriptSections'][number]) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maximumTtsAttempts; attempt += 1) {
      try {
        return await this.tts.synthesize(section);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Audio synthesis failed after retries.');
  }
}
