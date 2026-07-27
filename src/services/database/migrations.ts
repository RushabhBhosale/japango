export const CURRENT_DATABASE_VERSION = 16;

export interface DatabaseMigration {
  version: number;
  sql: string;
}

export interface MigrationDatabase {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string): Promise<T | null>;
  withTransactionAsync(operation: () => Promise<void>): Promise<void>;
}

const versionOneSql = `
  CREATE TABLE IF NOT EXISTS learner_profile (
    id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    daily_goal_minutes INTEGER NOT NULL DEFAULT 10,
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    assessment_completed INTEGER NOT NULL DEFAULT 0,
    assessment_score INTEGER,
    learner_level TEXT,
    assessment_result_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS curriculum_items (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    level TEXT NOT NULL,
    title TEXT NOT NULL,
    meaning TEXT,
    reading TEXT,
    explanation TEXT,
    tags_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assessment_questions (
    id TEXT PRIMARY KEY NOT NULL,
    position INTEGER NOT NULL UNIQUE,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    curriculum_item_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    passage TEXT,
    options_json TEXT NOT NULL,
    correct_option_id TEXT NOT NULL,
    explanation TEXT NOT NULL,
    FOREIGN KEY (curriculum_item_id) REFERENCES curriculum_items(id)
  );

  CREATE TABLE IF NOT EXISTS learning_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    question_id TEXT,
    lesson_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    correct INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    selected_answer TEXT,
    expected_answer TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (lesson_id, question_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id),
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id)
  );

  CREATE TABLE IF NOT EXISTS user_mastery (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    mastery_score INTEGER NOT NULL DEFAULT 0,
    confidence_score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    average_response_time_ms INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at TEXT,
    next_review_at TEXT,
    review_interval_days REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    PRIMARY KEY (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id),
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id)
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS learning_attempts_created_at_idx
    ON learning_attempts(created_at DESC);
  CREATE INDEX IF NOT EXISTS user_mastery_status_idx
    ON user_mastery(status, next_review_at);
`;

const versionTwoSql = `
  CREATE TABLE IF NOT EXISTS content_import_batches (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version TEXT NOT NULL,
    content_version TEXT NOT NULL,
    checksum TEXT NOT NULL,
    profile TEXT NOT NULL CHECK (profile IN ('release', 'development')),
    release_ready_only INTEGER NOT NULL CHECK (release_ready_only IN (0, 1)),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'rolled-back')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    rolled_back_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS content_import_batches_active_identity_idx
    ON content_import_batches(profile, schema_version, content_version)
    WHERE status IN ('pending', 'completed');

  CREATE TABLE IF NOT EXISTS content_import_state (
    profile TEXT PRIMARY KEY NOT NULL CHECK (profile IN ('release', 'development')),
    active_batch_id TEXT,
    previous_batch_id TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (active_batch_id) REFERENCES content_import_batches(id),
    FOREIGN KEY (previous_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS content_import_changes (
    batch_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence >= 0),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    previous_json TEXT,
    next_json TEXT,
    PRIMARY KEY (batch_id, sequence),
    FOREIGN KEY (batch_id) REFERENCES content_import_batches(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS content_import_changes_entity_idx
    ON content_import_changes(entity_type, entity_id);

  CREATE TABLE IF NOT EXISTS curriculum_units (
    id TEXT PRIMARY KEY NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('N5', 'N4')),
    unit_order INTEGER NOT NULL CHECK (unit_order > 0),
    title TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS sentences (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    japanese TEXT NOT NULL,
    reading TEXT NOT NULL,
    english TEXT NOT NULL,
    register TEXT NOT NULL,
    difficulty_level TEXT CHECK (difficulty_level IN ('N5', 'N4')),
    difficulty_rank INTEGER NOT NULL CHECK (difficulty_rank BETWEEN 1 AND 5),
    context_json TEXT NOT NULL,
    media_json TEXT NOT NULL,
    source_ids_json TEXT NOT NULL,
    attribution_json TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS sentence_tags (
    sentence_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (sentence_id, tag),
    FOREIGN KEY (sentence_id) REFERENCES sentences(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sentence_grammar_relationships (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    sentence_id TEXT NOT NULL,
    grammar_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('focus', 'supporting')),
    focus_ranges_json TEXT NOT NULL,
    note TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (sentence_id) REFERENCES sentences(id) ON DELETE CASCADE,
    FOREIGN KEY (grammar_id) REFERENCES curriculum_items(id),
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS sentence_vocabulary_relationships (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    sentence_id TEXT NOT NULL,
    vocabulary_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('focus', 'supporting')),
    focus_ranges_json TEXT NOT NULL,
    note TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (sentence_id) REFERENCES sentences(id) ON DELETE CASCADE,
    FOREIGN KEY (vocabulary_id) REFERENCES curriculum_items(id),
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS sentence_kanji_relationships (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    sentence_id TEXT NOT NULL,
    kanji_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('focus', 'supporting')),
    focus_ranges_json TEXT NOT NULL,
    note TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (sentence_id) REFERENCES sentences(id) ON DELETE CASCADE,
    FOREIGN KEY (kanji_id) REFERENCES curriculum_items(id),
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS sentence_curriculum_relationships (
    sentence_id TEXT NOT NULL,
    curriculum_unit_id TEXT NOT NULL,
    PRIMARY KEY (sentence_id, curriculum_unit_id),
    FOREIGN KEY (sentence_id) REFERENCES sentences(id) ON DELETE CASCADE,
    FOREIGN KEY (curriculum_unit_id) REFERENCES curriculum_units(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS sentence_grammar_target_idx
    ON sentence_grammar_relationships(grammar_id, sentence_id);
  CREATE INDEX IF NOT EXISTS sentence_vocabulary_target_idx
    ON sentence_vocabulary_relationships(vocabulary_id, sentence_id);
  CREATE INDEX IF NOT EXISTS sentence_kanji_target_idx
    ON sentence_kanji_relationships(kanji_id, sentence_id);
  CREATE INDEX IF NOT EXISTS sentence_curriculum_unit_idx
    ON sentence_curriculum_relationships(curriculum_unit_id, sentence_id);

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    domain TEXT NOT NULL CHECK (
      domain IN ('grammar', 'vocabulary', 'kanji', 'reading', 'listening')
    ),
    presentation TEXT NOT NULL CHECK (
      presentation IN ('multiple-choice', 'choose-reading', 'fill-blank', 'sentence-order', 'short-answer')
    ),
    response_type TEXT NOT NULL CHECK (
      response_type IN ('single-select', 'multiple-select', 'ordering', 'text-input')
    ),
    prompt_json TEXT NOT NULL,
    stimulus_references_json TEXT NOT NULL,
    correct_option_ids_json TEXT,
    accepted_answers_json TEXT,
    answer_normalization_json TEXT,
    explanation TEXT,
    difficulty_level TEXT CHECK (difficulty_level IN ('N5', 'N4')),
    difficulty_rank INTEGER NOT NULL CHECK (difficulty_rank BETWEEN 1 AND 5),
    exam_metadata_json TEXT,
    usage_contexts_json TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    source_ids_json TEXT NOT NULL,
    attribution_json TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS question_options (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    option_order INTEGER NOT NULL CHECK (option_order > 0),
    content_json TEXT NOT NULL,
    feedback TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    UNIQUE (question_id, option_order),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS learning_item_metadata (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    item_type TEXT NOT NULL CHECK (
      item_type IN ('grammar', 'vocabulary', 'kanji', 'sentence', 'question')
    ),
    item_id TEXT NOT NULL,
    reviewable INTEGER NOT NULL CHECK (reviewable IN (0, 1)),
    metadata_json TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    UNIQUE (item_type, item_id),
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS question_target_relationships (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (
      target_type IN ('grammar', 'vocabulary', 'kanji', 'sentence')
    ),
    target_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('primary', 'supporting', 'distractor-source')),
    skill TEXT NOT NULL CHECK (
      skill IN ('meaning', 'reading', 'form', 'usage', 'comprehension', 'listening')
    ),
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS review_queue (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    learning_item_metadata_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (
      reason IN ('manual', 'weak', 'due', 'lesson-followup', 'assessment-followup')
    ),
    status TEXT NOT NULL CHECK (
      status IN ('queued', 'in-progress', 'completed', 'dismissed')
    ),
    position INTEGER NOT NULL CHECK (position >= 0),
    source_attempt_id TEXT,
    enqueued_at TEXT NOT NULL,
    available_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (learning_item_metadata_id) REFERENCES learning_item_metadata(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS review_queue_due_idx
    ON review_queue(user_id, status, available_at, position);
  CREATE INDEX IF NOT EXISTS question_target_lookup_idx
    ON question_target_relationships(target_type, target_id, question_id);
  CREATE INDEX IF NOT EXISTS question_primary_target_idx
    ON question_target_relationships(question_id, role);

  CREATE VIEW IF NOT EXISTS grammar_example_view AS
    SELECT
      relationships.grammar_id,
      relationships.id AS example_id,
      relationships.role,
      relationships.focus_ranges_json,
      sentences.id AS sentence_id,
      sentences.japanese,
      sentences.reading,
      sentences.english,
      sentences.register,
      sentences.difficulty_level,
      sentences.difficulty_rank,
      sentences.release_ready
    FROM sentence_grammar_relationships AS relationships
    INNER JOIN sentences ON sentences.id = relationships.sentence_id;

  CREATE VIEW IF NOT EXISTS vocabulary_example_view AS
    SELECT
      relationships.vocabulary_id,
      relationships.id AS example_id,
      relationships.role,
      relationships.focus_ranges_json,
      sentences.id AS sentence_id,
      sentences.japanese,
      sentences.reading,
      sentences.english,
      sentences.register,
      sentences.difficulty_level,
      sentences.difficulty_rank,
      sentences.release_ready
    FROM sentence_vocabulary_relationships AS relationships
    INNER JOIN sentences ON sentences.id = relationships.sentence_id;

  CREATE VIEW IF NOT EXISTS kanji_example_view AS
    SELECT
      relationships.kanji_id,
      relationships.id AS example_id,
      relationships.role,
      relationships.focus_ranges_json,
      sentences.id AS sentence_id,
      sentences.japanese,
      sentences.reading,
      sentences.english,
      sentences.register,
      sentences.difficulty_level,
      sentences.difficulty_rank,
      sentences.release_ready
    FROM sentence_kanji_relationships AS relationships
    INNER JOIN sentences ON sentences.id = relationships.sentence_id;
`;

const versionThreeSql = `
  ALTER TABLE sentences ADD COLUMN editorial_json TEXT NOT NULL DEFAULT '{}';
`;

const versionFourSql = `
  CREATE TABLE IF NOT EXISTS reading_passages (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('N5', 'N4')),
    passage_type TEXT NOT NULL CHECK (passage_type IN ('short', 'medium', 'practical')),
    title TEXT,
    japanese TEXT NOT NULL,
    reading TEXT NOT NULL,
    english TEXT NOT NULL,
    structured_content_json TEXT,
    glossary_json TEXT NOT NULL,
    difficulty_rank INTEGER NOT NULL CHECK (difficulty_rank BETWEEN 1 AND 5),
    question_ids_json TEXT NOT NULL,
    estimated_reading_seconds INTEGER NOT NULL CHECK (estimated_reading_seconds > 0),
    editorial_json TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS reading_passage_tags (
    passage_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (passage_id, tag),
    FOREIGN KEY (passage_id) REFERENCES reading_passages(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS reading_passage_grammar_relationships (
    passage_id TEXT NOT NULL, grammar_id TEXT NOT NULL,
    PRIMARY KEY (passage_id, grammar_id),
    FOREIGN KEY (passage_id) REFERENCES reading_passages(id) ON DELETE CASCADE,
    FOREIGN KEY (grammar_id) REFERENCES curriculum_items(id)
  );
  CREATE TABLE IF NOT EXISTS reading_passage_vocabulary_relationships (
    passage_id TEXT NOT NULL, vocabulary_id TEXT NOT NULL,
    PRIMARY KEY (passage_id, vocabulary_id),
    FOREIGN KEY (passage_id) REFERENCES reading_passages(id) ON DELETE CASCADE,
    FOREIGN KEY (vocabulary_id) REFERENCES curriculum_items(id)
  );
  CREATE TABLE IF NOT EXISTS reading_passage_kanji_relationships (
    passage_id TEXT NOT NULL, kanji_id TEXT NOT NULL,
    PRIMARY KEY (passage_id, kanji_id),
    FOREIGN KEY (passage_id) REFERENCES reading_passages(id) ON DELETE CASCADE,
    FOREIGN KEY (kanji_id) REFERENCES curriculum_items(id)
  );
  CREATE TABLE IF NOT EXISTS reading_passage_curriculum_relationships (
    passage_id TEXT NOT NULL, curriculum_unit_id TEXT NOT NULL,
    PRIMARY KEY (passage_id, curriculum_unit_id),
    FOREIGN KEY (passage_id) REFERENCES reading_passages(id) ON DELETE CASCADE,
    FOREIGN KEY (curriculum_unit_id) REFERENCES curriculum_units(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reading_question_target_relationships (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    passage_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('primary', 'supporting', 'distractor-source')),
    skill TEXT NOT NULL CHECK (
      skill IN ('meaning', 'reading', 'form', 'usage', 'comprehension', 'listening')
    ),
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (passage_id) REFERENCES reading_passages(id) ON DELETE CASCADE,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );
  CREATE INDEX IF NOT EXISTS reading_question_target_lookup_idx
    ON reading_question_target_relationships(passage_id, question_id);

  CREATE VIEW IF NOT EXISTS reading_passage_view AS
    SELECT id, level, passage_type, title, difficulty_rank,
      estimated_reading_seconds, release_ready
    FROM reading_passages;
  CREATE VIEW IF NOT EXISTS reading_question_view AS
    SELECT questions.id AS question_id, targets.passage_id AS passage_id,
      questions.difficulty_level, questions.difficulty_rank,
      questions.release_ready
    FROM questions
    INNER JOIN reading_question_target_relationships AS targets
      ON targets.question_id = questions.id
    WHERE questions.domain = 'reading'
      AND targets.role = 'primary';
`;

const versionFiveSql = `
  CREATE TABLE IF NOT EXISTS listening_speakers (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    label TEXT NOT NULL,
    role TEXT NOT NULL,
    age_category TEXT,
    speech_style TEXT NOT NULL,
    voice_preference_json TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS listening_activities (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('N5', 'N4')),
    activity_type TEXT NOT NULL CHECK (
      activity_type IN ('short-monologue', 'dialogue', 'practical-information', 'appropriate-response')
    ),
    title TEXT NOT NULL,
    difficulty_rank INTEGER NOT NULL CHECK (difficulty_rank BETWEEN 1 AND 5),
    question_ids_json TEXT NOT NULL,
    estimated_duration_seconds INTEGER NOT NULL CHECK (estimated_duration_seconds > 0),
    glossary_json TEXT NOT NULL,
    playback_json TEXT NOT NULL,
    replay_json TEXT NOT NULL,
    editorial_json TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );

  CREATE TABLE IF NOT EXISTS listening_transcripts (
    activity_id TEXT PRIMARY KEY NOT NULL,
    display_text TEXT NOT NULL,
    learner_text TEXT,
    speech_normalized_text TEXT NOT NULL,
    english TEXT NOT NULL,
    FOREIGN KEY (activity_id) REFERENCES listening_activities(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS listening_turns (
    id TEXT PRIMARY KEY NOT NULL,
    activity_id TEXT NOT NULL,
    turn_order INTEGER NOT NULL CHECK (turn_order > 0),
    speaker_id TEXT NOT NULL,
    display_text TEXT NOT NULL,
    speech_normalized_text TEXT NOT NULL,
    reading TEXT NOT NULL,
    english TEXT NOT NULL,
    pause_after_ms INTEGER NOT NULL CHECK (pause_after_ms BETWEEN 0 AND 3000),
    UNIQUE (activity_id, turn_order),
    FOREIGN KEY (activity_id) REFERENCES listening_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (speaker_id) REFERENCES listening_speakers(id)
  );

  CREATE TABLE IF NOT EXISTS listening_activity_speakers (
    activity_id TEXT NOT NULL, speaker_id TEXT NOT NULL,
    PRIMARY KEY (activity_id, speaker_id),
    FOREIGN KEY (activity_id) REFERENCES listening_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (speaker_id) REFERENCES listening_speakers(id)
  );
  CREATE TABLE IF NOT EXISTS listening_activity_tags (
    activity_id TEXT NOT NULL, tag TEXT NOT NULL,
    PRIMARY KEY (activity_id, tag),
    FOREIGN KEY (activity_id) REFERENCES listening_activities(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS listening_activity_grammar_relationships (
    activity_id TEXT NOT NULL, grammar_id TEXT NOT NULL,
    PRIMARY KEY (activity_id, grammar_id),
    FOREIGN KEY (activity_id) REFERENCES listening_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (grammar_id) REFERENCES curriculum_items(id)
  );
  CREATE TABLE IF NOT EXISTS listening_activity_vocabulary_relationships (
    activity_id TEXT NOT NULL, vocabulary_id TEXT NOT NULL,
    PRIMARY KEY (activity_id, vocabulary_id),
    FOREIGN KEY (activity_id) REFERENCES listening_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (vocabulary_id) REFERENCES curriculum_items(id)
  );
  CREATE TABLE IF NOT EXISTS listening_activity_kanji_relationships (
    activity_id TEXT NOT NULL, kanji_id TEXT NOT NULL,
    PRIMARY KEY (activity_id, kanji_id),
    FOREIGN KEY (activity_id) REFERENCES listening_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (kanji_id) REFERENCES curriculum_items(id)
  );
  CREATE TABLE IF NOT EXISTS listening_activity_curriculum_relationships (
    activity_id TEXT NOT NULL, curriculum_unit_id TEXT NOT NULL,
    PRIMARY KEY (activity_id, curriculum_unit_id),
    FOREIGN KEY (activity_id) REFERENCES listening_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (curriculum_unit_id) REFERENCES curriculum_units(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS listening_question_target_relationships (
    id TEXT PRIMARY KEY NOT NULL,
    schema_version INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('primary', 'supporting', 'distractor-source')),
    skill TEXT NOT NULL CHECK (
      skill IN ('meaning', 'reading', 'form', 'usage', 'comprehension', 'listening')
    ),
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    needs_review INTEGER NOT NULL CHECK (needs_review IN (0, 1)),
    release_ready INTEGER NOT NULL CHECK (release_ready IN (0, 1)),
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id) REFERENCES listening_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );
  CREATE INDEX IF NOT EXISTS listening_question_target_lookup_idx
    ON listening_question_target_relationships(activity_id, question_id);
  CREATE INDEX IF NOT EXISTS listening_turn_activity_idx
    ON listening_turns(activity_id, turn_order);

  CREATE VIEW IF NOT EXISTS listening_quiz_view AS
    SELECT id AS activity_id, level, activity_type, difficulty_rank,
      estimated_duration_seconds, playback_json, replay_json, question_ids_json,
      release_ready
    FROM listening_activities;
  CREATE VIEW IF NOT EXISTS listening_review_view AS
    SELECT activities.id AS activity_id, transcripts.display_text AS transcript,
      transcripts.english, activities.glossary_json, activities.editorial_json,
      activities.release_ready
    FROM listening_activities AS activities
    INNER JOIN listening_transcripts AS transcripts ON transcripts.activity_id = activities.id;
  CREATE VIEW IF NOT EXISTS listening_study_view AS
    SELECT activities.id AS activity_id, activities.level, activities.activity_type,
      transcripts.display_text AS transcript, transcripts.learner_text,
      transcripts.speech_normalized_text, transcripts.english,
      activities.glossary_json, activities.playback_json, activities.replay_json
    FROM listening_activities AS activities
    INNER JOIN listening_transcripts AS transcripts ON transcripts.activity_id = activities.id;
  CREATE VIEW IF NOT EXISTS listening_question_view AS
    SELECT questions.id AS question_id, targets.activity_id,
      questions.difficulty_level, questions.difficulty_rank,
      questions.release_ready
    FROM questions
    INNER JOIN listening_question_target_relationships AS targets
      ON targets.question_id = questions.id
    WHERE questions.domain = 'listening'
      AND targets.role = 'primary';
`;

const versionSixSql = `
  CREATE TABLE IF NOT EXISTS assessment_blueprints (
    id TEXT PRIMARY KEY NOT NULL, assessment_type TEXT NOT NULL, level TEXT NOT NULL,
    title TEXT NOT NULL, payload_json TEXT NOT NULL, release_ready INTEGER NOT NULL,
    import_batch_id TEXT NOT NULL, FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );
  CREATE TABLE IF NOT EXISTS assessment_presets (
    id TEXT PRIMARY KEY NOT NULL, assessment_type TEXT NOT NULL, title TEXT NOT NULL,
    payload_json TEXT NOT NULL, release_ready INTEGER NOT NULL,
    import_batch_id TEXT NOT NULL, FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );
  CREATE TABLE IF NOT EXISTS assessment_snapshots (
    id TEXT PRIMARY KEY NOT NULL, assessment_type TEXT NOT NULL, level TEXT NOT NULL,
    seed TEXT NOT NULL, content_version TEXT NOT NULL, pipeline_version TEXT NOT NULL,
    lifecycle_mode TEXT NOT NULL, blueprint_id TEXT NOT NULL, checksum TEXT NOT NULL,
    generation_timestamp TEXT NOT NULL, configuration_json TEXT NOT NULL,
    relaxed_constraints_json TEXT NOT NULL, release_ready INTEGER NOT NULL,
    import_batch_id TEXT NOT NULL,
    FOREIGN KEY (blueprint_id) REFERENCES assessment_blueprints(id),
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );
  CREATE TABLE IF NOT EXISTS assessment_sections (
    id TEXT PRIMARY KEY NOT NULL, assessment_id TEXT NOT NULL, blueprint_section_id TEXT NOT NULL,
    title TEXT NOT NULL, section_order INTEGER NOT NULL, recommended_minutes INTEGER NOT NULL,
    strict_time_limit INTEGER NOT NULL, UNIQUE (assessment_id, section_order),
    FOREIGN KEY (assessment_id) REFERENCES assessment_snapshots(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS assessment_question_placements (
    id TEXT PRIMARY KEY NOT NULL, assessment_id TEXT NOT NULL, section_id TEXT NOT NULL,
    question_id TEXT NOT NULL, placement_order INTEGER NOT NULL, domain TEXT NOT NULL,
    question_type TEXT NOT NULL, parent_type TEXT, parent_id TEXT, primary_target_id TEXT,
    estimated_seconds INTEGER NOT NULL, UNIQUE (assessment_id, placement_order),
    FOREIGN KEY (assessment_id) REFERENCES assessment_snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES assessment_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );
  CREATE TABLE IF NOT EXISTS assessment_parent_placements (
    id TEXT PRIMARY KEY NOT NULL, assessment_id TEXT NOT NULL, section_id TEXT NOT NULL,
    parent_type TEXT NOT NULL, parent_id TEXT NOT NULL, placement_order INTEGER NOT NULL,
    question_ids_json TEXT NOT NULL, UNIQUE (assessment_id, parent_type, parent_id),
    FOREIGN KEY (assessment_id) REFERENCES assessment_snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES assessment_sections(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS assessment_scoring_rules (
    id TEXT PRIMARY KEY NOT NULL, assessment_id TEXT NOT NULL UNIQUE,
    ordinary_question_points REAL NOT NULL, unanswered_points REAL NOT NULL,
    negative_marking INTEGER NOT NULL, domain_weights_json TEXT NOT NULL, label TEXT NOT NULL,
    FOREIGN KEY (assessment_id) REFERENCES assessment_snapshots(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS assessment_timing_rules (
    id TEXT PRIMARY KEY NOT NULL, assessment_id TEXT NOT NULL UNIQUE, mode TEXT NOT NULL,
    total_minutes INTEGER, section_transitions_seconds INTEGER NOT NULL,
    playback_and_replay_included INTEGER NOT NULL, resumable INTEGER NOT NULL,
    FOREIGN KEY (assessment_id) REFERENCES assessment_snapshots(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS assessment_readiness_rules (
    id TEXT PRIMARY KEY NOT NULL, payload_json TEXT NOT NULL, import_batch_id TEXT NOT NULL,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );
  CREATE TABLE IF NOT EXISTS assessment_views (
    id TEXT PRIMARY KEY NOT NULL, view_type TEXT NOT NULL, payload_json TEXT NOT NULL,
    release_ready INTEGER NOT NULL, import_batch_id TEXT NOT NULL,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );
  CREATE INDEX IF NOT EXISTS assessment_snapshot_type_level_idx ON assessment_snapshots(assessment_type, level);
  CREATE INDEX IF NOT EXISTS assessment_question_assessment_idx ON assessment_question_placements(assessment_id, placement_order);
  CREATE VIEW IF NOT EXISTS assessment_list_view AS
    SELECT id, assessment_type, level, lifecycle_mode, checksum, release_ready FROM assessment_snapshots;
  CREATE VIEW IF NOT EXISTS assessment_question_view AS
    SELECT assessment_id, section_id, question_id, placement_order, domain, question_type,
      parent_type, parent_id, primary_target_id FROM assessment_question_placements;
`;

// Phase 9 stores audit provenance separately from canonical learning records.
// It is intentionally append-only metadata: lifecycle decisions are still made
// by the canonical item/question tables and are never inferred from this view.
const versionSevenSql = `
  CREATE TABLE IF NOT EXISTS curriculum_audit_records (
    id TEXT PRIMARY KEY NOT NULL,
    audit_phase TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    status TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    fixed_timestamp TEXT NOT NULL,
    import_batch_id TEXT,
    FOREIGN KEY (import_batch_id) REFERENCES content_import_batches(id)
  );
  CREATE INDEX IF NOT EXISTS curriculum_audit_subject_idx
    ON curriculum_audit_records(subject_type, subject_id, audit_phase);
  CREATE VIEW IF NOT EXISTS curriculum_audit_review_view AS
    SELECT audit_phase, subject_type, subject_id, status, fixed_timestamp
    FROM curriculum_audit_records
    WHERE status IN ('review-required', 'deferred', 'insufficient-evidence');
`;

// Phase 2 separates the bundled canonical curriculum from learner-owned data.
// Content upgrades replace only the bundle rows; attempts, mastery, settings,
// and the assessment snapshot continue to reference their stable item IDs.
const versionEightSql = `
  ALTER TABLE curriculum_items ADD COLUMN curriculum_source TEXT NOT NULL DEFAULT 'legacy';
  ALTER TABLE curriculum_items ADD COLUMN release_ready INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE curriculum_items ADD COLUMN bundled_content_version TEXT;

  CREATE INDEX IF NOT EXISTS curriculum_items_discovery_idx
    ON curriculum_items(curriculum_source, release_ready, type, level, id);
  CREATE INDEX IF NOT EXISTS curriculum_items_title_search_idx
    ON curriculum_items(title COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS curriculum_items_reading_search_idx
    ON curriculum_items(reading COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS curriculum_items_meaning_search_idx
    ON curriculum_items(meaning COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS curriculum_bundle_state (
    bundle_key TEXT PRIMARY KEY NOT NULL,
    content_version TEXT NOT NULL,
    checksum TEXT NOT NULL,
    vocabulary_count INTEGER NOT NULL CHECK (vocabulary_count >= 0),
    question_count INTEGER NOT NULL CHECK (question_count >= 0),
    sentence_count INTEGER NOT NULL CHECK (sentence_count >= 0),
    installed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vocabulary_content_details (
    vocabulary_id TEXT PRIMARY KEY NOT NULL,
    part_of_speech_json TEXT NOT NULL,
    kanji_ids_json TEXT NOT NULL,
    bundled_content_version TEXT NOT NULL,
    FOREIGN KEY (vocabulary_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mobile_sentences (
    id TEXT PRIMARY KEY NOT NULL,
    japanese TEXT NOT NULL,
    reading TEXT NOT NULL,
    english TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('N5', 'N4')),
    difficulty_rank INTEGER NOT NULL CHECK (difficulty_rank BETWEEN 1 AND 5),
    bundled_content_version TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vocabulary_sentence_links (
    id TEXT PRIMARY KEY NOT NULL,
    vocabulary_id TEXT NOT NULL,
    sentence_id TEXT NOT NULL,
    relationship_role TEXT NOT NULL CHECK (relationship_role IN ('focus', 'supporting')),
    bundled_content_version TEXT NOT NULL,
    FOREIGN KEY (vocabulary_id) REFERENCES curriculum_items(id) ON DELETE CASCADE,
    FOREIGN KEY (sentence_id) REFERENCES mobile_sentences(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS vocabulary_sentence_lookup_idx
    ON vocabulary_sentence_links(vocabulary_id, relationship_role, id);

  CREATE TABLE IF NOT EXISTS mobile_sentence_grammar_links (
    id TEXT PRIMARY KEY NOT NULL,
    grammar_id TEXT NOT NULL,
    sentence_id TEXT NOT NULL,
    relationship_role TEXT NOT NULL CHECK (relationship_role IN ('focus', 'supporting')),
    bundled_content_version TEXT NOT NULL,
    FOREIGN KEY (grammar_id) REFERENCES curriculum_items(id) ON DELETE CASCADE,
    FOREIGN KEY (sentence_id) REFERENCES mobile_sentences(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS mobile_sentence_grammar_lookup_idx
    ON mobile_sentence_grammar_links(grammar_id, relationship_role, id);

  CREATE TABLE IF NOT EXISTS vocabulary_question_bank (
    id TEXT PRIMARY KEY NOT NULL,
    vocabulary_id TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('N5', 'N4')),
    presentation TEXT NOT NULL,
    response_type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    explanation TEXT,
    correct_option_id TEXT NOT NULL,
    options_json TEXT NOT NULL,
    bundled_content_version TEXT NOT NULL,
    FOREIGN KEY (vocabulary_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS vocabulary_question_lookup_idx
    ON vocabulary_question_bank(vocabulary_id, id);

  CREATE TABLE IF NOT EXISTS vocabulary_bookmarks (
    user_id TEXT NOT NULL,
    vocabulary_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, vocabulary_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (vocabulary_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    session_type TEXT NOT NULL CHECK (session_type IN ('vocabulary-practice', 'review')),
    status TEXT NOT NULL CHECK (status IN ('in-progress', 'completed')),
    item_ids_json TEXT NOT NULL,
    question_ids_json TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0 CHECK (current_index >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS study_sessions_resume_idx
    ON study_sessions(user_id, status, updated_at DESC);
`;

// Phase 3 adds the local, release-only details and question bank shared by
// grammar, kanji, reading, and listening. Learner-owned attempts and mastery
// stay in their original tables, so an upgrade only replaces curated content.
const versionNineSql = `
  CREATE TABLE IF NOT EXISTS curriculum_content_details (
    item_id TEXT PRIMARY KEY NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('grammar', 'kanji', 'reading', 'listening')),
    detail_json TEXT NOT NULL,
    bundled_content_version TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS curriculum_content_details_type_idx
    ON curriculum_content_details(content_type, item_id);

  CREATE TABLE IF NOT EXISTS kanji_sentence_links (
    id TEXT PRIMARY KEY NOT NULL,
    kanji_id TEXT NOT NULL,
    sentence_id TEXT NOT NULL,
    relationship_role TEXT NOT NULL CHECK (relationship_role IN ('focus', 'supporting')),
    bundled_content_version TEXT NOT NULL,
    FOREIGN KEY (kanji_id) REFERENCES curriculum_items(id) ON DELETE CASCADE,
    FOREIGN KEY (sentence_id) REFERENCES mobile_sentences(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS kanji_sentence_lookup_idx
    ON kanji_sentence_links(kanji_id, relationship_role, id);

  CREATE TABLE IF NOT EXISTS canonical_practice_question_bank (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL,
    domain TEXT NOT NULL CHECK (domain IN ('grammar', 'kanji', 'reading', 'listening')),
    level TEXT NOT NULL CHECK (level IN ('N5', 'N4')),
    presentation TEXT NOT NULL,
    response_type TEXT NOT NULL CHECK (response_type = 'single-select'),
    prompt TEXT NOT NULL,
    explanation TEXT,
    correct_option_id TEXT NOT NULL,
    options_json TEXT NOT NULL,
    bundled_content_version TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS canonical_practice_question_lookup_idx
    ON canonical_practice_question_bank(item_id, domain, id);

  CREATE TABLE IF NOT EXISTS curriculum_bookmarks (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS content_study_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('grammar', 'kanji', 'reading', 'listening')),
    status TEXT NOT NULL CHECK (status IN ('in-progress', 'completed')),
    item_id TEXT NOT NULL,
    question_ids_json TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0 CHECK (current_index >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id)
  );
  CREATE INDEX IF NOT EXISTS content_study_sessions_resume_idx
    ON content_study_sessions(user_id, content_type, status, updated_at DESC);
`;

// Phase 4 stores FSRS scheduling independently from the legacy progress
// projection. Existing attempts remain immutable and the projection can be
// rebuilt from this card state in a later scheduler migration.
const versionTenSql = `
  CREATE TABLE IF NOT EXISTS fsrs_cards (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('new', 'learning', 'review', 'relearning', 'mastered', 'suspended', 'buried')),
    stability REAL NOT NULL CHECK (stability >= 0),
    difficulty REAL NOT NULL CHECK (difficulty >= 1 AND difficulty <= 10),
    retrievability REAL NOT NULL CHECK (retrievability >= 0 AND retrievability <= 1),
    due_at TEXT NOT NULL,
    last_reviewed_at TEXT,
    repetitions INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
    lapses INTEGER NOT NULL DEFAULT 0 CHECK (lapses >= 0),
    last_rating TEXT CHECK (last_rating IN ('again', 'hard', 'good', 'easy')),
    scheduled_days REAL NOT NULL DEFAULT 0 CHECK (scheduled_days >= 0),
    elapsed_days REAL NOT NULL DEFAULT 0 CHECK (elapsed_days >= 0),
    buried_until TEXT,
    suspended_at TEXT,
    scheduler_version TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS fsrs_cards_queue_idx
    ON fsrs_cards(user_id, state, due_at, buried_until, suspended_at);
  CREATE INDEX IF NOT EXISTS fsrs_cards_due_idx
    ON fsrs_cards(user_id, due_at);

  CREATE TABLE IF NOT EXISTS fsrs_review_history (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
    state_before TEXT NOT NULL,
    state_after TEXT NOT NULL,
    stability_before REAL NOT NULL,
    stability_after REAL NOT NULL,
    difficulty_before REAL NOT NULL,
    difficulty_after REAL NOT NULL,
    retrievability_before REAL NOT NULL,
    response_time_ms INTEGER NOT NULL CHECK (response_time_ms >= 0),
    scheduled_days REAL NOT NULL CHECK (scheduled_days >= 0),
    due_at TEXT NOT NULL,
    attempt_id TEXT,
    scheduler_version TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id) ON DELETE CASCADE,
    FOREIGN KEY (attempt_id) REFERENCES learning_attempts(id)
  );
  CREATE INDEX IF NOT EXISTS fsrs_review_history_stats_idx
    ON fsrs_review_history(user_id, reviewed_at DESC);
  CREATE INDEX IF NOT EXISTS fsrs_review_history_item_idx
    ON fsrs_review_history(user_id, item_id, reviewed_at DESC);
`;

const versionElevenSql = `
  CREATE TABLE IF NOT EXISTS practice_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('practice', 'mock-exam', 'section-exam')),
    level TEXT NOT NULL CHECK (level IN ('N5', 'N4')),
    domains_json TEXT NOT NULL,
    source_filter TEXT NOT NULL,
    seed TEXT NOT NULL,
    selection_json TEXT NOT NULL,
    timer_mode TEXT NOT NULL CHECK (timer_mode IN ('none', 'elapsed', 'countdown')),
    time_limit_seconds INTEGER,
    status TEXT NOT NULL CHECK (status IN ('in-progress', 'paused', 'completed', 'time-expired')),
    question_ids_json TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0 CHECK (current_index >= 0),
    elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS practice_sessions_history_idx
    ON practice_sessions(user_id, kind, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS practice_sessions_resume_idx
    ON practice_sessions(user_id, status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS practice_session_answers (
    session_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    selected_option_id TEXT,
    correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
    response_time_ms INTEGER NOT NULL CHECK (response_time_ms >= 0),
    answered_at TEXT NOT NULL,
    PRIMARY KEY (session_id, question_id),
    FOREIGN KEY (session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS practice_session_answers_session_idx
    ON practice_session_answers(session_id, answered_at);

  CREATE TABLE IF NOT EXISTS mistake_notebook (
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    domain TEXT NOT NULL CHECK (domain IN ('vocabulary', 'grammar', 'kanji', 'reading', 'listening')),
    added_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS mistake_notebook_lookup_idx
    ON mistake_notebook(user_id, domain, last_seen_at DESC);
`;

const versionTwelveSql = `
  CREATE TABLE IF NOT EXISTS ai_response_cache (
    cache_key TEXT PRIMARY KEY NOT NULL,
    feature_type TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    response_json TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    model_identifier TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    content_version TEXT
  );
  CREATE INDEX IF NOT EXISTS ai_response_cache_expiry_idx ON ai_response_cache(expires_at);

  CREATE TABLE IF NOT EXISTS ai_interaction_history (
    id TEXT PRIMARY KEY NOT NULL,
    feature_type TEXT NOT NULL,
    related_content_type TEXT,
    related_content_id TEXT,
    user_input TEXT,
    validated_response_json TEXT,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed', 'offline-fallback', 'failed', 'cancelled')),
    cached INTEGER NOT NULL DEFAULT 0 CHECK (cached IN (0, 1)),
    fallback_used INTEGER NOT NULL DEFAULT 0 CHECK (fallback_used IN (0, 1)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ai_interaction_history_recent_idx ON ai_interaction_history(created_at DESC);

  CREATE TABLE IF NOT EXISTS ai_failed_request_drafts (
    id TEXT PRIMARY KEY NOT NULL,
    feature_type TEXT NOT NULL,
    context_json TEXT NOT NULL,
    user_input TEXT,
    prompt_version TEXT NOT NULL,
    error_code TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_generated_examples (
    id TEXT PRIMARY KEY NOT NULL,
    related_content_id TEXT,
    japanese TEXT NOT NULL,
    reading TEXT,
    translation TEXT NOT NULL,
    created_at TEXT NOT NULL,
    bookmarked INTEGER NOT NULL DEFAULT 0 CHECK (bookmarked IN (0, 1))
  );
`;

// Study Library records learner-owned viewing and flashcard session state only.
// Canonical curriculum, question banks, FSRS cards, and existing practice
// sessions remain in their original tables and continue to use stable IDs.
const versionThirteenSql = `
  CREATE TABLE IF NOT EXISTS study_content_views (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('grammar', 'vocabulary', 'kanji')),
    viewed_at TEXT NOT NULL,
    scroll_position REAL,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS study_content_views_recent_idx
    ON study_content_views(user_id, viewed_at DESC);
  CREATE INDEX IF NOT EXISTS study_content_views_item_idx
    ON study_content_views(user_id, item_id, viewed_at DESC);

  CREATE TABLE IF NOT EXISTS kanji_flashcard_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    set_name TEXT NOT NULL,
    directions_json TEXT NOT NULL,
    item_ids_json TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0 CHECK (current_index >= 0),
    status TEXT NOT NULL CHECK (status IN ('in-progress', 'completed', 'ended')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS kanji_flashcard_sessions_recent_idx
    ON kanji_flashcard_sessions(user_id, status, updated_at DESC);

  CREATE INDEX IF NOT EXISTS learning_attempts_item_mode_recent_idx
    ON learning_attempts(item_id, mode, created_at DESC);
  CREATE INDEX IF NOT EXISTS content_study_sessions_item_recent_idx
    ON content_study_sessions(user_id, item_id, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS vocabulary_bookmarks_user_recent_idx
    ON vocabulary_bookmarks(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS curriculum_bookmarks_user_recent_idx
    ON curriculum_bookmarks(user_id, created_at DESC);
`;

// Course records contain authored structure and learner-owned progression only.
// Canonical learning content remains in the existing curriculum and question tables.
const versionFourteenSql = `
  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('foundations', 'N5', 'N4')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    manifest_version INTEGER NOT NULL,
    manifest_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS course_units (
    id TEXT PRIMARY KEY NOT NULL,
    course_id TEXT NOT NULL,
    unit_order INTEGER NOT NULL CHECK (unit_order > 0),
    title TEXT NOT NULL,
    goal TEXT NOT NULL,
    UNIQUE (course_id, unit_order),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS course_lessons (
    id TEXT PRIMARY KEY NOT NULL,
    course_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    lesson_order INTEGER NOT NULL CHECK (lesson_order > 0),
    lesson_number INTEGER NOT NULL CHECK (lesson_number > 0),
    title TEXT NOT NULL,
    theme TEXT NOT NULL,
    communication_goal TEXT NOT NULL,
    objectives_json TEXT NOT NULL,
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
    prerequisites_json TEXT NOT NULL,
    UNIQUE (course_id, lesson_order),
    UNIQUE (course_id, lesson_number),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES course_units(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS course_lessons_unit_order_idx ON course_lessons(unit_id, lesson_order);

  CREATE TABLE IF NOT EXISTS course_lesson_content_refs (
    lesson_id TEXT NOT NULL,
    reference_type TEXT NOT NULL CHECK (reference_type IN ('vocabulary', 'grammar', 'kanji', 'reading', 'listening', 'vocabulary-question', 'practice-question', 'assessment-question')),
    reference_id TEXT NOT NULL,
    reference_role TEXT NOT NULL CHECK (reference_role IN ('introduced', 'practice', 'checkpoint', 'context')),
    PRIMARY KEY (lesson_id, reference_type, reference_id, reference_role),
    FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS course_lesson_content_refs_lookup_idx ON course_lesson_content_refs(reference_type, reference_id, lesson_id);

  CREATE TABLE IF NOT EXISTS course_lesson_sections (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_id TEXT NOT NULL,
    section_order INTEGER NOT NULL CHECK (section_order > 0),
    kind TEXT NOT NULL CHECK (kind IN ('introduction', 'vocabulary', 'grammar', 'kanji', 'dialogue', 'listening', 'reading', 'practice', 'checkpoint', 'summary')),
    title TEXT NOT NULL,
    instruction TEXT NOT NULL,
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
    UNIQUE (lesson_id, section_order),
    FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS course_enrollments (
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    selected_at TEXT NOT NULL,
    PRIMARY KEY (user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS course_lesson_progress (
    user_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    current_section_id TEXT,
    completed_sections_json TEXT NOT NULL DEFAULT '[]',
    best_checkpoint_score INTEGER,
    latest_checkpoint_score INTEGER,
    started_at TEXT,
    completed_at TEXT,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0 CHECK (time_spent_seconds >= 0),
    placed_by_assessment INTEGER NOT NULL DEFAULT 0 CHECK (placed_by_assessment IN (0, 1)),
    PRIMARY KEY (user_id, lesson_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE,
    FOREIGN KEY (current_section_id) REFERENCES course_lesson_sections(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS course_lesson_progress_resume_idx ON course_lesson_progress(user_id, completed_at, started_at DESC);

  CREATE TABLE IF NOT EXISTS course_section_progress (
    user_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0 CHECK (time_spent_seconds >= 0),
    PRIMARY KEY (user_id, section_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES course_lesson_sections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS course_checkpoint_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    result_json TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS course_checkpoint_attempts_history_idx ON course_checkpoint_attempts(user_id, lesson_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS course_unit_review_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES course_units(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS course_unit_review_attempts_history_idx ON course_unit_review_attempts(user_id, unit_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS course_placement_decisions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    assessment_score INTEGER,
    accepted INTEGER NOT NULL CHECK (accepted IN (0, 1)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES course_units(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS course_placement_decisions_recent_idx ON course_placement_decisions(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS course_manifest_state (
    manifest_key TEXT PRIMARY KEY NOT NULL,
    manifest_version INTEGER NOT NULL,
    manifest_hash TEXT NOT NULL,
    installed_at TEXT NOT NULL
  );
`;

// Activity-level textbook progression. These rows store authored lesson flow
// and learner-owned responses; canonical curriculum and FSRS remain unchanged.
const versionFifteenSql = `
  ALTER TABLE course_lessons ADD COLUMN lesson_kind TEXT NOT NULL DEFAULT 'lesson' CHECK (lesson_kind IN ('lesson', 'workshop'));
  ALTER TABLE course_lessons ADD COLUMN depth_exception TEXT;
  ALTER TABLE course_lessons ADD COLUMN verb_forms_json TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE course_lessons ADD COLUMN adjective_forms_json TEXT NOT NULL DEFAULT '[]';

  CREATE TABLE IF NOT EXISTS course_lesson_activities (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_id TEXT NOT NULL,
    activity_order INTEGER NOT NULL CHECK (activity_order > 0),
    activity_type TEXT NOT NULL CHECK (activity_type IN ('introduction', 'warm_up', 'story', 'vocabulary_intro', 'vocabulary_practice', 'grammar_explanation', 'substitution_drill', 'conjugation_drill', 'sentence_transformation', 'sentence_ordering', 'sentence_production', 'error_correction', 'kanji_intro', 'kanji_practice', 'dialogue', 'reading', 'timed_reading', 'listening', 'dictation', 'shadowing', 'mixed_practice', 'checkpoint', 'reflection')),
    title TEXT NOT NULL,
    instruction TEXT NOT NULL,
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
    required INTEGER NOT NULL CHECK (required IN (0, 1)),
    interaction_count INTEGER NOT NULL CHECK (interaction_count > 0),
    content_refs_json TEXT NOT NULL,
    config_json TEXT NOT NULL,
    UNIQUE (lesson_id, activity_order),
    FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS course_lesson_activities_lesson_order_idx ON course_lesson_activities(lesson_id, activity_order);

  CREATE TABLE IF NOT EXISTS course_activity_progress (
    user_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    current_interaction_index INTEGER NOT NULL DEFAULT 0 CHECK (current_interaction_index >= 0),
    completed_at TEXT,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0 CHECK (time_spent_seconds >= 0),
    PRIMARY KEY (user_id, activity_id),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id) REFERENCES course_lesson_activities(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS course_activity_progress_resume_idx ON course_activity_progress(user_id, completed_at, activity_id);

  CREATE TABLE IF NOT EXISTS course_activity_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    interaction_index INTEGER NOT NULL CHECK (interaction_index >= 0),
    item_id TEXT,
    category TEXT NOT NULL CHECK (category IN ('vocabulary', 'grammar', 'conjugation', 'kanji', 'reading', 'listening', 'production')),
    response_text TEXT,
    accepted_answers_json TEXT NOT NULL,
    correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
    response_time_ms INTEGER NOT NULL DEFAULT 0 CHECK (response_time_ms >= 0),
    created_at TEXT NOT NULL,
    UNIQUE (user_id, activity_id, exercise_id, interaction_index),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id) REFERENCES course_lesson_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS course_activity_attempts_activity_idx ON course_activity_attempts(user_id, activity_id, interaction_index);
  CREATE INDEX IF NOT EXISTS course_activity_attempts_item_idx ON course_activity_attempts(user_id, item_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS course_reading_progress (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    character_count INTEGER NOT NULL CHECK (character_count >= 0),
    elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
    comprehension_score INTEGER,
    reread_count INTEGER NOT NULL DEFAULT 0 CHECK (reread_count >= 0),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id) REFERENCES course_lesson_activities(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS course_reading_progress_recent_idx ON course_reading_progress(user_id, activity_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS course_production_answers (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    required_pattern TEXT,
    self_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (self_confirmed IN (0, 1)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id) REFERENCES course_lesson_activities(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS course_production_answers_activity_idx ON course_production_answers(user_id, activity_id, created_at DESC);
`;

// Preserve both the first response and later correction for course analytics.
// The existing activity-attempt row remains the current-resume projection.
const versionSixteenSql = `
  ALTER TABLE course_lessons ADD COLUMN depth_exception_reason TEXT;

  CREATE TABLE IF NOT EXISTS course_activity_attempt_history (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    interaction_index INTEGER NOT NULL CHECK (interaction_index >= 0),
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    item_id TEXT,
    category TEXT NOT NULL CHECK (category IN ('vocabulary', 'grammar', 'conjugation', 'kanji', 'reading', 'listening', 'production')),
    correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
    response_time_ms INTEGER NOT NULL DEFAULT 0 CHECK (response_time_ms >= 0),
    created_at TEXT NOT NULL,
    UNIQUE (user_id, activity_id, exercise_id, interaction_index, attempt_number),
    FOREIGN KEY (user_id) REFERENCES learner_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id) REFERENCES course_lesson_activities(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES curriculum_items(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS course_activity_attempt_history_lookup_idx
    ON course_activity_attempt_history(user_id, activity_id, exercise_id, interaction_index, attempt_number);
`;

export const databaseMigrations: readonly DatabaseMigration[] = [
  { version: 1, sql: versionOneSql },
  { version: 2, sql: versionTwoSql },
  { version: 3, sql: versionThreeSql },
  { version: 4, sql: versionFourSql },
  { version: 5, sql: versionFiveSql },
  { version: 6, sql: versionSixSql },
  { version: 7, sql: versionSevenSql },
  { version: 8, sql: versionEightSql },
  { version: 9, sql: versionNineSql },
  { version: 10, sql: versionTenSql },
  { version: 11, sql: versionElevenSql },
  { version: 12, sql: versionTwelveSql },
  { version: 13, sql: versionThirteenSql },
  { version: 14, sql: versionFourteenSql },
  { version: 15, sql: versionFifteenSql },
  { version: 16, sql: versionSixteenSql },
];

export async function runMigrations(database: MigrationDatabase): Promise<void> {
  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion > CURRENT_DATABASE_VERSION) {
    throw new Error(
      `JapanGo database version ${currentVersion} is newer than supported version ${CURRENT_DATABASE_VERSION}.`,
    );
  }

  for (const migration of databaseMigrations) {
    if (migration.version <= currentVersion) continue;
    await database.withTransactionAsync(async () => {
      await database.execAsync(migration.sql);
      await database.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
