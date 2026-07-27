import { describe, expect, it } from 'vitest';

import {
  importGeneratedContent,
  rollbackGeneratedContentImport,
  selectGeneratedContentForImport,
  type GeneratedContentBundle,
  type GeneratedContentImportBatch,
  type GeneratedContentImportIdentity,
  type GeneratedContentImportStore,
  type GeneratedContentImportTransaction,
  type GeneratedContentRecord,
  type GeneratedLearningContentCollections,
  type PreparedGeneratedContentBundle,
  type VersionedGeneratedContentBundle,
} from './generated-content-import';

type TestRecord = GeneratedContentRecord &
  Readonly<{
    title: string;
  }>;

const readyRecord: TestRecord = {
  id: 'ready-record',
  releaseReady: true,
  title: 'Ready',
};

const reviewRecord: TestRecord = {
  id: 'review-record',
  releaseReady: false,
  title: 'Needs review',
};

const checksumA = `sha256:${'a'.repeat(64)}`;
const checksumB = `sha256:${'b'.repeat(64)}`;
const policy = { supportedSchemaVersions: ['2.0.0'] } as const;

function emptyLearningContent(): GeneratedLearningContentCollections<TestRecord> {
  return {
    schemaVersion: 1,
    sentences: [],
    grammarExampleViews: [],
    vocabularyExampleViews: [],
    kanjiExampleViews: [],
    questions: [],
    questionOptions: [],
    learningItemMetadata: [],
    questionTargetRelationships: [],
  };
}

function releaseBundle(
  overrides: Partial<
    VersionedGeneratedContentBundle<TestRecord, TestRecord, TestRecord>
  > = {},
): VersionedGeneratedContentBundle<TestRecord, TestRecord, TestRecord> {
  return {
    schemaVersion: '2.0.0',
    contentVersion: '2.0.0+fixture',
    checksum: checksumA,
    profile: 'release',
    releaseReadyOnly: true,
    records: [readyRecord, reviewRecord],
    curriculumUnits: [],
    learningContent: emptyLearningContent(),
    ...overrides,
  };
}

function cloneBatches(
  source: ReadonlyMap<string, GeneratedContentImportBatch>,
): Map<string, GeneratedContentImportBatch> {
  return new Map([...source].map(([id, batch]) => [id, { ...batch }]));
}

interface FakeContentSnapshot {
  records: Map<string, TestRecord>;
  curriculumUnits: Map<string, TestRecord>;
  learningRecords: Map<string, TestRecord>;
}

function learningRecords(
  collections: GeneratedLearningContentCollections<TestRecord>,
): TestRecord[] {
  return [
    ...collections.sentences,
    ...collections.grammarExampleViews,
    ...collections.vocabularyExampleViews,
    ...collections.kanjiExampleViews,
    ...collections.questions,
    ...collections.questionOptions,
    ...collections.learningItemMetadata,
    ...collections.questionTargetRelationships,
  ];
}

class FakeImportStore
  implements GeneratedContentImportStore<TestRecord, TestRecord, TestRecord>
{
  records = new Map<string, TestRecord>();
  curriculumUnits = new Map<string, TestRecord>();
  learningRecords = new Map<string, TestRecord>();
  batches = new Map<string, GeneratedContentImportBatch>();
  undoSnapshots = new Map<string, FakeContentSnapshot>();
  lastAppliedBundle?: PreparedGeneratedContentBundle<
    TestRecord,
    TestRecord,
    TestRecord
  >;
  applyCalls = 0;
  restoreCalls = 0;
  failWhileApplying = false;
  private nextBatch = 1;

  constructor(initialRecords: readonly TestRecord[] = []) {
    for (const record of initialRecords) this.records.set(record.id, record);
  }

  async withTransaction<TResult>(
    operation: (
      transaction: GeneratedContentImportTransaction<
        TestRecord,
        TestRecord,
        TestRecord
      >,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    const recordSnapshot = new Map(this.records);
    const curriculumSnapshot = new Map(this.curriculumUnits);
    const learningSnapshot = new Map(this.learningRecords);
    const batchSnapshot = cloneBatches(this.batches);
    const undoSnapshot = new Map(
      [...this.undoSnapshots].map(([id, snapshot]) => [
        id,
        {
          records: new Map(snapshot.records),
          curriculumUnits: new Map(snapshot.curriculumUnits),
          learningRecords: new Map(snapshot.learningRecords),
        },
      ]),
    );
    const nextBatchSnapshot = this.nextBatch;
    const appliedBundleSnapshot = this.lastAppliedBundle;
    const transaction: GeneratedContentImportTransaction<
      TestRecord,
      TestRecord,
      TestRecord
    > = {
      findCompletedImport: async (identity) =>
        [...this.batches.values()].find(
          (batch) =>
            batch.status === 'completed' &&
            batch.profile === identity.profile &&
            batch.schemaVersion === identity.schemaVersion &&
            batch.contentVersion === identity.contentVersion,
        ),
      getImportBatch: async (id) => this.batches.get(id),
      beginImport: async (identity: GeneratedContentImportIdentity) => {
        const batch: GeneratedContentImportBatch = {
          ...identity,
          id: `batch-${this.nextBatch}`,
          status: 'pending',
        };
        this.nextBatch += 1;
        this.batches.set(batch.id, batch);
        this.undoSnapshots.set(batch.id, {
          records: new Map(this.records),
          curriculumUnits: new Map(this.curriculumUnits),
          learningRecords: new Map(this.learningRecords),
        });
        return batch;
      },
      applyBundle: async (_batchId, bundle) => {
        this.applyCalls += 1;
        this.lastAppliedBundle = bundle;
        for (const record of bundle.records) {
          this.records.set(record.id, record);
          if (this.failWhileApplying) throw new Error('simulated write failure');
        }
        for (const unit of bundle.curriculumUnits) {
          this.curriculumUnits.set(unit.id, unit);
        }
        for (const record of learningRecords(bundle.learningContent)) {
          this.learningRecords.set(record.id, record);
        }
      },
      completeImport: async (id) => {
        const batch = this.batches.get(id);
        if (!batch) throw new Error('missing batch');
        this.batches.set(id, { ...batch, status: 'completed' });
      },
      restoreImport: async (id) => {
        const snapshot = this.undoSnapshots.get(id);
        if (!snapshot) throw new Error('missing undo snapshot');
        this.restoreCalls += 1;
        this.records = new Map(snapshot.records);
        this.curriculumUnits = new Map(snapshot.curriculumUnits);
        this.learningRecords = new Map(snapshot.learningRecords);
      },
      markImportRolledBack: async (id) => {
        const batch = this.batches.get(id);
        if (!batch) throw new Error('missing batch');
        this.batches.set(id, { ...batch, status: 'rolled-back' });
      },
    };

    try {
      return await operation(transaction);
    } catch (error) {
      this.records = recordSnapshot;
      this.curriculumUnits = curriculumSnapshot;
      this.learningRecords = learningSnapshot;
      this.batches = batchSnapshot;
      this.undoSnapshots = undoSnapshot;
      this.nextBatch = nextBatchSnapshot;
      this.lastAppliedBundle = appliedBundleSnapshot;
      throw error;
    }
  }
}

describe('selectGeneratedContentForImport', () => {
  it('filters a release-profile bundle to verified release-ready records', () => {
    const bundle: GeneratedContentBundle<TestRecord> = {
      profile: 'release',
      releaseReadyOnly: true,
      records: [readyRecord, reviewRecord],
    };

    expect(
      selectGeneratedContentForImport(bundle, { releaseReadyOnly: true }),
    ).toEqual([readyRecord]);
  });

  it('rejects a development-profile bundle in release mode', () => {
    const bundle: GeneratedContentBundle<TestRecord> = {
      profile: 'development',
      releaseReadyOnly: false,
      records: [readyRecord],
    };

    expect(() =>
      selectGeneratedContentForImport(bundle, { releaseReadyOnly: true }),
    ).toThrow('requires a filtered release-profile content bundle');
  });

  it('includes review content only with the explicit development opt-in', () => {
    const bundle: GeneratedContentBundle<TestRecord> = {
      profile: 'development',
      releaseReadyOnly: false,
      records: [readyRecord, reviewRecord],
    };

    expect(
      selectGeneratedContentForImport(bundle, {
        releaseReadyOnly: false,
        allowDevelopmentContent: true,
      }),
    ).toEqual([readyRecord, reviewRecord]);
  });

  it('rejects malformed readiness metadata instead of silently importing it', () => {
    const malformedBundle = {
      profile: 'release',
      releaseReadyOnly: true,
      records: [{ id: 'malformed-record', releaseReady: 'yes' }],
    } as unknown as GeneratedContentBundle<GeneratedContentRecord>;

    expect(() =>
      selectGeneratedContentForImport(malformedBundle, {
        releaseReadyOnly: true,
      }),
    ).toThrow('invalid releaseReady flag');
  });
});

describe('transactional generated-content import', () => {
  it('imports only release-ready records and treats the same version/checksum as idempotent', async () => {
    const store = new FakeImportStore();

    await expect(
      importGeneratedContent(
        releaseBundle(),
        { releaseReadyOnly: true },
        policy,
        store,
      ),
    ).resolves.toEqual({
      status: 'imported',
      batchId: 'batch-1',
      importedRecords: 1,
      importedCurriculumUnits: 0,
      importedLearningContentRecords: 0,
    });
    await expect(
      importGeneratedContent(
        releaseBundle(),
        { releaseReadyOnly: true },
        policy,
        store,
      ),
    ).resolves.toEqual({
      status: 'already-imported',
      batchId: 'batch-1',
      importedRecords: 0,
      importedCurriculumUnits: 0,
      importedLearningContentRecords: 0,
    });

    expect([...store.records.keys()]).toEqual(['ready-record']);
    expect(store.applyCalls).toBe(1);
    expect(store.batches.size).toBe(1);
    expect(store.lastAppliedBundle?.curriculumUnits).toEqual([]);
    expect(
      learningRecords(store.lastAppliedBundle?.learningContent ?? emptyLearningContent()),
    ).toEqual([]);
  });

  it('imports review records only from an explicit development bundle', async () => {
    const store = new FakeImportStore();
    const bundle = releaseBundle({
      profile: 'development',
      releaseReadyOnly: false,
    });

    const result = await importGeneratedContent(
      bundle,
      { releaseReadyOnly: false, allowDevelopmentContent: true },
      policy,
      store,
    );

    expect(result.importedRecords).toBe(2);
    expect([...store.records.keys()]).toEqual(['ready-record', 'review-record']);
  });

  it('passes the whole bundle to the store in deterministic ID order', async () => {
    const store = new FakeImportStore();
    const unitA: TestRecord = { id: 'unit-a', releaseReady: true, title: 'A' };
    const unitB: TestRecord = { id: 'unit-b', releaseReady: true, title: 'B' };
    const futureA: TestRecord = {
      id: 'question-a',
      releaseReady: true,
      title: 'A',
    };
    const futureB: TestRecord = {
      id: 'question-b',
      releaseReady: true,
      title: 'B',
    };
    const learningContent: GeneratedLearningContentCollections<TestRecord> = {
      ...emptyLearningContent(),
      questions: [futureB, futureA],
    };

    const result = await importGeneratedContent(
      releaseBundle({
        profile: 'development',
        releaseReadyOnly: false,
        records: [reviewRecord, readyRecord],
        curriculumUnits: [unitB, unitA],
        learningContent,
      }),
      { releaseReadyOnly: false, allowDevelopmentContent: true },
      policy,
      store,
    );

    expect(result).toMatchObject({
      importedRecords: 2,
      importedCurriculumUnits: 2,
      importedLearningContentRecords: 2,
    });
    expect(store.lastAppliedBundle?.records.map(({ id }) => id)).toEqual([
      'ready-record',
      'review-record',
    ]);
    expect(store.lastAppliedBundle?.curriculumUnits.map(({ id }) => id)).toEqual([
      'unit-a',
      'unit-b',
    ]);
    expect(
      store.lastAppliedBundle?.learningContent.questions.map(({ id }) => id),
    ).toEqual(['question-a', 'question-b']);
  });

  it('rejects unsupported schemas, malformed checksums, and checksum drift for one content version', async () => {
    const store = new FakeImportStore();
    await expect(
      importGeneratedContent(
        releaseBundle({ schemaVersion: '99.0.0' }),
        { releaseReadyOnly: true },
        policy,
        store,
      ),
    ).rejects.toThrow('is not supported');
    await expect(
      importGeneratedContent(
        releaseBundle({ checksum: 'invalid' }),
        { releaseReadyOnly: true },
        policy,
        store,
      ),
    ).rejects.toThrow('must be a SHA-256 checksum');

    await importGeneratedContent(
      releaseBundle(),
      { releaseReadyOnly: true },
      policy,
      store,
    );
    await expect(
      importGeneratedContent(
        releaseBundle({ checksum: checksumB }),
        { releaseReadyOnly: true },
        policy,
        store,
      ),
    ).rejects.toThrow('has a checksum mismatch');
  });

  it('rolls back every write when applying a batch fails', async () => {
    const store = new FakeImportStore();
    store.failWhileApplying = true;

    await expect(
      importGeneratedContent(
        releaseBundle(),
        { releaseReadyOnly: true },
        policy,
        store,
      ),
    ).rejects.toThrow('simulated write failure');

    expect(store.records.size).toBe(0);
    expect(store.batches.size).toBe(0);
  });

  it('restores the pre-import snapshot and makes explicit rollback idempotent', async () => {
    const oldRecord = { ...readyRecord, title: 'Old title' };
    const store = new FakeImportStore([oldRecord]);
    const imported = await importGeneratedContent(
      releaseBundle(),
      { releaseReadyOnly: true },
      policy,
      store,
    );

    await expect(
      rollbackGeneratedContentImport(imported.batchId, store),
    ).resolves.toEqual({ status: 'rolled-back', batchId: 'batch-1' });
    await expect(
      rollbackGeneratedContentImport(imported.batchId, store),
    ).resolves.toEqual({
      status: 'already-rolled-back',
      batchId: 'batch-1',
    });

    expect(store.records.get(readyRecord.id)).toEqual(oldRecord);
    expect(store.restoreCalls).toBe(1);
  });
});
