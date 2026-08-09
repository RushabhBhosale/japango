/* Packages the reviewed development mock snapshots with only the question,
 * passage, and listening records they reference. This keeps the 88 MB source
 * corpus out of the mobile exam screen while preserving stable source IDs. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const content = read('assets/generated-content/learning-content/index.json');
const snapshots = read('assets/generated-content/assessments/bundled-mock-exams-all.json');

const questionById = new Map(content.questions.map((value) => [value.id, value]));
const optionsByQuestion = new Map();
for (const option of content.questionOptions) {
  const list = optionsByQuestion.get(option.questionId) ?? [];
  list.push(option);
  optionsByQuestion.set(option.questionId, list);
}
const sentences = new Map(content.sentences.map((value) => [value.id, value]));
const passages = new Map(content.readingPassages.map((value) => [value.id, value]));
const activities = new Map(content.listeningActivities.map((value) => [value.id, value]));
const linksByQuestion = new Map();
for (const link of content.questionTargetRelationships) {
  const list = linksByQuestion.get(link.questionId) ?? [];
  list.push(link.targetId);
  linksByQuestion.set(link.questionId, list);
}

function optionLabel(option) {
  if (option.content.type === 'text') return option.content.text;
  const sentence = sentences.get(option.content.sentenceId);
  if (!sentence) throw new Error(`Missing sentence option ${option.content.sentenceId}`);
  return sentence.japanese;
}

const questionIds = new Set(snapshots.flatMap((exam) => exam.questionPlacements.map((placement) => placement.questionId)));
const packagedQuestions = [...questionIds].sort().map((id) => {
  const question = questionById.get(id);
  if (!question) throw new Error(`Missing mock question ${id}`);
  const options = (optionsByQuestion.get(id) ?? []).sort((a, b) => a.position - b.position);
  if (question.responseType !== 'text-input' && options.length !== 4) throw new Error(`${id} must have four choices`);
  if (question.correctOptionIds.length !== 1) throw new Error(`${id} must have exactly one answer`);
  return {
    id,
    domain: question.domain,
    level: question.difficulty.jlptLevel,
    prompt: question.prompt.text,
    promptLanguage: String(question.prompt.language).startsWith('ja') ? 'ja' : 'en',
    presentation: question.presentation,
    explanation: question.explanation,
    correctOptionId: question.correctOptionIds[0] ?? null,
    choices: options.map((option) => ({ id: option.id, text: optionLabel(option) })),
    linkedItemIds: [...new Set(linksByQuestion.get(id) ?? [])],
    stimulus: question.stimulusReferences[0] ?? null,
  };
});

const parentIds = new Set(snapshots.flatMap((exam) => exam.parentPlacements.map((parent) => parent.parentId)));
const reading = [...parentIds].flatMap((id) => passages.has(id) ? [passages.get(id)] : []);
const listening = [...parentIds].flatMap((id) => activities.has(id) ? [activities.get(id)] : []);
if (reading.length + listening.length !== parentIds.size) throw new Error('A mock parent record is missing.');

const output = {
  schemaVersion: 1,
  source: 'original-japango-phase8-mock-corpus',
  exams: snapshots.map((exam, index) => ({
    id: exam.id,
    level: exam.level,
    title: `Mock Exam ${index % 5 + 1}`,
    sections: exam.sections.map((section) => ({ id: section.id, title: section.title, order: section.order, recommendedMinutes: section.recommendedMinutes, questionPlacementIds: section.questionPlacementIds })),
    placements: exam.questionPlacements.map((placement) => ({ id: placement.id, sectionId: placement.sectionId, questionId: placement.questionId, position: placement.position, domain: placement.domain, questionType: placement.questionType, parentType: placement.parentType, parentId: placement.parentId, primaryTargetId: placement.primaryTargetId })),
    parents: exam.parentPlacements,
    timing: exam.timingRule,
  })),
  questions: packagedQuestions,
  reading,
  listening: listening.map((activity) => ({
    ...activity,
    speechText: activity.speechText ?? activity.speechNormalizedTranscript,
  })),
};
const destination = path.join(root, 'assets/mobile-curriculum/mock-exams.json');
fs.writeFileSync(destination, `${JSON.stringify(output)}\n`);
console.log(`Packaged ${output.exams.length} mocks and ${packagedQuestions.length} unique questions.`);
