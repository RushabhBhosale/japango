import type { LearningContentCollections, Question } from '../learning-content/schemas';
import { sha256Text, stableStringify } from '../../utils/deterministic-hash';
import {
  assessmentGenerationConfigSchema, assessmentSnapshotSchema,
  type AssessmentBlueprint, type AssessmentExposureInput, type AssessmentGenerationConfig, type AssessmentSnapshot,
} from './platform-schemas';

type Domain = Question['domain'];
type ParentType = 'reading-passage' | 'listening-activity';
interface Candidate { question: Question; domain: Domain; type: string; targetId: string | null; parentType: ParentType | null; parentId: string | null; level: 'N5' | 'N4'; family: string; }
export interface AssessmentCatalog { learningContent: LearningContentCollections; contentVersion: string; pipelineVersion: string; generationTimestamp?: string; unresolvedTargetIds?: readonly string[]; }
export interface GenerateAssessmentInput { config: AssessmentGenerationConfig; blueprint: AssessmentBlueprint; exposure?: AssessmentExposureInput; }

function compareStable(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function deterministicRank(seed: string, id: string): string { return sha256Text(`${seed}\0${id}`); }
function questionType(question: Question): string { return question.examMetadata?.formatCode ?? question.presentation; }
function correctOptionCount(question: Question): number { return question.responseType === 'text-input' ? 0 : question.correctOptionIds.length; }
function snapshotChecksum(snapshot: Omit<AssessmentSnapshot, 'checksum'>): string { return `sha256:${sha256Text(stableStringify(snapshot))}`; }

export class AssessmentEngine {
  private readonly questions = new Map<string, Question>();
  private readonly optionsByQuestion = new Map<string, number>();
  private readonly targetByQuestion = new Map<string, { targetId: string; targetType: string }>();
  private readonly passageById = new Map<string, LearningContentCollections['readingPassages'][number]>();
  private readonly activityById = new Map<string, LearningContentCollections['listeningActivities'][number]>();
  private readonly unresolvedTargets: Set<string>;

  constructor(private readonly catalog: AssessmentCatalog) {
    for (const question of catalog.learningContent.questions) this.questions.set(question.id, question);
    for (const option of catalog.learningContent.questionOptions) this.optionsByQuestion.set(option.questionId, (this.optionsByQuestion.get(option.questionId) ?? 0) + 1);
    for (const relationship of catalog.learningContent.questionTargetRelationships) if (relationship.role === 'primary') this.targetByQuestion.set(relationship.questionId, { targetId: relationship.targetId, targetType: relationship.targetType });
    for (const passage of catalog.learningContent.readingPassages) this.passageById.set(passage.id, passage);
    for (const activity of catalog.learningContent.listeningActivities) this.activityById.set(activity.id, activity);
    this.unresolvedTargets = new Set(catalog.unresolvedTargetIds ?? []);
  }

  private candidate(question: Question): Candidate {
    const stimulus = question.stimulusReferences[0]; const target = this.targetByQuestion.get(question.id); const parentType = stimulus?.type === 'reading-passage' || stimulus?.type === 'listening-activity' ? stimulus.type : null; const parentId = parentType ? stimulus?.id ?? null : null; const level = question.difficulty.jlptLevel; if (!level) throw new Error(`Question ${question.id} has no JLPT level.`);
    return { question, domain: question.domain, type: questionType(question), targetId: target?.targetId ?? null, parentType, parentId, level, family: `${question.domain}:${questionType(question)}:${target?.targetId ?? parentId ?? question.id}` };
  }

  private isEligible(candidate: Candidate, config: AssessmentGenerationConfig): boolean {
    const { question } = candidate; if (question.needsReview || correctOptionCount(question) !== 1 || (this.optionsByQuestion.get(question.id) ?? 0) < 2) return false;
    if (config.level === 'N5' && candidate.level !== 'N5') return false; if (config.domains && !config.domains.includes(candidate.domain)) return false;
    if (config.lifecycleMode === 'release' && !question.releaseReady) return false; if (candidate.targetId && this.unresolvedTargets.has(candidate.targetId)) return false;
    if (config.excludedQuestionIds?.includes(question.id)) return false;
    if (candidate.parentType === 'reading-passage') { const parent = this.passageById.get(candidate.parentId ?? ''); if (!parent || parent.level !== config.level || (config.lifecycleMode === 'release' && !parent.releaseReady)) return false; }
    if (candidate.parentType === 'listening-activity') { const parent = this.activityById.get(candidate.parentId ?? ''); if (!parent || parent.level !== config.level || (config.lifecycleMode === 'release' && !parent.releaseReady) || !parent.playback.futureAudioKey || !parent.speechNormalizedTranscript) return false; }
    const filters = candidate.domain === 'grammar' ? config.grammarTargetIds : candidate.domain === 'vocabulary' ? config.vocabularyTargetIds : candidate.domain === 'kanji' ? config.kanjiTargetIds : undefined;
    return !filters?.length || Boolean(candidate.targetId && filters.includes(candidate.targetId));
  }

  private sortedCandidates(config: AssessmentGenerationConfig, exposure: AssessmentExposureInput | undefined): Candidate[] {
    const weak = new Set(config.weakTargetIds ?? []); const mastered = new Set(config.masteredTargetIds ?? []); const previous = new Set(config.previouslySeenQuestionIds ?? []); const recent = new Set([...(config.recentlySeenQuestionIds ?? []), ...(exposure?.recentQuestionIds ?? [])]);
    return [...this.questions.values()].map((question) => this.candidate(question)).filter((candidate) => this.isEligible(candidate, config)).sort((left, right) => {
      const leftExposure = exposure?.questionExposure[left.question.id]; const rightExposure = exposure?.questionExposure[right.question.id];
      const score = (candidate: Candidate, record: typeof leftExposure): number => (weak.has(candidate.targetId ?? '') ? -1000 : 0) + (recent.has(candidate.question.id) ? 500 : 0) + (previous.has(candidate.question.id) ? 200 : 0) + (mastered.has(candidate.targetId ?? '') ? 50 : 0) + (record?.count ?? 0) * 20;
      return score(left, leftExposure) - score(right, rightExposure) || compareStable(leftExposure?.lastSeenAt ?? '', rightExposure?.lastSeenAt ?? '') || compareStable(deterministicRank(config.seed, left.question.id), deterministicRank(config.seed, right.question.id));
    });
  }

  private selectKnowledge(candidates: Candidate[], domain: Domain, count: number, level: 'N5' | 'N4', targetLimit: number, distribution: AssessmentBlueprint['sections'][number]['difficultyDistribution'], selectedIds: Set<string>, relaxations: AssessmentSnapshot['relaxedConstraints']): Candidate[] {
    const eligible = candidates.filter((candidate) => candidate.domain === domain && !candidate.parentId && !selectedIds.has(candidate.question.id)); const bands = { easy: eligible.filter(({ question }) => question.difficulty.rank <= 2), medium: eligible.filter(({ question }) => question.difficulty.rank === 3), hard: eligible.filter(({ question }) => question.difficulty.rank >= 4) }; const desired = { easy: Math.round(count * distribution.easy), medium: Math.round(count * distribution.medium), hard: 0 }; desired.hard = Math.max(0, count - desired.easy - desired.medium); const domainCandidates = ([...bands.easy.slice(0, desired.easy), ...bands.medium.slice(0, desired.medium), ...bands.hard.slice(0, desired.hard), ...eligible] as Candidate[]).filter((candidate, index, all) => all.findIndex(({ question }) => question.id === candidate.question.id) === index); const chosen: Candidate[] = []; const targetCounts = new Map<string, number>(); const desiredN4 = level === 'N4' ? Math.round(count * 0.75) : 0;
    const take = (pool: Candidate[], wanted: number, enforceLimit: boolean): void => { for (const candidate of pool) { if (chosen.length >= wanted) break; const target = candidate.targetId ?? candidate.question.id; if (selectedIds.has(candidate.question.id) || (enforceLimit && (targetCounts.get(target) ?? 0) >= targetLimit)) continue; chosen.push(candidate); selectedIds.add(candidate.question.id); targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1); } };
    if (level === 'N4') { take(domainCandidates.filter((candidate) => candidate.level === 'N4'), desiredN4, true); take(domainCandidates.filter((candidate) => candidate.level === 'N5'), count, true); }
    take(domainCandidates, count, true);
    if (chosen.length < count) { relaxations.push({ order: relaxations.length + 1, constraint: 'target-repetition-soft-limit', reason: `${domain} inventory could not meet the preferred target limit.`, effect: `Allowed additional target variants for ${count - chosen.length} placement(s).` }); take(domainCandidates, count, false); }
    return chosen;
  }

  private selectParents(candidates: Candidate[], sectionId: string, quotas: AssessmentBlueprint['sections'][number]['parentQuotas'], config: AssessmentGenerationConfig, exposure: AssessmentExposureInput | undefined, selectedIds: Set<string>, selectedParentIds: Set<string>, relaxations: AssessmentSnapshot['relaxedConstraints']): { questions: Candidate[]; parents: { parentType: ParentType; parentId: string; questionIds: string[] }[] } {
    const questions: Candidate[] = []; const parents: { parentType: ParentType; parentId: string; questionIds: string[] }[] = [];
    for (const quota of quotas) {
      const parentMap = quota.parentType === 'reading-passage' ? this.passageById : this.activityById; const recentParents = new Set(quota.parentType === 'reading-passage' ? [...(config.recentPassageIds ?? []), ...(exposure?.recentPassageIds ?? [])] : [...(config.recentListeningActivityIds ?? []), ...(exposure?.recentListeningActivityIds ?? [])]);
      const parentCandidates = (quota.parentType === 'reading-passage' ? [...this.passageById.values()].filter((parent) => parent.passageType === quota.format) : [...this.activityById.values()].filter((parent) => parent.activityType === quota.format)).filter((parent) => parent.level === config.level && !selectedParentIds.has(parent.id) && (config.lifecycleMode !== 'release' || parent.releaseReady)).sort((left, right) => (recentParents.has(left.id) ? 1 : 0) - (recentParents.has(right.id) ? 1 : 0) || (exposure?.parentExposure[left.id]?.count ?? 0) - (exposure?.parentExposure[right.id]?.count ?? 0) || compareStable(deterministicRank(`${config.seed}:${sectionId}`, left.id), deterministicRank(`${config.seed}:${sectionId}`, right.id)));
      for (const parent of parentCandidates.slice(0, quota.count)) { const group = candidates.filter((candidate) => candidate.parentType === quota.parentType && candidate.parentId === parent.id && !selectedIds.has(candidate.question.id)); if (group.length !== parent.questionIds.length) continue; selectedParentIds.add(parent.id); for (const candidate of group.sort((left, right) => parent.questionIds.indexOf(left.question.id) - parent.questionIds.indexOf(right.question.id))) { selectedIds.add(candidate.question.id); questions.push(candidate); } parents.push({ parentType: quota.parentType, parentId: parent.id, questionIds: group.map(({ question }) => question.id) }); }
      if (parents.filter(({ parentType, parentId }) => parentType === quota.parentType && parentMap.get(parentId) && (quota.parentType === 'reading-passage' ? this.passageById.get(parentId)?.passageType : this.activityById.get(parentId)?.activityType) === quota.format).length < quota.count) relaxations.push({ order: relaxations.length + 1, constraint: 'parent-exposure-preference', reason: `Insufficient unused ${quota.format} parents.`, effect: 'Parent exposure preference was relaxed without relaxing lifecycle or grouping.' });
    }
    return { questions, parents };
  }

  generateAssessment(input: GenerateAssessmentInput): AssessmentSnapshot {
    const config = assessmentGenerationConfigSchema.parse(input.config); const blueprint = input.blueprint; const candidates = this.sortedCandidates(config, input.exposure); const selectedIds = new Set<string>(); const selectedParents = new Set<string>(); const relaxations: AssessmentSnapshot['relaxedConstraints'] = []; const snapshotKey = sha256Text(stableStringify({ config, blueprintId: blueprint.id, contentVersion: this.catalog.contentVersion })).slice(0, 16); const questionPlacements: AssessmentSnapshot['questionPlacements'] = []; const parentPlacements: AssessmentSnapshot['parentPlacements'] = []; const sections: AssessmentSnapshot['sections'] = []; let globalPosition = 0;
    for (const sectionBlueprint of blueprint.sections.filter((section) => !config.sectionIds?.length || config.sectionIds.includes(section.id))) { const sectionId = `assessment-section-${snapshotKey}-${sectionBlueprint.order}`; const parentSelection = this.selectParents(candidates, sectionId, sectionBlueprint.parentQuotas, config, input.exposure, selectedIds, selectedParents, relaxations); const selected = [...parentSelection.questions]; for (const quota of sectionBlueprint.domainQuotas) if (quota.domain !== 'reading' && quota.domain !== 'listening') selected.push(...this.selectKnowledge(candidates, quota.domain, quota.preferred, config.level, blueprint.targetLimits[quota.domain as 'grammar' | 'vocabulary' | 'kanji'] ?? 2, sectionBlueprint.difficultyDistribution, selectedIds, relaxations));
      if (selected.length !== sectionBlueprint.questionCount) relaxations.push({ order: relaxations.length + 1, constraint: 'requested-size', reason: `Section ${sectionBlueprint.id} safely produced ${selected.length} of ${sectionBlueprint.questionCount} requested questions.`, effect: 'Used the safe coherent size; mandatory constraints remained intact.' });
      const sectionQuestionIds: string[] = []; for (const candidate of selected) { globalPosition += 1; const placementId = `assessment-placement-question-${snapshotKey}-${globalPosition}-${sha256Text(candidate.question.id).slice(0, 8)}`; const parent = candidate.parentType === 'reading-passage' ? this.passageById.get(candidate.parentId ?? '') : candidate.parentType === 'listening-activity' ? this.activityById.get(candidate.parentId ?? '') : undefined; const baseSeconds = candidate.question.examMetadata?.recommendedSeconds ?? 45; const estimatedSeconds = candidate.parentType === 'listening-activity' && parent && 'estimatedDurationSeconds' in parent ? Math.max(baseSeconds, Math.ceil(parent.estimatedDurationSeconds / parent.questionIds.length) + 20) : baseSeconds; questionPlacements.push({ id: placementId, sectionId, questionId: candidate.question.id, position: globalPosition, domain: candidate.domain, questionType: candidate.type, parentType: candidate.parentType, parentId: candidate.parentId, primaryTargetId: candidate.targetId, estimatedSeconds }); sectionQuestionIds.push(placementId); }
      let parentPosition = 0; const sectionParentIds: string[] = []; for (const parent of parentSelection.parents) { parentPosition += 1; const id = `assessment-placement-parent-${snapshotKey}-${sectionBlueprint.order}-${parentPosition}-${sha256Text(parent.parentId).slice(0, 8)}`; parentPlacements.push({ id, sectionId, parentType: parent.parentType, parentId: parent.parentId, position: parentPosition, questionIds: parent.questionIds }); sectionParentIds.push(id); }
      sections.push({ id: sectionId, blueprintSectionId: sectionBlueprint.id, title: sectionBlueprint.title, order: sectionBlueprint.order, recommendedMinutes: sectionBlueprint.recommendedMinutes, strictTimeLimit: config.strictTimeLimit, questionPlacementIds: sectionQuestionIds, parentPlacementIds: sectionParentIds });
    }
    if (!questionPlacements.length) throw new Error('No safe questions satisfy the mandatory assessment constraints.');
    const base: Omit<AssessmentSnapshot, 'checksum'> = { schemaVersion: 1, id: `assessment-snapshot-${snapshotKey}`, assessmentType: config.assessmentType, level: config.level, seed: config.seed, contentVersion: this.catalog.contentVersion, pipelineVersion: this.catalog.pipelineVersion, generationTimestamp: this.catalog.generationTimestamp ?? '2000-01-01T00:00:00.000Z', lifecycleMode: config.lifecycleMode, blueprintId: blueprint.id, configuration: config, sections, questionPlacements, parentPlacements, scoringRule: { id: `assessment-scoring-${snapshotKey}`, ordinaryQuestionPoints: 1, unansweredPoints: 0, negativeMarking: false, domainWeights: {}, label: 'JapanGo raw score' }, timingRule: { id: `assessment-timing-${snapshotKey}`, mode: config.strictTimeLimit ? 'strict' : 'recommended', totalMinutes: sections.reduce((sum, section) => sum + section.recommendedMinutes, 0), sectionTransitionsSeconds: 30, playbackAndReplayIncluded: true, resumable: true }, relaxedConstraints: relaxations, releaseReady: config.lifecycleMode === 'release' };
    return assessmentSnapshotSchema.parse({ ...base, checksum: snapshotChecksum(base) });
  }

  generateFullMockExam(config: AssessmentGenerationConfig, blueprint: AssessmentBlueprint, exposure?: AssessmentExposureInput): AssessmentSnapshot { return this.generateAssessment({ config: { ...config, assessmentType: 'full-mock' }, blueprint, exposure }); }
  generateSectionExam(config: AssessmentGenerationConfig, blueprint: AssessmentBlueprint, exposure?: AssessmentExposureInput): AssessmentSnapshot { return this.generateAssessment({ config: { ...config, assessmentType: 'section-exam' }, blueprint, exposure }); }
  generateQuickPractice(config: AssessmentGenerationConfig, blueprint: AssessmentBlueprint, exposure?: AssessmentExposureInput): AssessmentSnapshot { return this.generateAssessment({ config: { ...config, assessmentType: 'quick-practice' }, blueprint, exposure }); }
  generateDailyChallenge(input: Omit<AssessmentGenerationConfig, 'assessmentType' | 'seed'> & { installationKey: string; date: string; timezone: string }, blueprint: AssessmentBlueprint, exposure?: AssessmentExposureInput): AssessmentSnapshot { const seed = sha256Text(`${input.installationKey}\0${input.date}\0${input.timezone}\0${input.level}\0${this.catalog.contentVersion}`); const { installationKey: _installationKey, date: _date, timezone: _timezone, ...config } = input; return this.generateAssessment({ config: { ...config, assessmentType: 'daily-challenge', seed }, blueprint, exposure }); }
  generateWeakAreaAssessment(config: AssessmentGenerationConfig, blueprint: AssessmentBlueprint, exposure?: AssessmentExposureInput): AssessmentSnapshot { return this.generateAssessment({ config: { ...config, assessmentType: 'weak-area' }, blueprint, exposure }); }
  generateMixedReview(config: AssessmentGenerationConfig, blueprint: AssessmentBlueprint, exposure?: AssessmentExposureInput): AssessmentSnapshot { return this.generateAssessment({ config: { ...config, assessmentType: 'mixed-review' }, blueprint, exposure }); }
  serializeAssessment(snapshot: AssessmentSnapshot): string { return stableStringify(assessmentSnapshotSchema.parse(snapshot)); }
  restoreAssessment(snapshot: AssessmentSnapshot): AssessmentSnapshot { const parsed = assessmentSnapshotSchema.parse(snapshot); const { checksum: _checksum, ...base } = parsed; if (snapshotChecksum(base) !== parsed.checksum) throw new Error('Assessment snapshot checksum mismatch.'); const missing = parsed.questionPlacements.filter(({ questionId }) => !this.questions.has(questionId)).map(({ questionId }) => questionId); if (missing.length) throw new Error(`Assessment snapshot is incompatible; missing question IDs: ${missing.join(', ')}`); return parsed; }
  validateAssessment(snapshot: AssessmentSnapshot): string[] { const errors: string[] = []; try { this.restoreAssessment(snapshot); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); } const ids = snapshot.questionPlacements.map(({ questionId }) => questionId); if (new Set(ids).size !== ids.length) errors.push('Assessment contains a duplicate question.'); const parentIds = snapshot.parentPlacements.map(({ parentId }) => parentId); if (new Set(parentIds).size !== parentIds.length) errors.push('Assessment contains a duplicate parent.'); for (const parent of snapshot.parentPlacements) { const source = parent.parentType === 'reading-passage' ? this.passageById.get(parent.parentId) : this.activityById.get(parent.parentId); if (!source || source.questionIds.some((id) => !parent.questionIds.includes(id)) || parent.questionIds.some((id) => !source.questionIds.includes(id))) errors.push(`Parent group ${parent.parentId} is incomplete.`); } return [...new Set(errors)].sort(compareStable); }
}
