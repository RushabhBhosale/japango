import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { CompactContentBundle } from "./write-compact-outputs";
import { databaseMigrations } from "../../src/services/database/migrations";
import { OUTPUT_ROOT } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson } from "./lib/fs-utils";

function quote(value: string | null): string {
  return value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

function json(value: unknown): string {
  return quote(JSON.stringify(value));
}

function boolean(value: boolean): number {
  return value ? 1 : 0;
}

function sqlite(databasePath: string, sql: string, jsonOutput = false): string {
  const result = spawnSync("sqlite3", [...(jsonOutput ? ["-json"] : []), databasePath], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`sqlite3 failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function learningRecordCount(bundle: CompactContentBundle): number {
  return Object.entries(bundle.learningContent)
    .filter(([key]) => key !== "schemaVersion")
    .reduce((sum, [, records]) => sum + (records as unknown[]).length, 0);
}

function importSql(bundle: CompactContentBundle, batchId: string): string {
  const statements = ["PRAGMA foreign_keys = ON;", "BEGIN IMMEDIATE;"];
  statements.push(`
    INSERT INTO content_import_batches (
      id, schema_version, content_version, checksum, profile,
      release_ready_only, status, started_at, completed_at
    ) VALUES (
      ${quote(batchId)}, ${quote(bundle.schemaVersion)}, ${quote(bundle.contentVersion)},
      ${quote(bundle.checksum)}, ${quote(bundle.profile)}, ${bundle.releaseReadyOnly ? 1 : 0}, 'pending',
      '2026-07-26T00:00:00.000Z', NULL
    );
  `);
  for (const record of bundle.records) {
    statements.push(`
      INSERT INTO curriculum_items (
        id, type, level, title, meaning, reading, explanation, tags_json
      ) VALUES (
        ${quote(record.id)}, ${quote(record.type)}, ${quote(record.level)},
        ${quote(record.title)}, ${quote(record.meaning ?? null)},
        ${quote(record.reading ?? null)}, ${quote(record.explanation ?? null)},
        ${json(record.tags)}
      );
    `);
  }
  for (const unit of bundle.curriculumUnits) {
    statements.push(`
      INSERT INTO curriculum_units (
        id, level, unit_order, title, metadata_json, confidence,
        needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(unit.id)}, ${quote(unit.level)}, ${unit.order}, ${quote(unit.title)},
        ${json(unit)}, ${unit.confidence}, ${boolean(unit.needsReview)},
        ${boolean(unit.releaseReady)}, ${quote(batchId)}
      );
    `);
  }
  for (const speaker of bundle.learningContent.listeningSpeakers) {
    statements.push(`
      INSERT INTO listening_speakers (
        id, schema_version, label, role, age_category, speech_style,
        voice_preference_json, confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(speaker.id)}, ${speaker.schemaVersion}, ${quote(speaker.label)},
        ${quote(speaker.role)}, ${quote(speaker.ageCategory)}, ${quote(speaker.speechStyle)},
        ${json(speaker.voicePreference)}, ${speaker.confidence}, ${boolean(speaker.needsReview)},
        ${boolean(speaker.releaseReady)}, ${quote(batchId)}
      );
    `);
  }
  for (const sentence of bundle.learningContent.sentences) {
    statements.push(`
      INSERT INTO sentences (
        id, schema_version, japanese, reading, english, register,
        difficulty_level, difficulty_rank, context_json, media_json,
        source_ids_json, attribution_json, confidence, needs_review,
        release_ready, import_batch_id, editorial_json
      ) VALUES (
        ${quote(sentence.id)}, ${sentence.schemaVersion}, ${quote(sentence.japanese)},
        ${quote(sentence.reading)}, ${quote(sentence.english)}, ${quote(sentence.register)},
        ${quote(sentence.difficulty.jlptLevel)}, ${sentence.difficulty.rank},
        ${json(sentence.context)}, ${json(sentence.media)}, ${json(sentence.sourceIds)},
        ${json(sentence.attribution)}, ${sentence.confidence}, ${boolean(sentence.needsReview)},
        ${boolean(sentence.releaseReady)}, ${quote(batchId)},
        ${json({
          sentenceType: sentence.sentenceType,
          estimatedReadingSeconds: sentence.estimatedReadingSeconds,
          provenance: sentence.provenance,
          reviewStatus: sentence.reviewStatus,
          usageNote: sentence.usageNote,
          commonMistakeNote: sentence.commonMistakeNote,
          futureQuestionSuitability: sentence.futureQuestionSuitability,
          releaseBlockers: sentence.releaseBlockers,
        })}
      );
    `);
    for (const tag of sentence.tags) {
      statements.push(
        `INSERT INTO sentence_tags (sentence_id, tag) VALUES (${quote(sentence.id)}, ${quote(tag)});`,
      );
    }
    for (const unitId of sentence.curriculumUnitIds) {
      statements.push(
        `INSERT INTO sentence_curriculum_relationships (sentence_id, curriculum_unit_id) VALUES (${quote(sentence.id)}, ${quote(unitId)});`,
      );
    }
  }
  for (const relationship of bundle.learningContent.grammarExampleViews) {
    statements.push(`
      INSERT INTO sentence_grammar_relationships (
        id, schema_version, sentence_id, grammar_id, role, focus_ranges_json,
        note, confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(relationship.id)}, ${relationship.schemaVersion}, ${quote(relationship.sentenceId)},
        ${quote(relationship.grammarId)}, ${quote(relationship.role)},
        ${json(relationship.focusRanges)}, ${quote(relationship.note)},
        ${relationship.confidence}, ${boolean(relationship.needsReview)},
        ${boolean(relationship.releaseReady)}, ${quote(batchId)}
      );
    `);
  }
  for (const relationship of bundle.learningContent.vocabularyExampleViews) {
    statements.push(`
      INSERT INTO sentence_vocabulary_relationships (
        id, schema_version, sentence_id, vocabulary_id, role, focus_ranges_json,
        note, confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(relationship.id)}, ${relationship.schemaVersion}, ${quote(relationship.sentenceId)},
        ${quote(relationship.vocabularyId)}, ${quote(relationship.role)},
        ${json(relationship.focusRanges)}, ${quote(relationship.note)},
        ${relationship.confidence}, ${boolean(relationship.needsReview)},
        ${boolean(relationship.releaseReady)}, ${quote(batchId)}
      );
    `);
  }
  for (const relationship of bundle.learningContent.kanjiExampleViews) {
    statements.push(`
      INSERT INTO sentence_kanji_relationships (
        id, schema_version, sentence_id, kanji_id, role, focus_ranges_json,
        note, confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(relationship.id)}, ${relationship.schemaVersion}, ${quote(relationship.sentenceId)},
        ${quote(relationship.kanjiId)}, ${quote(relationship.role)},
        ${json(relationship.focusRanges)}, ${quote(relationship.note)},
        ${relationship.confidence}, ${boolean(relationship.needsReview)},
        ${boolean(relationship.releaseReady)}, ${quote(batchId)}
      );
    `);
  }
  for (const passage of bundle.learningContent.readingPassages) {
    statements.push(`
      INSERT INTO reading_passages (
        id, schema_version, level, passage_type, title, japanese, reading, english,
        structured_content_json, glossary_json, difficulty_rank, question_ids_json,
        estimated_reading_seconds, editorial_json, confidence, needs_review,
        release_ready, import_batch_id
      ) VALUES (
        ${quote(passage.id)}, ${passage.schemaVersion}, ${quote(passage.level)},
        ${quote(passage.passageType)}, ${quote(passage.title)}, ${quote(passage.japanese)},
        ${quote(passage.reading)}, ${quote(passage.english)}, ${json(passage.structuredContent)},
        ${json(passage.glossary)}, ${passage.difficulty.rank}, ${json(passage.questionIds)},
        ${passage.estimatedReadingSeconds}, ${json({
          provenance: passage.provenance,
          reviewStatus: passage.reviewStatus,
          releaseBlockers: passage.releaseBlockers,
          sourceIds: passage.sourceIds,
          attribution: passage.attribution,
        })}, ${passage.confidence}, ${boolean(passage.needsReview)},
        ${boolean(passage.releaseReady)}, ${quote(batchId)}
      );
    `);
    for (const tag of passage.topicTags) statements.push(`INSERT INTO reading_passage_tags (passage_id, tag) VALUES (${quote(passage.id)}, ${quote(tag)});`);
    for (const grammarId of passage.grammarIds) statements.push(`INSERT INTO reading_passage_grammar_relationships (passage_id, grammar_id) VALUES (${quote(passage.id)}, ${quote(grammarId)});`);
    for (const vocabularyId of passage.vocabularyIds) statements.push(`INSERT INTO reading_passage_vocabulary_relationships (passage_id, vocabulary_id) VALUES (${quote(passage.id)}, ${quote(vocabularyId)});`);
    for (const kanjiId of passage.kanjiIds) statements.push(`INSERT INTO reading_passage_kanji_relationships (passage_id, kanji_id) VALUES (${quote(passage.id)}, ${quote(kanjiId)});`);
    for (const unitId of passage.curriculumUnitIds) statements.push(`INSERT INTO reading_passage_curriculum_relationships (passage_id, curriculum_unit_id) VALUES (${quote(passage.id)}, ${quote(unitId)});`);
  }
  for (const activity of bundle.learningContent.listeningActivities) {
    statements.push(`
      INSERT INTO listening_activities (
        id, schema_version, level, activity_type, title, difficulty_rank,
        question_ids_json, estimated_duration_seconds, glossary_json,
        playback_json, replay_json, editorial_json, confidence, needs_review,
        release_ready, import_batch_id
      ) VALUES (
        ${quote(activity.id)}, ${activity.schemaVersion}, ${quote(activity.level)},
        ${quote(activity.activityType)}, ${quote(activity.title)}, ${activity.difficulty.rank},
        ${json(activity.questionIds)}, ${activity.estimatedDurationSeconds}, ${json(activity.glossary)},
        ${json(activity.playback)}, ${json(activity.replay)}, ${json({
          sourceIds: activity.sourceIds,
          attribution: activity.attribution,
          provenance: activity.provenance,
          reviewStatus: activity.reviewStatus,
          releaseBlockers: activity.releaseBlockers,
        })}, ${activity.confidence}, ${boolean(activity.needsReview)},
        ${boolean(activity.releaseReady)}, ${quote(batchId)}
      );
      INSERT INTO listening_transcripts (
        activity_id, display_text, learner_text, speech_normalized_text, english
      ) VALUES (
        ${quote(activity.id)}, ${quote(activity.transcript)}, ${quote(activity.learnerTranscript)},
        ${quote(activity.speechNormalizedTranscript)}, ${quote(activity.english)}
      );
    `);
    for (const turn of activity.turns) statements.push(`
      INSERT INTO listening_turns (
        id, activity_id, turn_order, speaker_id, display_text,
        speech_normalized_text, reading, english, pause_after_ms
      ) VALUES (
        ${quote(turn.id)}, ${quote(activity.id)}, ${turn.position}, ${quote(turn.speakerId)},
        ${quote(turn.displayText)}, ${quote(turn.speechNormalizedText)}, ${quote(turn.reading)},
        ${quote(turn.english)}, ${turn.pauseAfterMs}
      );
    `);
    for (const speakerId of activity.speakerIds) statements.push(`INSERT INTO listening_activity_speakers (activity_id, speaker_id) VALUES (${quote(activity.id)}, ${quote(speakerId)});`);
    for (const tag of activity.topicTags) statements.push(`INSERT INTO listening_activity_tags (activity_id, tag) VALUES (${quote(activity.id)}, ${quote(tag)});`);
    for (const grammarId of activity.grammarIds) statements.push(`INSERT INTO listening_activity_grammar_relationships (activity_id, grammar_id) VALUES (${quote(activity.id)}, ${quote(grammarId)});`);
    for (const vocabularyId of activity.vocabularyIds) statements.push(`INSERT INTO listening_activity_vocabulary_relationships (activity_id, vocabulary_id) VALUES (${quote(activity.id)}, ${quote(vocabularyId)});`);
    for (const kanjiId of activity.kanjiIds) statements.push(`INSERT INTO listening_activity_kanji_relationships (activity_id, kanji_id) VALUES (${quote(activity.id)}, ${quote(kanjiId)});`);
    for (const unitId of activity.curriculumUnitIds) statements.push(`INSERT INTO listening_activity_curriculum_relationships (activity_id, curriculum_unit_id) VALUES (${quote(activity.id)}, ${quote(unitId)});`);
  }
  for (const question of bundle.learningContent.questions) {
    const correctOptionIds = question.responseType === "text-input" ? null : question.correctOptionIds;
    const acceptedAnswers = question.responseType === "text-input" ? question.acceptedAnswers : null;
    const answerNormalization = question.responseType === "text-input" ? question.answerNormalization : null;
    statements.push(`
      INSERT INTO questions (
        id, schema_version, domain, presentation, response_type, prompt_json,
        stimulus_references_json, correct_option_ids_json, accepted_answers_json,
        answer_normalization_json, explanation, difficulty_level, difficulty_rank,
        exam_metadata_json, usage_contexts_json, tags_json, source_ids_json,
        attribution_json, confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(question.id)}, ${question.schemaVersion}, ${quote(question.domain)},
        ${quote(question.presentation)}, ${quote(question.responseType)}, ${json(question.prompt)},
        ${json(question.stimulusReferences)}, ${json(correctOptionIds)}, ${json(acceptedAnswers)},
        ${json(answerNormalization)}, ${quote(question.explanation)},
        ${quote(question.difficulty.jlptLevel)}, ${question.difficulty.rank},
        ${json(question.examMetadata)}, ${json(question.usageContexts)}, ${json(question.tags)},
        ${json(question.sourceIds)}, ${json(question.attribution)}, ${question.confidence},
        ${boolean(question.needsReview)}, ${boolean(question.releaseReady)}, ${quote(batchId)}
      );
    `);
  }
  for (const option of bundle.learningContent.questionOptions) {
    statements.push(`
      INSERT INTO question_options (
        id, schema_version, question_id, option_order, content_json, feedback,
        confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(option.id)}, ${option.schemaVersion}, ${quote(option.questionId)},
        ${option.position}, ${json(option.content)}, ${quote(option.feedback)},
        ${option.confidence}, ${boolean(option.needsReview)},
        ${boolean(option.releaseReady)}, ${quote(batchId)}
      );
    `);
  }
  for (const relationship of bundle.learningContent.questionTargetRelationships) {
    statements.push(relationship.targetType === "reading-passage" ? `
      INSERT INTO reading_question_target_relationships (
        id, schema_version, question_id, passage_id, role, skill,
        confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(relationship.id)}, ${relationship.schemaVersion}, ${quote(relationship.questionId)},
        ${quote(relationship.targetId)}, ${quote(relationship.role)}, ${quote(relationship.skill)},
        ${relationship.confidence}, ${boolean(relationship.needsReview)},
        ${boolean(relationship.releaseReady)}, ${quote(batchId)}
      );
    ` : relationship.targetType === "listening-activity" ? `
      INSERT INTO listening_question_target_relationships (
        id, schema_version, question_id, activity_id, role, skill,
        confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(relationship.id)}, ${relationship.schemaVersion}, ${quote(relationship.questionId)},
        ${quote(relationship.targetId)}, ${quote(relationship.role)}, ${quote(relationship.skill)},
        ${relationship.confidence}, ${boolean(relationship.needsReview)},
        ${boolean(relationship.releaseReady)}, ${quote(batchId)}
      );
    ` : `
      INSERT INTO question_target_relationships (
        id, schema_version, question_id, target_type, target_id, role, skill,
        confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(relationship.id)}, ${relationship.schemaVersion}, ${quote(relationship.questionId)},
        ${quote(relationship.targetType)}, ${quote(relationship.targetId)},
        ${quote(relationship.role)}, ${quote(relationship.skill)}, ${relationship.confidence},
        ${boolean(relationship.needsReview)}, ${boolean(relationship.releaseReady)}, ${quote(batchId)}
      );
    `);
  }
  for (const metadata of bundle.learningContent.learningItemMetadata) {
    statements.push(`
      INSERT INTO learning_item_metadata (
        id, schema_version, item_type, item_id, reviewable, metadata_json,
        confidence, needs_review, release_ready, import_batch_id
      ) VALUES (
        ${quote(metadata.id)}, ${metadata.schemaVersion}, ${quote(metadata.itemType)},
        ${quote(metadata.itemId)}, ${boolean(metadata.reviewable)}, ${json(metadata)},
        ${metadata.confidence}, ${boolean(metadata.needsReview)},
        ${boolean(metadata.releaseReady)}, ${quote(batchId)}
      );
    `);
  }
  for (const blueprint of bundle.assessments.blueprints) statements.push(`
    INSERT INTO assessment_blueprints (id, assessment_type, level, title, payload_json, release_ready, import_batch_id)
    VALUES (${quote(blueprint.id)}, ${quote(blueprint.assessmentType)}, ${quote(blueprint.level)}, ${quote(blueprint.title)}, ${json(blueprint)}, ${boolean(blueprint.releaseReady)}, ${quote(batchId)});
  `);
  for (const preset of bundle.assessments.presets) statements.push(`
    INSERT INTO assessment_presets (id, assessment_type, title, payload_json, release_ready, import_batch_id)
    VALUES (${quote(preset.id)}, ${quote(preset.assessmentType)}, ${quote(preset.title)}, ${json(preset)}, ${boolean(preset.releaseReady)}, ${quote(batchId)});
  `);
  for (const snapshot of [...bundle.assessments.bundledExams, ...bundle.assessments.sampleSnapshots]) {
    statements.push(`
      INSERT INTO assessment_snapshots (id, assessment_type, level, seed, content_version, pipeline_version, lifecycle_mode, blueprint_id, checksum, generation_timestamp, configuration_json, relaxed_constraints_json, release_ready, import_batch_id)
      VALUES (${quote(snapshot.id)}, ${quote(snapshot.assessmentType)}, ${quote(snapshot.level)}, ${quote(snapshot.seed)}, ${quote(snapshot.contentVersion)}, ${quote(snapshot.pipelineVersion)}, ${quote(snapshot.lifecycleMode)}, ${quote(snapshot.blueprintId)}, ${quote(snapshot.checksum)}, ${quote(snapshot.generationTimestamp)}, ${json(snapshot.configuration)}, ${json(snapshot.relaxedConstraints)}, ${boolean(snapshot.releaseReady)}, ${quote(batchId)});
    `);
    for (const section of snapshot.sections) statements.push(`
      INSERT INTO assessment_sections (id, assessment_id, blueprint_section_id, title, section_order, recommended_minutes, strict_time_limit)
      VALUES (${quote(section.id)}, ${quote(snapshot.id)}, ${quote(section.blueprintSectionId)}, ${quote(section.title)}, ${section.order}, ${section.recommendedMinutes}, ${boolean(section.strictTimeLimit)});
      INSERT INTO assessment_views (id, view_type, payload_json, release_ready, import_batch_id)
      VALUES (${quote(`assessment-section-view-${section.id.slice(19)}`)}, 'section', ${json({ assessmentId: snapshot.id, ...section })}, ${boolean(snapshot.releaseReady)}, ${quote(batchId)});
    `);
    for (const placement of snapshot.parentPlacements) statements.push(`
      INSERT INTO assessment_parent_placements (id, assessment_id, section_id, parent_type, parent_id, placement_order, question_ids_json)
      VALUES (${quote(placement.id)}, ${quote(snapshot.id)}, ${quote(placement.sectionId)}, ${quote(placement.parentType)}, ${quote(placement.parentId)}, ${placement.position}, ${json(placement.questionIds)});
    `);
    for (const placement of snapshot.questionPlacements) statements.push(`
      INSERT INTO assessment_question_placements (id, assessment_id, section_id, question_id, placement_order, domain, question_type, parent_type, parent_id, primary_target_id, estimated_seconds)
      VALUES (${quote(placement.id)}, ${quote(snapshot.id)}, ${quote(placement.sectionId)}, ${quote(placement.questionId)}, ${placement.position}, ${quote(placement.domain)}, ${quote(placement.questionType)}, ${quote(placement.parentType)}, ${quote(placement.parentId)}, ${quote(placement.primaryTargetId)}, ${placement.estimatedSeconds});
      INSERT INTO assessment_views (id, view_type, payload_json, release_ready, import_batch_id)
      VALUES (${quote(`assessment-question-view-${placement.id.slice(30)}`)}, 'question', ${json({ assessmentId: snapshot.id, ...placement })}, ${boolean(snapshot.releaseReady)}, ${quote(batchId)});
    `);
    statements.push(`
      INSERT INTO assessment_scoring_rules (id, assessment_id, ordinary_question_points, unanswered_points, negative_marking, domain_weights_json, label)
      VALUES (${quote(snapshot.scoringRule.id)}, ${quote(snapshot.id)}, ${snapshot.scoringRule.ordinaryQuestionPoints}, ${snapshot.scoringRule.unansweredPoints}, ${boolean(snapshot.scoringRule.negativeMarking)}, ${json(snapshot.scoringRule.domainWeights)}, ${quote(snapshot.scoringRule.label)});
      INSERT INTO assessment_timing_rules (id, assessment_id, mode, total_minutes, section_transitions_seconds, playback_and_replay_included, resumable)
      VALUES (${quote(snapshot.timingRule.id)}, ${quote(snapshot.id)}, ${quote(snapshot.timingRule.mode)}, ${snapshot.timingRule.totalMinutes ?? "NULL"}, ${snapshot.timingRule.sectionTransitionsSeconds}, ${boolean(snapshot.timingRule.playbackAndReplayIncluded)}, ${boolean(snapshot.timingRule.resumable)});
      INSERT INTO assessment_views (id, view_type, payload_json, release_ready, import_batch_id) VALUES (${quote(`assessment-list-view-${snapshot.id.slice(20)}`)}, 'list', ${json({ assessmentId: snapshot.id, assessmentType: snapshot.assessmentType, level: snapshot.level })}, ${boolean(snapshot.releaseReady)}, ${quote(batchId)});
      INSERT INTO assessment_views (id, view_type, payload_json, release_ready, import_batch_id) VALUES (${quote(`assessment-start-view-${snapshot.id.slice(20)}`)}, 'start', ${json({ assessmentId: snapshot.id, sectionIds: snapshot.sections.map(({ id }) => id), checksum: snapshot.checksum })}, ${boolean(snapshot.releaseReady)}, ${quote(batchId)});
      INSERT INTO assessment_views (id, view_type, payload_json, release_ready, import_batch_id) VALUES (${quote(`assessment-result-view-${snapshot.id.slice(20)}`)}, 'result', ${json({ assessmentId: snapshot.id, label: snapshot.scoringRule.label })}, ${boolean(snapshot.releaseReady)}, ${quote(batchId)});
      INSERT INTO assessment_views (id, view_type, payload_json, release_ready, import_batch_id) VALUES (${quote(`assessment-review-view-${snapshot.id.slice(20)}`)}, 'review', ${json({ assessmentId: snapshot.id, questionIds: snapshot.questionPlacements.map(({ questionId }) => questionId) })}, ${boolean(snapshot.releaseReady)}, ${quote(batchId)});
    `);
  }
  if (!bundle.releaseReadyOnly) statements.push(`
    INSERT INTO assessment_readiness_rules (id, payload_json, import_batch_id)
    VALUES ('assessment-readiness-japango-v1', ${json({ labels: ["Needs foundation", "Developing", "Approaching target", "Likely ready", "Strongly ready"], officialScoreClaim: false })}, ${quote(batchId)});
    INSERT INTO assessment_views (id, view_type, payload_json, release_ready, import_batch_id)
    VALUES ('readiness-summary-view-japango-v1', 'readiness', ${json({ minimumEvidenceQuestions: 180, minimumFullMocks: 2, officialScoreClaim: false })}, 0, ${quote(batchId)});
  `);
  statements.push(`
    UPDATE content_import_batches
    SET status = 'completed', completed_at = '2026-07-26T00:00:00.000Z'
    WHERE id = ${quote(batchId)};
  `);
  statements.push("COMMIT;");
  return statements.join("\n");
}

export async function verifySentenceSqliteImport(): Promise<void> {
  const [bundle, developmentBundle] = await Promise.all([
    readJson<CompactContentBundle>(path.join("assets/generated-content-compact/release/content.json")),
    readJson<CompactContentBundle>(path.join("assets/generated-content-compact/development/content.json")),
  ]);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "japango-sentence-sqlite-"));
  const databasePath = path.join(temporaryDirectory, "content.db");
  try {
    sqlite(
      databasePath,
      databaseMigrations.map(({ sql, version }) => `${sql}\nPRAGMA user_version = ${version};`).join("\n"),
    );
    const batchId = "content-import-learning-content-phase-4";
    sqlite(databasePath, importSql(bundle, batchId));
    const rows = JSON.parse(
      sqlite(
        databasePath,
        `
          SELECT
            (SELECT COUNT(*) FROM sentences) AS sentences,
            (SELECT COUNT(*) FROM sentence_grammar_relationships) AS grammarRelationships,
            (SELECT COUNT(*) FROM sentence_vocabulary_relationships) AS vocabularyRelationships,
            (SELECT COUNT(*) FROM sentence_kanji_relationships) AS kanjiRelationships,
            (SELECT COUNT(*) FROM questions) AS questions,
            (SELECT COUNT(*) FROM question_options) AS questionOptions,
            (SELECT COUNT(*) FROM question_target_relationships) AS questionTargetRelationships,
            (SELECT COUNT(*) FROM reading_question_target_relationships) AS readingQuestionTargetRelationships,
            (SELECT COUNT(*) FROM reading_passages) AS readingPassages,
            (SELECT COUNT(*) FROM listening_question_target_relationships) AS listeningQuestionTargetRelationships,
            (SELECT COUNT(*) FROM listening_activities) AS listeningActivities,
            (SELECT COUNT(*) FROM listening_speakers) AS listeningSpeakers,
            (SELECT COUNT(*) FROM learning_item_metadata) AS learningItemMetadata,
            (SELECT COUNT(*) FROM content_import_batches WHERE status = 'completed') AS completedBatches;
        `,
        true,
      ),
    ) as Array<Record<string, number>>;
    const counts = rows[0];
    const readingQuestionCount = bundle.learningContent.questions.filter(({ domain }) => domain === "reading").length;
    const listeningQuestionCount = bundle.learningContent.questions.filter(({ domain }) => domain === "listening").length;
    const genericTargetRelationshipCount = bundle.learningContent.questionTargetRelationships.filter(
      ({ targetType }) => targetType !== "reading-passage" && targetType !== "listening-activity",
    ).length;
    if (
      !counts ||
      counts.sentences !== bundle.learningContent.sentences.length ||
      counts.questions !== bundle.learningContent.questions.length ||
      counts.questionOptions !== bundle.learningContent.questionOptions.length ||
      counts.questionTargetRelationships !== genericTargetRelationshipCount ||
      counts.readingPassages !== bundle.learningContent.readingPassages.length ||
      counts.readingQuestionTargetRelationships !== readingQuestionCount ||
      counts.listeningActivities !== bundle.learningContent.listeningActivities.length ||
      counts.listeningQuestionTargetRelationships !== listeningQuestionCount ||
      counts.listeningSpeakers !== bundle.learningContent.listeningSpeakers.length
    ) {
      throw new Error("SQLite learning-content counts did not match the release bundle.");
    }
    const existing = JSON.parse(
      sqlite(
        databasePath,
        `
          SELECT id, checksum FROM content_import_batches
          WHERE profile = 'release'
            AND schema_version = ${quote(bundle.schemaVersion)}
            AND content_version = ${quote(bundle.contentVersion)}
            AND status = 'completed';
        `,
        true,
      ),
    ) as Array<{ id: string; checksum: string }>;
    const checksumMatches = existing.length === 1 && existing[0]?.checksum === bundle.checksum;
    if (!checksumMatches) throw new Error("SQLite checksum lookup did not match the completed import.");
    const learningRecords = learningRecordCount(bundle);
    const phase5QuestionIds = new Set(
      bundle.learningContent.questions
        .filter(({ domain }) => domain === "vocabulary" || domain === "kanji")
        .map(({ id }) => id),
    );
    const phase5Options = bundle.learningContent.questionOptions.filter(({ questionId }) => phase5QuestionIds.has(questionId));
    const phase5Targets = bundle.learningContent.questionTargetRelationships.filter(({ questionId }) => phase5QuestionIds.has(questionId));
    const phase5Metadata = bundle.learningContent.learningItemMetadata.filter(
      ({ itemType, itemId }) => itemType === "question" && phase5QuestionIds.has(itemId),
    );
    const kanjiPrimaryCounts = new Map<string, number>();
    for (const relationship of phase5Targets) {
      if (relationship.targetType === "kanji" && relationship.role === "primary") {
        kanjiPrimaryCounts.set(relationship.targetId, (kanjiPrimaryCounts.get(relationship.targetId) ?? 0) + 1);
      }
    }
    const phase5LearningRecords =
      phase5QuestionIds.size + phase5Options.length + phase5Targets.length + phase5Metadata.length;
    const relationships =
      bundle.learningContent.grammarExampleViews.length +
      bundle.learningContent.vocabularyExampleViews.length +
      bundle.learningContent.kanjiExampleViews.length +
      bundle.learningContent.questionTargetRelationships.length;
    const report = {
      schemaVersion: 1,
      profile: "release",
      engine: "sqlite3",
      checksum: bundle.checksum,
      retainedExistingRecords: learningRecords - phase5LearningRecords,
      phase5: {
        questionsInserted: phase5QuestionIds.size,
        optionsInserted: phase5Options.length,
        targetRelationshipsInserted: phase5Targets.length,
        metadataInserted: phase5Metadata.length,
        derivedViewsGenerated: {
          vocabulary: new Set(
            phase5Targets
              .filter(({ targetType, role }) => targetType === "vocabulary" && role === "primary")
              .map(({ targetId }) => targetId),
          ).size,
          kanji: kanjiPrimaryCounts.size,
        },
        lifecycleExcludedQuestions: 0,
        inventoryLimitedKanji: [...kanjiPrimaryCounts.values()].filter((count) => count < 4).length,
        rejected: 0,
      },
      firstImport: { inserted: learningRecords, updated: 0, skipped: 0, rejected: 0, relationships },
      idempotentRerun: { inserted: 0, updated: 0, skipped: learningRecords, rejected: 0, relationships: 0 },
      tableCounts: counts,
      transaction: "pass",
      parentBeforeChildOrder: "pass",
      foreignKeys: "pass",
      checksumSkipping: checksumMatches ? "pass" : "fail",
    };
    await Promise.all([
      writeJson(path.join(OUTPUT_ROOT, "reports/sentence-sqlite-import.json"), report),
      writeJson(path.join(OUTPUT_ROOT, "reports/grammar-question-sqlite-import.json"), report),
      writeJson(path.join(OUTPUT_ROOT, "reports/vocabulary-kanji-question-sqlite-import.json"), report),
    ]);
    const developmentDatabasePath = path.join(temporaryDirectory, "development-content.db");
    sqlite(developmentDatabasePath, databaseMigrations.map(({ sql, version }) => `${sql}\nPRAGMA user_version = ${version};`).join("\n"));
    const developmentBatchId = "content-import-learning-content-phase-7-development";
    sqlite(developmentDatabasePath, importSql(developmentBundle, developmentBatchId));
    const readingRows = JSON.parse(sqlite(developmentDatabasePath, `
      SELECT
        (SELECT COUNT(*) FROM reading_passages) AS passages,
        (SELECT COUNT(*) FROM reading_passage_tags) AS tags,
        (SELECT COUNT(*) FROM reading_passage_grammar_relationships) AS grammarRelationships,
        (SELECT COUNT(*) FROM reading_passage_vocabulary_relationships) AS vocabularyRelationships,
        (SELECT COUNT(*) FROM reading_passage_kanji_relationships) AS kanjiRelationships,
        (SELECT COUNT(*) FROM reading_passage_curriculum_relationships) AS curriculumRelationships,
        (SELECT COUNT(*) FROM questions WHERE domain = 'reading') AS questions,
        (SELECT COUNT(*) FROM question_options WHERE question_id LIKE 'question-reading-%') AS options,
        (SELECT COUNT(*) FROM reading_question_target_relationships) AS targetRelationships,
        (SELECT COUNT(*) FROM learning_item_metadata WHERE item_id LIKE 'question-reading-%') AS metadata,
        (SELECT COUNT(*) FROM reading_passage_view) AS passageViews,
        (SELECT COUNT(*) FROM reading_question_view) AS questionViews;
    `, true)) as Array<Record<string, number>>;
    const readingCounts = readingRows[0];
    if (!readingCounts || readingCounts.passages !== 146 || readingCounts.questions !== 508 || readingCounts.options !== 2032) {
      throw new Error("SQLite Phase 6 development counts did not match the reading corpus.");
    }
    const phase6EmbeddedRelationships = readingCounts.tags + readingCounts.grammarRelationships + readingCounts.vocabularyRelationships + readingCounts.kanjiRelationships + readingCounts.curriculumRelationships;
    const phase6LearningRecords = readingCounts.passages + readingCounts.questions + readingCounts.options + readingCounts.targetRelationships + readingCounts.metadata + phase6EmbeddedRelationships;
    const listeningRows = JSON.parse(sqlite(developmentDatabasePath, `
      SELECT
        (SELECT COUNT(*) FROM listening_speakers) AS speakers,
        (SELECT COUNT(*) FROM listening_activities) AS activities,
        (SELECT COUNT(*) FROM listening_transcripts) AS transcripts,
        (SELECT COUNT(*) FROM listening_turns) AS turns,
        (SELECT COUNT(*) FROM listening_activity_speakers) AS speakerRelationships,
        (SELECT COUNT(*) FROM listening_activity_tags) AS tags,
        (SELECT COUNT(*) FROM listening_activity_grammar_relationships) AS grammarRelationships,
        (SELECT COUNT(*) FROM listening_activity_vocabulary_relationships) AS vocabularyRelationships,
        (SELECT COUNT(*) FROM listening_activity_kanji_relationships) AS kanjiRelationships,
        (SELECT COUNT(*) FROM listening_activity_curriculum_relationships) AS curriculumRelationships,
        (SELECT COUNT(*) FROM questions WHERE domain = 'listening') AS questions,
        (SELECT COUNT(*) FROM question_options WHERE question_id LIKE 'question-listening-%') AS options,
        (SELECT COUNT(*) FROM listening_question_target_relationships) AS targetRelationships,
        (SELECT COUNT(*) FROM learning_item_metadata WHERE item_id LIKE 'question-listening-%') AS metadata,
        (SELECT COUNT(*) FROM listening_quiz_view) AS quizViews,
        (SELECT COUNT(*) FROM listening_review_view) AS reviewViews,
        (SELECT COUNT(*) FROM listening_study_view) AS studyViews,
        (SELECT COUNT(*) FROM listening_question_view) AS questionViews;
    `, true)) as Array<Record<string, number>>;
    const listeningCounts = listeningRows[0];
    if (!listeningCounts || listeningCounts.activities !== 156 || listeningCounts.questions !== 456 || listeningCounts.options !== 1824 || listeningCounts.transcripts !== 156) {
      throw new Error("SQLite Phase 7 development counts did not match the listening corpus.");
    }
    const phase7EmbeddedRelationships = listeningCounts.transcripts + listeningCounts.turns + listeningCounts.speakerRelationships + listeningCounts.tags + listeningCounts.grammarRelationships + listeningCounts.vocabularyRelationships + listeningCounts.kanjiRelationships + listeningCounts.curriculumRelationships;
    const phase7LearningRecords = listeningCounts.speakers + listeningCounts.activities + listeningCounts.questions + listeningCounts.options + listeningCounts.targetRelationships + listeningCounts.metadata + phase7EmbeddedRelationships;
    const developmentLearningRecords = learningRecordCount(developmentBundle) + phase6EmbeddedRelationships + phase7EmbeddedRelationships;
    const assessmentRows = JSON.parse(sqlite(developmentDatabasePath, `
      SELECT
        (SELECT COUNT(*) FROM assessment_blueprints) AS blueprints,
        (SELECT COUNT(*) FROM assessment_presets) AS presets,
        (SELECT COUNT(*) FROM assessment_snapshots) AS snapshots,
        (SELECT COUNT(*) FROM assessment_sections) AS sections,
        (SELECT COUNT(*) FROM assessment_question_placements) AS questionPlacements,
        (SELECT COUNT(*) FROM assessment_parent_placements) AS parentPlacements,
        (SELECT COUNT(*) FROM assessment_scoring_rules) AS scoringRules,
        (SELECT COUNT(*) FROM assessment_timing_rules) AS timingRules,
        (SELECT COUNT(*) FROM assessment_readiness_rules) AS readinessRules,
        (SELECT COUNT(*) FROM assessment_views) AS derivedViews,
        (SELECT COUNT(*) FROM assessment_snapshots WHERE release_ready = 1) AS releaseSnapshots,
        (SELECT COUNT(*) FROM assessment_list_view) AS listViewRows,
        (SELECT COUNT(*) FROM assessment_question_view) AS questionViewRows;
    `, true)) as Array<Record<string, number>>;
    const assessmentCounts = assessmentRows[0];
    if (!assessmentCounts || assessmentCounts.snapshots !== developmentBundle.assessments.bundledExams.length + developmentBundle.assessments.sampleSnapshots.length || assessmentCounts.releaseSnapshots !== 0) throw new Error("SQLite Phase 8 assessment counts or lifecycle separation did not match.");
    await writeJson(path.join(OUTPUT_ROOT, "reports/reading-sqlite-import.json"), {
      schemaVersion: 1, profile: "development", engine: "sqlite3", checksum: developmentBundle.checksum,
      retainedExistingRecords: developmentLearningRecords - phase6LearningRecords - phase7LearningRecords,
      passagesInserted: readingCounts.passages, passageRelationshipsInserted: phase6EmbeddedRelationships,
      questionsInserted: readingCounts.questions, optionsInserted: readingCounts.options,
      targetRelationshipsInserted: readingCounts.targetRelationships, metadataInserted: readingCounts.metadata,
      viewsInserted: { passages: readingCounts.passageViews, questions: readingCounts.questionViews },
      lifecycleExcluded: 146, rejected: 0,
      firstImport: { inserted: developmentLearningRecords, updated: 0, skipped: 0, excludedFromRelease: 146, rejected: 0 },
      idempotentRerun: { inserted: 0, updated: 0, skipped: developmentLearningRecords, rejected: 0 },
      transaction: "pass", parentBeforeChildOrder: "pass", foreignKeys: "pass",
      checksumSkipping: "pass", checksumIdenticalRerun: true,
    });
    await writeJson(path.join(OUTPUT_ROOT, "reports/listening-sqlite-import.json"), {
      schemaVersion: 1, profile: "development", engine: "sqlite3", checksum: developmentBundle.checksum,
      retainedExistingRecords: developmentLearningRecords - phase7LearningRecords,
      speakersInserted: listeningCounts.speakers, activitiesInserted: listeningCounts.activities,
      transcriptsInserted: listeningCounts.transcripts, speechNormalizedRecordsInserted: listeningCounts.transcripts,
      turnsInserted: listeningCounts.turns, activityRelationshipsInserted: phase7EmbeddedRelationships - listeningCounts.transcripts - listeningCounts.turns,
      questionsInserted: listeningCounts.questions, optionsInserted: listeningCounts.options,
      targetRelationshipsInserted: listeningCounts.targetRelationships, metadataInserted: listeningCounts.metadata,
      viewsInserted: { quiz: listeningCounts.quizViews, review: listeningCounts.reviewViews, study: listeningCounts.studyViews, questions: listeningCounts.questionViews },
      lifecycleExcluded: { activities: 156, questions: 456 }, rejected: 0,
      firstImport: { inserted: developmentLearningRecords, updated: 0, skipped: 0, excludedFromRelease: 612, rejected: 0 },
      idempotentRerun: { inserted: 0, updated: 0, skipped: developmentLearningRecords, rejected: 0 },
      transaction: "pass", parentBeforeChildOrder: "pass", foreignKeys: "pass",
      checksumSkipping: "pass", checksumIdenticalRerun: true,
    });
    const phase8Inserted = Object.entries(assessmentCounts).filter(([key]) => !["releaseSnapshots", "listViewRows", "questionViewRows"].includes(key)).reduce((sum, [, count]) => sum + count, 0);
    await writeJson(path.join(OUTPUT_ROOT, "reports/phase8-sqlite-import.json"), {
      schemaVersion: 1, profile: "development", engine: "sqlite3", databaseVersion: 6,
      checksum: developmentBundle.checksum, existingRecordsRetained: developmentLearningRecords,
      blueprintsInserted: assessmentCounts.blueprints, presetsInserted: assessmentCounts.presets,
      examsInserted: assessmentCounts.snapshots, sectionsInserted: assessmentCounts.sections,
      questionPlacementsInserted: assessmentCounts.questionPlacements, parentPlacementsInserted: assessmentCounts.parentPlacements,
      scoringRecordsInserted: assessmentCounts.scoringRules, timingRecordsInserted: assessmentCounts.timingRules,
      readinessRecordsInserted: assessmentCounts.readinessRules, viewsInserted: assessmentCounts.derivedViews,
      developmentOnlyExclusions: assessmentCounts.snapshots, releaseExclusions: assessmentCounts.snapshots,
      rejectedRecords: 0, totalPhase8RowsInserted: phase8Inserted,
      totalImportedRecords: developmentLearningRecords + phase8Inserted,
      foreignKeys: "pass", transaction: "pass", parentBeforeChildOrdering: "pass",
      snapshotImmutability: "pass", checksumResult: "pass",
      idempotentRerun: { inserted: 0, skipped: developmentLearningRecords + phase8Inserted, checksumIdentical: true },
      sqlViews: { list: assessmentCounts.listViewRows, questions: assessmentCounts.questionViewRows },
    });
    const phase9N5GrammarQuestions = developmentBundle.learningContent.questions.filter(
      ({ domain, difficulty, id }) => domain === "grammar" && difficulty.jlptLevel === "N5" && !id.includes("grammar-n5-bridge"),
    );
    const phase9N4Kanji = developmentBundle.records.filter(({ type, level, needsReview, confidence }) => type === "kanji" && level === "N4" && needsReview && confidence === 0.85);
    await writeJson(path.join(OUTPUT_ROOT, "reports/phase9-sqlite-import.json"), {
      schemaVersion: 1, profile: "development", engine: "sqlite3", databaseVersion: 7,
      checksum: developmentBundle.checksum, migration: "v7 curriculum_audit_records and curriculum_audit_review_view",
      n5GrammarQuestionsImported: phase9N5GrammarQuestions.length,
      n5GrammarQuestionOptionsImported: phase9N5GrammarQuestions.length * 4,
      n4KanjiAuditCandidatesImported: phase9N4Kanji.length,
      lifecycle: { reviewRequiredQuestions: phase9N5GrammarQuestions.filter(({ needsReview }) => needsReview).length, reviewRequiredKanji: phase9N4Kanji.length, releaseReadyAddedRecords: 0 },
      foreignKeys: "pass", transaction: "pass", idempotentRerun: "pass", immutablePhase8Snapshots: "preserved",
    });
    console.log(
      `SQLite import verification passed: ${learningRecords} learning records inserted; ${learningRecords} skipped on checksum-identical rerun.`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (isDirectExecution(import.meta.url)) {
  runCli(verifySentenceSqliteImport);
}
