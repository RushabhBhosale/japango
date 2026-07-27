export type GeneratedContentProfile = 'release' | 'development';

export type GeneratedContentImportOptions =
  | Readonly<{ releaseReadyOnly: true }>
  | Readonly<{
      releaseReadyOnly: false;
      allowDevelopmentContent: true;
    }>;

export type GeneratedContentRecord = Readonly<{
  id: string;
  releaseReady: boolean;
}>;

export type GeneratedContentBundle<TRecord extends GeneratedContentRecord> =
  Readonly<{
    profile: GeneratedContentProfile;
    releaseReadyOnly: boolean;
    records: readonly TRecord[];
  }>;

export interface GeneratedLearningContentCollections<
  TRecord extends GeneratedContentRecord = GeneratedContentRecord,
> {
  schemaVersion: string | number;
  sentences: readonly TRecord[];
  grammarExampleViews: readonly TRecord[];
  vocabularyExampleViews: readonly TRecord[];
  kanjiExampleViews: readonly TRecord[];
  questions: readonly TRecord[];
  questionOptions: readonly TRecord[];
  learningItemMetadata: readonly TRecord[];
  questionTargetRelationships: readonly TRecord[];
}

export type VersionedGeneratedContentBundle<
  TRecord extends GeneratedContentRecord,
  TCurriculumUnit extends GeneratedContentRecord = GeneratedContentRecord,
  TLearningRecord extends GeneratedContentRecord = GeneratedContentRecord,
> = GeneratedContentBundle<TRecord> &
  Readonly<{
    schemaVersion: string;
    contentVersion: string;
    checksum: string;
    curriculumUnits: readonly TCurriculumUnit[];
    learningContent: GeneratedLearningContentCollections<TLearningRecord>;
  }>;

export interface PreparedGeneratedContentBundle<
  TRecord extends GeneratedContentRecord,
  TCurriculumUnit extends GeneratedContentRecord,
  TLearningRecord extends GeneratedContentRecord,
> {
  records: readonly TRecord[];
  curriculumUnits: readonly TCurriculumUnit[];
  learningContent: GeneratedLearningContentCollections<TLearningRecord>;
}

export interface GeneratedContentImportPolicy {
  supportedSchemaVersions: readonly string[];
}

export interface GeneratedContentImportIdentity {
  profile: GeneratedContentProfile;
  releaseReadyOnly: boolean;
  schemaVersion: string;
  contentVersion: string;
  checksum: string;
}

export interface GeneratedContentImportBatch
  extends GeneratedContentImportIdentity {
  id: string;
  status: 'pending' | 'completed' | 'rolled-back';
}

type ContentVersionIdentity = Pick<
  GeneratedContentImportIdentity,
  'profile' | 'schemaVersion' | 'contentVersion'
>;

/**
 * The concrete SQLite adapter owns row mapping and the undo journal. Every
 * method below is called inside the store transaction supplied to the import.
 */
export interface GeneratedContentImportTransaction<
  TRecord extends GeneratedContentRecord,
  TCurriculumUnit extends GeneratedContentRecord = GeneratedContentRecord,
  TLearningRecord extends GeneratedContentRecord = GeneratedContentRecord,
> {
  findCompletedImport(
    identity: ContentVersionIdentity,
  ): Promise<GeneratedContentImportBatch | undefined>;
  getImportBatch(id: string): Promise<GeneratedContentImportBatch | undefined>;
  beginImport(
    identity: GeneratedContentImportIdentity,
  ): Promise<GeneratedContentImportBatch>;
  applyBundle(
    batchId: string,
    bundle: PreparedGeneratedContentBundle<
      TRecord,
      TCurriculumUnit,
      TLearningRecord
    >,
  ): Promise<void>;
  completeImport(batchId: string): Promise<void>;
  restoreImport(batchId: string): Promise<void>;
  markImportRolledBack(batchId: string): Promise<void>;
}

export interface GeneratedContentImportStore<
  TRecord extends GeneratedContentRecord,
  TCurriculumUnit extends GeneratedContentRecord = GeneratedContentRecord,
  TLearningRecord extends GeneratedContentRecord = GeneratedContentRecord,
> {
  withTransaction<TResult>(
    operation: (
      transaction: GeneratedContentImportTransaction<
        TRecord,
        TCurriculumUnit,
        TLearningRecord
      >,
    ) => Promise<TResult>,
  ): Promise<TResult>;
}

export type GeneratedContentImportResult =
  | Readonly<{
      status: 'imported';
      batchId: string;
      importedRecords: number;
      importedCurriculumUnits: number;
      importedLearningContentRecords: number;
    }>
  | Readonly<{
      status: 'already-imported';
      batchId: string;
      importedRecords: 0;
      importedCurriculumUnits: 0;
      importedLearningContentRecords: 0;
    }>;

export type GeneratedContentRollbackResult = Readonly<{
  status: 'rolled-back' | 'already-rolled-back';
  batchId: string;
}>;

const sha256ChecksumPattern = /^sha256:[0-9a-f]{64}$/u;

function assertValidReadinessFlag(record: GeneratedContentRecord): void {
  if (typeof record.id !== 'string' || !record.id.trim()) {
    throw new Error('Generated content contains a record without a stable ID.');
  }
  if (typeof record.releaseReady !== 'boolean') {
    throw new Error(
      `Generated content record "${record.id}" has an invalid releaseReady flag.`,
    );
  }
}

/**
 * Selects records that a persistence adapter may import. This function remains
 * pure so callers can inspect a bundle without opening SQLite.
 */
export function selectGeneratedContentForImport<
  TRecord extends GeneratedContentRecord,
>(
  bundle: GeneratedContentBundle<TRecord>,
  options: GeneratedContentImportOptions,
): TRecord[] {
  if (options.releaseReadyOnly) {
    if (bundle.profile !== 'release' || bundle.releaseReadyOnly !== true) {
      throw new Error(
        'Release-ready import requires a filtered release-profile content bundle.',
      );
    }

    return bundle.records.filter((record) => {
      assertValidReadinessFlag(record);
      return record.releaseReady === true;
    });
  }

  if (options.allowDevelopmentContent !== true) {
    throw new Error(
      'Development content import requires allowDevelopmentContent: true.',
    );
  }
  if (bundle.profile !== 'development' || bundle.releaseReadyOnly !== false) {
    throw new Error(
      'Development import requires an unfiltered development-profile content bundle.',
    );
  }

  bundle.records.forEach(assertValidReadinessFlag);
  return [...bundle.records];
}

function stableRecordOrder<TRecord extends GeneratedContentRecord>(
  records: readonly TRecord[],
): TRecord[] {
  return [...records].sort((left, right) => {
    const leftOption = left as TRecord & {
      questionId?: unknown;
      position?: unknown;
    };
    const rightOption = right as TRecord & {
      questionId?: unknown;
      position?: unknown;
    };
    if (
      typeof leftOption.questionId === 'string' &&
      typeof rightOption.questionId === 'string' &&
      typeof leftOption.position === 'number' &&
      typeof rightOption.position === 'number'
    ) {
      const questionOrder = leftOption.questionId.localeCompare(
        rightOption.questionId,
        'en',
      );
      if (questionOrder !== 0) return questionOrder;
      const positionOrder = leftOption.position - rightOption.position;
      if (positionOrder !== 0) return positionOrder;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function selectSection<TRecord extends GeneratedContentRecord>(
  records: readonly TRecord[],
  releaseReadyOnly: boolean,
): TRecord[] {
  records.forEach(assertValidReadinessFlag);
  return stableRecordOrder(
    releaseReadyOnly
      ? records.filter(({ releaseReady }) => releaseReady)
      : records,
  );
}

function learningContentRecordCount(
  learningContent: GeneratedLearningContentCollections,
): number {
  return (
    learningContent.sentences.length +
    learningContent.grammarExampleViews.length +
    learningContent.vocabularyExampleViews.length +
    learningContent.kanjiExampleViews.length +
    learningContent.questions.length +
    learningContent.questionOptions.length +
    learningContent.learningItemMetadata.length +
    learningContent.questionTargetRelationships.length
  );
}

function prepareImport<
  TRecord extends GeneratedContentRecord,
  TCurriculumUnit extends GeneratedContentRecord,
  TLearningRecord extends GeneratedContentRecord,
>(
  bundle: VersionedGeneratedContentBundle<
    TRecord,
    TCurriculumUnit,
    TLearningRecord
  >,
  options: GeneratedContentImportOptions,
  policy: GeneratedContentImportPolicy,
): {
  identity: GeneratedContentImportIdentity;
  bundle: PreparedGeneratedContentBundle<
    TRecord,
    TCurriculumUnit,
    TLearningRecord
  >;
} {
  if (!bundle.schemaVersion.trim()) {
    throw new Error('Generated content schemaVersion is required.');
  }
  if (!policy.supportedSchemaVersions.includes(bundle.schemaVersion)) {
    throw new Error(
      `Generated content schema version "${bundle.schemaVersion}" is not supported.`,
    );
  }
  if (!bundle.contentVersion.trim()) {
    throw new Error('Generated content contentVersion is required.');
  }
  if (!sha256ChecksumPattern.test(bundle.checksum)) {
    throw new Error('Generated content checksum must be a SHA-256 checksum.');
  }
  if (
    (typeof bundle.learningContent.schemaVersion !== 'string' &&
      typeof bundle.learningContent.schemaVersion !== 'number') ||
    String(bundle.learningContent.schemaVersion).trim() === ''
  ) {
    throw new Error('Generated learning content schemaVersion is required.');
  }

  const records = stableRecordOrder(
    selectGeneratedContentForImport(bundle, options),
  );
  const curriculumUnits = selectSection(
    bundle.curriculumUnits,
    options.releaseReadyOnly,
  );
  const learningContent: GeneratedLearningContentCollections<TLearningRecord> = {
    schemaVersion: bundle.learningContent.schemaVersion,
    sentences: selectSection(
      bundle.learningContent.sentences,
      options.releaseReadyOnly,
    ),
    grammarExampleViews: selectSection(
      bundle.learningContent.grammarExampleViews,
      options.releaseReadyOnly,
    ),
    vocabularyExampleViews: selectSection(
      bundle.learningContent.vocabularyExampleViews,
      options.releaseReadyOnly,
    ),
    kanjiExampleViews: selectSection(
      bundle.learningContent.kanjiExampleViews,
      options.releaseReadyOnly,
    ),
    questions: selectSection(
      bundle.learningContent.questions,
      options.releaseReadyOnly,
    ),
    questionOptions: selectSection(
      bundle.learningContent.questionOptions,
      options.releaseReadyOnly,
    ),
    learningItemMetadata: selectSection(
      bundle.learningContent.learningItemMetadata,
      options.releaseReadyOnly,
    ),
    questionTargetRelationships: selectSection(
      bundle.learningContent.questionTargetRelationships,
      options.releaseReadyOnly,
    ),
  };
  const ids = new Set<string>();
  for (const record of [
    ...records,
    ...curriculumUnits,
    ...learningContent.sentences,
    ...learningContent.grammarExampleViews,
    ...learningContent.vocabularyExampleViews,
    ...learningContent.kanjiExampleViews,
    ...learningContent.questions,
    ...learningContent.questionOptions,
    ...learningContent.learningItemMetadata,
    ...learningContent.questionTargetRelationships,
  ]) {
    if (ids.has(record.id)) {
      throw new Error(`Generated content contains duplicate record ID "${record.id}".`);
    }
    ids.add(record.id);
  }
  return {
    identity: {
      profile: bundle.profile,
      releaseReadyOnly: bundle.releaseReadyOnly,
      schemaVersion: bundle.schemaVersion,
      contentVersion: bundle.contentVersion,
      checksum: bundle.checksum,
    },
    bundle: { records, curriculumUnits, learningContent },
  };
}

/**
 * Applies one generated bundle atomically. `applyBundle` must record enough
 * before/after state for `restoreImport` to reverse the completed batch later.
 */
export async function importGeneratedContent<
  TRecord extends GeneratedContentRecord,
  TCurriculumUnit extends GeneratedContentRecord,
  TLearningRecord extends GeneratedContentRecord,
>(
  bundle: VersionedGeneratedContentBundle<
    TRecord,
    TCurriculumUnit,
    TLearningRecord
  >,
  options: GeneratedContentImportOptions,
  policy: GeneratedContentImportPolicy,
  store: GeneratedContentImportStore<
    TRecord,
    TCurriculumUnit,
    TLearningRecord
  >,
): Promise<GeneratedContentImportResult> {
  const prepared = prepareImport(bundle, options, policy);
  return store.withTransaction(async (transaction) => {
    const existing = await transaction.findCompletedImport(prepared.identity);
    if (existing) {
      if (existing.checksum !== prepared.identity.checksum) {
        throw new Error(
          `Generated content version "${prepared.identity.contentVersion}" has a checksum mismatch.`,
        );
      }
      if (existing.releaseReadyOnly !== prepared.identity.releaseReadyOnly) {
        throw new Error(
          `Generated content version "${prepared.identity.contentVersion}" has conflicting profile metadata.`,
        );
      }
      return {
        status: 'already-imported',
        batchId: existing.id,
        importedRecords: 0,
        importedCurriculumUnits: 0,
        importedLearningContentRecords: 0,
      };
    }

    const batch = await transaction.beginImport(prepared.identity);
    await transaction.applyBundle(batch.id, prepared.bundle);
    await transaction.completeImport(batch.id);
    return {
      status: 'imported',
      batchId: batch.id,
      importedRecords: prepared.bundle.records.length,
      importedCurriculumUnits: prepared.bundle.curriculumUnits.length,
      importedLearningContentRecords: learningContentRecordCount(
        prepared.bundle.learningContent,
      ),
    };
  });
}

/** Replays a completed batch's undo journal inside one transaction. */
export async function rollbackGeneratedContentImport<
  TRecord extends GeneratedContentRecord,
  TCurriculumUnit extends GeneratedContentRecord = GeneratedContentRecord,
  TLearningRecord extends GeneratedContentRecord = GeneratedContentRecord,
>(
  batchId: string,
  store: GeneratedContentImportStore<
    TRecord,
    TCurriculumUnit,
    TLearningRecord
  >,
): Promise<GeneratedContentRollbackResult> {
  if (!batchId.trim()) throw new Error('An import batch ID is required.');
  return store.withTransaction(async (transaction) => {
    const batch = await transaction.getImportBatch(batchId);
    if (!batch) throw new Error(`Generated content import batch "${batchId}" was not found.`);
    if (batch.status === 'rolled-back') {
      return { status: 'already-rolled-back', batchId };
    }
    if (batch.status !== 'completed') {
      throw new Error(
        `Generated content import batch "${batchId}" is not complete and cannot be rolled back.`,
      );
    }
    await transaction.restoreImport(batchId);
    await transaction.markImportRolledBack(batchId);
    return { status: 'rolled-back', batchId };
  });
}
