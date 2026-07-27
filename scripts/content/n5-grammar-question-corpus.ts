import { z } from "zod";
import { learningContentCollectionsSchema, learningItemMetadataSchema, questionOptionSchema, questionSchema, questionTargetRelationshipSchema, type LearningContentCollections } from "../../src/features/learning-content/schemas";
import { SOURCE_PATHS } from "./config";
import { readJson } from "./lib/fs-utils";

const corpusSchema = z.object({ schemaVersion: z.literal(1), fixedTimestamp: z.literal("2026-07-27T00:00:00.000Z"), questions: z.array(questionSchema), questionOptions: z.array(questionOptionSchema), learningItemMetadata: z.array(learningItemMetadataSchema), questionTargetRelationships: z.array(questionTargetRelationshipSchema) }).strict();
const compare = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;
export async function loadN5GrammarQuestionCorpus(content: LearningContentCollections): Promise<LearningContentCollections> {
 const corpus = corpusSchema.parse(await readJson<unknown>(SOURCE_PATHS.n5GrammarQuestionCorpus));
 return learningContentCollectionsSchema.parse({ ...content, questions: [...content.questions,...corpus.questions].sort((a,b)=>compare(a.id,b.id)), questionOptions: [...content.questionOptions,...corpus.questionOptions].sort((a,b)=>compare(a.questionId,b.questionId)||a.position-b.position), learningItemMetadata: [...content.learningItemMetadata,...corpus.learningItemMetadata].sort((a,b)=>compare(a.id,b.id)), questionTargetRelationships: [...content.questionTargetRelationships,...corpus.questionTargetRelationships].sort((a,b)=>compare(a.id,b.id)) });
}
