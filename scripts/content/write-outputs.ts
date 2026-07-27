import path from "node:path";

import { OUTPUT_ROOT } from "./config";
import { writeJson } from "./lib/fs-utils";
import type { ContentBundle } from "./validate-content";

export async function writeContentOutputs(bundle: ContentBundle): Promise<void> {
  const grammarLevelById = new Map(
    [...bundle.grammar.n5, ...bundle.grammar.n4].map((grammar) => [
      grammar.id,
      grammar.level,
    ]),
  );
  const sentenceLevel = (level: "N5" | "N4") =>
    bundle.learningContent.sentences.filter(
      ({ difficulty }) => difficulty.jlptLevel === level,
    );
  const grammarViewsForLevel = (level: "N5" | "N4") =>
    bundle.learningContent.grammarExampleViews.filter(
      ({ grammarId }) => grammarLevelById.get(grammarId) === level,
    );
  const readingPassagesForLevel = (level: "N5" | "N4") =>
    bundle.learningContent.readingPassages.filter((passage) => passage.level === level);
  const readingQuestionsForLevel = (level: "N5" | "N4") =>
    bundle.learningContent.questions.filter(
      (question) => question.domain === "reading" && question.difficulty.jlptLevel === level,
    );
  const readingQuestionIds = new Set(
    bundle.learningContent.questions.filter(({ domain }) => domain === "reading").map(({ id }) => id),
  );
  const listeningActivitiesForLevel = (level: "N5" | "N4") => bundle.learningContent.listeningActivities.filter((activity) => activity.level === level);
  const listeningQuestionsForLevel = (level: "N5" | "N4") => bundle.learningContent.questions.filter((question) => question.domain === "listening" && question.difficulty.jlptLevel === level);
  const listeningQuestionIds = new Set(bundle.learningContent.questions.filter(({ domain }) => domain === "listening").map(({ id }) => id));
  const grammarQuestionIds = new Set(
    bundle.learningContent.questionTargetRelationships
      .filter(
        (relationship) =>
          relationship.targetType === "grammar" && relationship.role === "primary",
      )
      .map(({ questionId }) => questionId),
  );
  const grammarQuestionsForLevel = (level: "N5" | "N4") =>
    bundle.learningContent.questions.filter(
      (question) =>
        grammarQuestionIds.has(question.id) && question.difficulty.jlptLevel === level,
    );
  await Promise.all([
    writeJson(path.join(OUTPUT_ROOT, "vocabulary/n5.json"), bundle.vocabulary.n5),
    writeJson(path.join(OUTPUT_ROOT, "vocabulary/n4.json"), bundle.vocabulary.n4),
    writeJson(
      path.join(OUTPUT_ROOT, "vocabulary/supplemental.json"),
      bundle.vocabulary.supplemental,
    ),
    writeJson(path.join(OUTPUT_ROOT, "kanji/n5.json"), bundle.kanji.n5),
    writeJson(path.join(OUTPUT_ROOT, "kanji/n4.json"), bundle.kanji.n4),
    writeJson(
      path.join(OUTPUT_ROOT, "kanji/components.json"),
      bundle.kanji.components,
    ),
    writeJson(path.join(OUTPUT_ROOT, "grammar/n5.json"), bundle.grammar.n5),
    writeJson(path.join(OUTPUT_ROOT, "grammar/n4.json"), bundle.grammar.n4),
    writeJson(
      path.join(OUTPUT_ROOT, "curriculum/units-n5.json"),
      bundle.curriculum.n5,
    ),
    writeJson(
      path.join(OUTPUT_ROOT, "curriculum/units-n4.json"),
      bundle.curriculum.n4,
    ),
    writeJson(
      path.join(OUTPUT_ROOT, "curriculum/textbook-curriculum-map.json"),
      bundle.textbookMap,
    ),
    writeJson(
      path.join(OUTPUT_ROOT, "learning-content/index.json"),
      bundle.learningContent,
    ),
    writeJson(path.join(OUTPUT_ROOT, "sentences/n5.json"), sentenceLevel("N5")),
    writeJson(path.join(OUTPUT_ROOT, "sentences/n4.json"), sentenceLevel("N4")),
    writeJson(
      path.join(OUTPUT_ROOT, "sentences/all.json"),
      bundle.learningContent.sentences,
    ),
    writeJson(path.join(OUTPUT_ROOT, "reading/passages-n5.json"), readingPassagesForLevel("N5")),
    writeJson(path.join(OUTPUT_ROOT, "reading/passages-n4.json"), readingPassagesForLevel("N4")),
    writeJson(path.join(OUTPUT_ROOT, "reading/passages-all.json"), bundle.learningContent.readingPassages),
    writeJson(path.join(OUTPUT_ROOT, "reading/questions-n5.json"), readingQuestionsForLevel("N5")),
    writeJson(path.join(OUTPUT_ROOT, "reading/questions-n4.json"), readingQuestionsForLevel("N4")),
    writeJson(path.join(OUTPUT_ROOT, "reading/questions-all.json"), bundle.learningContent.questions.filter(({ domain }) => domain === "reading")),
    writeJson(path.join(OUTPUT_ROOT, "reading/options.json"), bundle.learningContent.questionOptions.filter(({ questionId }) => readingQuestionIds.has(questionId))),
    writeJson(path.join(OUTPUT_ROOT, "listening/activities-n5.json"), listeningActivitiesForLevel("N5")),
    writeJson(path.join(OUTPUT_ROOT, "listening/activities-n4.json"), listeningActivitiesForLevel("N4")),
    writeJson(path.join(OUTPUT_ROOT, "listening/activities-all.json"), bundle.learningContent.listeningActivities),
    writeJson(path.join(OUTPUT_ROOT, "listening/transcripts.json"), bundle.learningContent.listeningActivities.map(({ id, transcript, learnerTranscript, english }) => ({ activityId: id, transcript, learnerTranscript, english }))),
    writeJson(path.join(OUTPUT_ROOT, "listening/speech-normalized-transcripts.json"), bundle.learningContent.listeningActivities.map(({ id, speechNormalizedTranscript }) => ({ activityId: id, speechNormalizedTranscript }))),
    writeJson(path.join(OUTPUT_ROOT, "listening/questions-n5.json"), listeningQuestionsForLevel("N5")),
    writeJson(path.join(OUTPUT_ROOT, "listening/questions-n4.json"), listeningQuestionsForLevel("N4")),
    writeJson(path.join(OUTPUT_ROOT, "listening/questions-all.json"), bundle.learningContent.questions.filter(({ domain }) => domain === "listening")),
    writeJson(path.join(OUTPUT_ROOT, "listening/options.json"), bundle.learningContent.questionOptions.filter(({ questionId }) => listeningQuestionIds.has(questionId))),
    writeJson(path.join(OUTPUT_ROOT, "listening/speakers.json"), bundle.learningContent.listeningSpeakers),
    writeJson(
      path.join(OUTPUT_ROOT, "examples/grammar-examples-n5.json"),
      grammarViewsForLevel("N5"),
    ),
    writeJson(
      path.join(OUTPUT_ROOT, "examples/grammar-examples-n4.json"),
      grammarViewsForLevel("N4"),
    ),
    writeJson(path.join(OUTPUT_ROOT, "questions/grammar-n5.json"), grammarQuestionsForLevel("N5")),
    writeJson(path.join(OUTPUT_ROOT, "questions/grammar-n4.json"), grammarQuestionsForLevel("N4")),
    writeJson(
      path.join(OUTPUT_ROOT, "questions/vocabulary-n5.json"),
      bundle.learningContent.questions.filter(({ domain, difficulty }) =>
        domain === "vocabulary" && difficulty.jlptLevel === "N5",
      ),
    ),
    writeJson(
      path.join(OUTPUT_ROOT, "questions/vocabulary-n4.json"),
      bundle.learningContent.questions.filter(({ domain, difficulty }) =>
        domain === "vocabulary" && difficulty.jlptLevel === "N4",
      ),
    ),
    writeJson(
      path.join(OUTPUT_ROOT, "questions/kanji-n5.json"),
      bundle.learningContent.questions.filter(({ domain, difficulty }) =>
        domain === "kanji" && difficulty.jlptLevel === "N5",
      ),
    ),
    writeJson(
      path.join(OUTPUT_ROOT, "questions/kanji-n4.json"),
      bundle.learningContent.questions.filter(({ domain, difficulty }) =>
        domain === "kanji" && difficulty.jlptLevel === "N4",
      ),
    ),
    writeJson(path.join(OUTPUT_ROOT, "questions/options.json"), bundle.learningContent.questionOptions),
    writeJson(path.join(OUTPUT_ROOT, "assessments/blueprints.json"), bundle.assessments.blueprints),
    writeJson(path.join(OUTPUT_ROOT, "assessments/presets.json"), bundle.assessments.presets),
    writeJson(path.join(OUTPUT_ROOT, "assessments/bundled-n5-mock-exams.json"), bundle.assessments.bundledExams.filter(({ level }) => level === "N5")),
    writeJson(path.join(OUTPUT_ROOT, "assessments/bundled-n4-mock-exams.json"), bundle.assessments.bundledExams.filter(({ level }) => level === "N4")),
    writeJson(path.join(OUTPUT_ROOT, "assessments/bundled-mock-exams-all.json"), bundle.assessments.bundledExams),
    writeJson(path.join(OUTPUT_ROOT, "assessments/sample-section-exams.json"), bundle.assessments.sampleSnapshots.filter(({ assessmentType }) => assessmentType === "section-exam")),
    writeJson(path.join(OUTPUT_ROOT, "assessments/sample-quick-practice.json"), bundle.assessments.sampleSnapshots.filter(({ assessmentType }) => assessmentType === "quick-practice")),
    writeJson(path.join(OUTPUT_ROOT, "assessments/sample-daily-challenges.json"), bundle.assessments.sampleSnapshots.filter(({ assessmentType }) => assessmentType === "daily-challenge")),
    writeJson(path.join(OUTPUT_ROOT, "assessments/sample-weak-area-assessments.json"), bundle.assessments.sampleSnapshots.filter(({ assessmentType }) => assessmentType === "weak-area")),
    writeJson(path.join(OUTPUT_ROOT, "assessments/assessment-question-placements.json"), [...bundle.assessments.bundledExams, ...bundle.assessments.sampleSnapshots].flatMap(({ questionPlacements }) => questionPlacements)),
    writeJson(path.join(OUTPUT_ROOT, "assessments/assessment-parent-placements.json"), [...bundle.assessments.bundledExams, ...bundle.assessments.sampleSnapshots].flatMap(({ parentPlacements }) => parentPlacements)),
    writeJson(path.join(OUTPUT_ROOT, "assessments/assessment-snapshots.json"), [...bundle.assessments.bundledExams, ...bundle.assessments.sampleSnapshots]),
    writeJson(
      path.join(OUTPUT_ROOT, "questions/grammar-target-relationships.json"),
      bundle.learningContent.questionTargetRelationships,
    ),
  ]);
}
