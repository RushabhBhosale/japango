import type { LearningContentCollections } from "../../src/features/learning-content/schemas";

interface ReferencedRecord {
  id: string;
  releaseReady: boolean;
}

export interface LearningContentReferenceCatalog {
  vocabulary: readonly ReferencedRecord[];
  kanji: readonly ReferencedRecord[];
  grammar: readonly ReferencedRecord[];
  curriculumUnits: readonly ReferencedRecord[];
  sourceIds: ReadonlySet<string>;
}

function recordMap(
  records: readonly ReferencedRecord[],
): ReadonlyMap<string, ReferencedRecord> {
  return new Map(records.map((record) => [record.id, record]));
}

function missingOrNonReleaseReference(
  ownerId: string,
  label: string,
  targetId: string,
  target: ReferencedRecord | undefined,
  ownerReleaseReady: boolean,
): string[] {
  if (!target) return [`${ownerId} references missing ${label} ${targetId}`];
  return ownerReleaseReady && !target.releaseReady
    ? [`${ownerId} is release-ready but references non-release ${label} ${targetId}`]
    : [];
}

export function learningContentRelationshipErrors(
  content: LearningContentCollections,
  catalog: LearningContentReferenceCatalog,
): string[] {
  const errors: string[] = [];
  const vocabularyById = recordMap(catalog.vocabulary);
  const kanjiById = recordMap(catalog.kanji);
  const grammarById = recordMap(catalog.grammar);
  const unitById = recordMap(catalog.curriculumUnits);
  const sentenceById = new Map(
    content.sentences.map((sentence) => [sentence.id, sentence]),
  );
  const questionById = new Map(
    content.questions.map((question) => [question.id, question]),
  );
  const passageById = new Map(
    content.readingPassages.map((passage) => [passage.id, passage]),
  );
  const listeningById = new Map(content.listeningActivities.map((activity) => [activity.id, activity]));

  const currentIds = [
    ...catalog.vocabulary,
    ...catalog.kanji,
    ...catalog.grammar,
    ...catalog.curriculumUnits,
  ].map(({ id }) => id);
  const learningIds = [
    ...content.sentences,
    ...content.readingPassages,
    ...content.listeningSpeakers,
    ...content.listeningActivities,
    ...content.grammarExampleViews,
    ...content.vocabularyExampleViews,
    ...content.kanjiExampleViews,
    ...content.questions,
    ...content.questionOptions,
    ...content.learningItemMetadata,
    ...content.questionTargetRelationships,
  ].map(({ id }) => id);
  const allIds = [...currentIds, ...learningIds];
  const seenIds = new Set<string>();
  for (const id of allIds) {
    if (seenIds.has(id)) errors.push(`Duplicate generated ID: ${id}`);
    seenIds.add(id);
  }

  const linkedSentenceIds = new Set<string>();
  for (const sentence of content.sentences) {
    for (const sourceId of sentence.sourceIds) {
      if (!catalog.sourceIds.has(sourceId)) {
        errors.push(`${sentence.id} references unknown source ${sourceId}`);
      }
    }
    for (const unitId of sentence.curriculumUnitIds) {
      linkedSentenceIds.add(sentence.id);
      if (!unitById.has(unitId)) {
        errors.push(`${sentence.id} references missing curriculum unit ${unitId}`);
      }
    }
    for (const assetId of [
      ...sentence.media.audioAssetIds,
      ...sentence.media.imageAssetIds,
    ]) {
      errors.push(
        `${sentence.id} references ${assetId}, but no media registry exists in this schema version`,
      );
    }
  }
  for (const passage of content.readingPassages) {
    for (const sourceId of passage.sourceIds) {
      if (!catalog.sourceIds.has(sourceId)) errors.push(`${passage.id} references unknown source ${sourceId}`);
    }
    for (const id of passage.grammarIds) errors.push(...missingOrNonReleaseReference(passage.id, "grammar", id, grammarById.get(id), passage.releaseReady));
    for (const id of passage.vocabularyIds) errors.push(...missingOrNonReleaseReference(passage.id, "vocabulary", id, vocabularyById.get(id), passage.releaseReady));
    for (const id of passage.kanjiIds) errors.push(...missingOrNonReleaseReference(passage.id, "kanji", id, kanjiById.get(id), passage.releaseReady));
    for (const id of passage.curriculumUnitIds) errors.push(...missingOrNonReleaseReference(passage.id, "curriculum-unit", id, unitById.get(id), passage.releaseReady));
  }
  for (const activity of content.listeningActivities) {
    for (const sourceId of activity.sourceIds) if (!catalog.sourceIds.has(sourceId)) errors.push(`${activity.id} references unknown source ${sourceId}`);
    for (const id of activity.grammarIds) errors.push(...missingOrNonReleaseReference(activity.id, "grammar", id, grammarById.get(id), activity.releaseReady));
    for (const id of activity.vocabularyIds) errors.push(...missingOrNonReleaseReference(activity.id, "vocabulary", id, vocabularyById.get(id), activity.releaseReady));
    for (const id of activity.kanjiIds) errors.push(...missingOrNonReleaseReference(activity.id, "kanji", id, kanjiById.get(id), activity.releaseReady));
    for (const id of activity.curriculumUnitIds) errors.push(...missingOrNonReleaseReference(activity.id, "curriculum-unit", id, unitById.get(id), activity.releaseReady));
  }

  for (const view of content.grammarExampleViews) {
    linkedSentenceIds.add(view.sentenceId);
    errors.push(
      ...missingOrNonReleaseReference(
        view.id,
        "grammar",
        view.grammarId,
        grammarById.get(view.grammarId),
        view.releaseReady,
      ),
    );
  }
  for (const view of content.vocabularyExampleViews) {
    linkedSentenceIds.add(view.sentenceId);
    errors.push(
      ...missingOrNonReleaseReference(
        view.id,
        "vocabulary",
        view.vocabularyId,
        vocabularyById.get(view.vocabularyId),
        view.releaseReady,
      ),
    );
  }
  for (const view of content.kanjiExampleViews) {
    linkedSentenceIds.add(view.sentenceId);
    errors.push(
      ...missingOrNonReleaseReference(
        view.id,
        "kanji",
        view.kanjiId,
        kanjiById.get(view.kanjiId),
        view.releaseReady,
      ),
    );
  }
  for (const sentence of content.sentences) {
    if (!linkedSentenceIds.has(sentence.id)) {
      errors.push(`${sentence.id} has no curriculum or example-view relationship`);
    }
  }

  for (const question of content.questions) {
    for (const sourceId of question.sourceIds) {
      if (!catalog.sourceIds.has(sourceId)) {
        errors.push(`${question.id} references unknown source ${sourceId}`);
      }
    }
    for (const stimulus of question.stimulusReferences) {
      if (stimulus.type === "sentence") {
        const sentence = sentenceById.get(stimulus.id);
        if (question.releaseReady && sentence && !sentence.releaseReady) {
          errors.push(
            `${question.id} is release-ready but references non-release sentence ${stimulus.id}`,
          );
        }
      } else if (stimulus.type === "reading-passage") {
        const passage = passageById.get(stimulus.id);
        if (!passage) errors.push(`${question.id} references missing reading passage ${stimulus.id}`);
        if (question.releaseReady && passage && !passage.releaseReady) errors.push(`${question.id} is release-ready but references non-release reading passage ${stimulus.id}`);
      } else if (stimulus.type === "listening-activity") {
        const activity = listeningById.get(stimulus.id);
        if (!activity) errors.push(`${question.id} references missing listening activity ${stimulus.id}`);
        if (question.releaseReady && activity && !activity.releaseReady) errors.push(`${question.id} is release-ready but references non-release listening activity ${stimulus.id}`);
      } else {
        errors.push(
          `${question.id} references ${stimulus.id}, but no ${stimulus.type} registry exists in this schema version`,
        );
      }
    }
  }

  for (const option of content.questionOptions) {
    const question = questionById.get(option.questionId);
    if (option.releaseReady && !question?.releaseReady) {
      errors.push(
        `${option.id} is release-ready but its question is not release-ready`,
      );
    }
    if (
      option.content.type === "sentence-reference" &&
      option.releaseReady &&
      !sentenceById.get(option.content.sentenceId)?.releaseReady
    ) {
      errors.push(
        `${option.id} is release-ready but its sentence is not release-ready`,
      );
    }
    if (
      option.content.type === "audio-reference" ||
      option.content.type === "image-reference"
    ) {
      errors.push(
        `${option.id} uses ${option.content.type}, but no media registry exists in this schema version`,
      );
    }
  }

  for (const relationship of content.questionTargetRelationships) {
    const question = questionById.get(relationship.questionId);
    if (relationship.releaseReady && !question?.releaseReady) {
      errors.push(
        `${relationship.id} is release-ready but its question is not release-ready`,
      );
    }
    const target =
      relationship.targetType === "grammar"
        ? grammarById.get(relationship.targetId)
        : relationship.targetType === "vocabulary"
          ? vocabularyById.get(relationship.targetId)
          : relationship.targetType === "kanji"
            ? kanjiById.get(relationship.targetId)
            : relationship.targetType === "sentence"
              ? sentenceById.get(relationship.targetId)
              : relationship.targetType === "reading-passage"
                ? passageById.get(relationship.targetId)
                : listeningById.get(relationship.targetId);
    errors.push(
      ...missingOrNonReleaseReference(
        relationship.id,
        relationship.targetType,
        relationship.targetId,
        target,
        relationship.releaseReady,
      ),
    );
  }

  for (const metadata of content.learningItemMetadata) {
    const target =
      metadata.itemType === "grammar"
        ? grammarById.get(metadata.itemId)
        : metadata.itemType === "vocabulary"
          ? vocabularyById.get(metadata.itemId)
          : metadata.itemType === "kanji"
            ? kanjiById.get(metadata.itemId)
            : metadata.itemType === "sentence"
              ? sentenceById.get(metadata.itemId)
              : questionById.get(metadata.itemId);
    errors.push(
      ...missingOrNonReleaseReference(
        metadata.id,
        metadata.itemType,
        metadata.itemId,
        target,
        metadata.releaseReady,
      ),
    );
  }

  return [...new Set(errors)];
}
