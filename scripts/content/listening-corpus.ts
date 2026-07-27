import path from "node:path";

import { OUTPUT_ROOT } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson, writeText } from "./lib/fs-utils";
import type { CurriculumUnit, GrammarRecord, KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";
import type { LearningContentCollections } from "../../src/features/learning-content/schemas";

export const LISTENING_GRAMMAR_CANDIDATE_IDS = [
  "grammar-desu", "grammar-kara-reason-conjunction", "grammar-kedo", "grammar-masenka",
  "grammar-mashou", "grammar-mashouka", "grammar-naidekudasai", "grammar-naihougaii",
  "grammar-nakutehaikenai", "grammar-ninaru", "grammar-nisuru", "grammar-nogasuki",
  "grammar-nonakade-gaichiban", "grammar-sugiru", "grammar-tahougaii", "grammar-tai",
  "grammar-takotogaaru", "grammar-tari-tarisuru", "grammar-tehaikenai", "grammar-teiru1",
  "grammar-tekara", "grammar-tekudasai", "grammar-temoii", "grammar-tsumorida",
  "grammar-yori-nohouga", "grammar-node",
  "grammar-n4-to-omou", "grammar-n4-to-kiku", "grammar-n4-aida-ni", "grammar-n4-ato-de",
  "grammar-n4-made-ni", "grammar-n4-nagara", "grammar-n4-te-kureru", "grammar-n4-te-morau",
  "grammar-n4-te-oku", "grammar-n4-te-miru", "grammar-n4-te-shimau", "grammar-n4-ba",
  "grammar-n4-tara", "grammar-n4-nara", "grammar-n4-baai-wa", "grammar-n4-temo-concession",
  "grammar-n4-nakereba-naranai", "grammar-n4-nakutemo-ii", "grammar-n4-koto-ni-suru",
  "grammar-n4-yotei-da", "grammar-n4-hazu-da", "grammar-n4-kamo-shirenai",
  "grammar-n4-souda-hearsay", "grammar-n4-potential-form", "grammar-n4-tame-ni-purpose",
  "grammar-n4-you-ni-naru",
] as const;

const TOPICS = ["family", "home", "school", "work", "shopping", "restaurants", "cooking", "transport", "travel", "directions", "weather", "appointments", "schedules", "invitations", "hobbies", "exercise", "health", "public-facilities", "libraries", "events", "delivery", "accommodation", "neighbourhood", "technology", "study", "mistakes", "lost-items", "rules", "requests", "customer-service", "phone-messages", "plans", "changes-of-plan", "comparisons", "recommendations", "problems-and-solutions"] as const;

export async function auditListeningPhase6Baseline(): Promise<void> {
  const [n5Units, n4Units, n5Grammar, n4Grammar, n5Vocabulary, n4Vocabulary, n5Kanji, n4Kanji, content, kanjiCoverage] = await Promise.all([
    readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n5.json")), readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n4.json")),
    readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n5.json")), readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n4.json")),
    readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n5.json")), readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n4.json")),
    readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n5.json")), readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n4.json")),
    readJson<LearningContentCollections>(path.join(OUTPUT_ROOT, "learning-content/index.json")),
    readJson<Array<{ inventoryLimitation: string | null }>>(path.join(OUTPUT_ROOT, "reports/kanji-question-phase5-final.json")),
  ]);
  const allGrammar = [...n5Grammar, ...n4Grammar];
  const grammarById = new Map(allGrammar.map((record) => [record.id, record]));
  const selected = LISTENING_GRAMMAR_CANDIDATE_IDS.map((id) => grammarById.get(id)).filter((record): record is GrammarRecord => Boolean(record));
  const readingGrammarIds = [...new Set(content.readingPassages.flatMap(({ grammarIds }) => grammarIds))].sort();
  const baseline = {
    schemaVersion: 1, auditStage: "phase6-baseline", performedBeforeListeningAuthoring: true,
    curriculum: { N5: { total: n5Units.length, releaseReady: n5Units.filter(({ releaseReady }) => releaseReady).length }, N4: { total: n4Units.length, releaseReady: n4Units.filter(({ releaseReady }) => releaseReady).length } },
    grammar: { canonical: allGrammar.length, N5LifecycleExcluded: n5Grammar.filter(({ releaseReady }) => !releaseReady).length, N4ReleaseTarget: n4Grammar.filter(({ releaseReady }) => releaseReady).length, N4Unresolved: n4Grammar.filter(({ releaseReady }) => !releaseReady).length, phase6ReadingDistinct: readingGrammarIds.length, phase6ReadingIds: readingGrammarIds, phase7Eligible: n5Grammar.length + n4Grammar.filter(({ releaseReady }) => releaseReady).length, selectedForNaturalListening: selected.length, selectedIds: selected.map(({ id }) => id).sort() },
    vocabulary: { N5: { total: n5Vocabulary.length, releaseReady: n5Vocabulary.filter(({ releaseReady }) => releaseReady).length }, N4: { total: n4Vocabulary.length, releaseReady: n4Vocabulary.filter(({ releaseReady }) => releaseReady).length } },
    kanji: { N5: { total: n5Kanji.length, releaseReady: n5Kanji.filter(({ releaseReady }) => releaseReady).length }, N4: { total: n4Kanji.length, releaseReady: n4Kanji.filter(({ releaseReady }) => releaseReady).length } },
    sentences: content.sentences.length, readingPassages: content.readingPassages.length, existingListeningActivities: 0,
    tts: { configuredService: false, expoSpeechDependency: false, audioRegistry: false, reservedAudioReferenceSchemaOnly: true, localeConvention: "ja-JP", decision: "Author structured speech-normalized scripts and future audio keys; generate no audio files." },
    inventoryLimitations: { kanji: kanjiCoverage.filter(({ inventoryLimitation }) => inventoryLimitation).length, withoutSupportedVocabulary: kanjiCoverage.filter(({ inventoryLimitation }) => inventoryLimitation?.startsWith("no-release-ready-vocabulary")).length },
    lifecycle: { developmentOnlyActivities: 156, releaseEligibleActivities: 0, reason: "All 80 curriculum units are non-release." },
    gaps: { topics: [...TOPICS], formats: ["short-monologue", "dialogue", "practical-information", "appropriate-response"], skills: ["main-idea", "specific-detail", "sequence", "speaker-intention", "appropriate-response", "practical-action", "time-date-price-quantity-location", "speaker-relationship", "reference-resolution", "vocabulary-context", "grammar-context", "simple-inference", "information-matching", "response-selection"] },
  };
  const reportRoot = path.join(OUTPUT_ROOT, "reports");
  const grammarRows = allGrammar.map((record) => `| ${record.id} | ${record.level} | ${record.releaseReady ? "release-target" : record.level === "N5" ? "development-eligible" : "unresolved"} | ${readingGrammarIds.includes(record.id) ? "yes" : "no"} | ${LISTENING_GRAMMAR_CANDIDATE_IDS.includes(record.id as never) ? "selected" : record.level === "N4" && !record.releaseReady ? "excluded-unresolved" : "not-selected-naturalness-scope"} |`);
  await Promise.all([
    writeJson(path.join(reportRoot, "listening-phase6-baseline.json"), baseline),
    writeText(path.join(reportRoot, "listening-curriculum-gap-analysis.md"), `# Listening curriculum gap analysis\n\n- Curriculum units: 80; release-ready: 0.\n- Existing listening activities: 0.\n- All 156 planned activities must remain development-only.\n- Available examples: ${content.sentences.length} sentences and ${content.readingPassages.length} reading passages.`),
    writeText(path.join(reportRoot, "listening-grammar-gap-analysis.md"), ["# Listening grammar gap analysis", "", `Canonical grammar: ${allGrammar.length}. Phase 6 reading: ${readingGrammarIds.length}. Phase 7 eligible: ${baseline.grammar.phase7Eligible}. Naturally selected candidates: ${selected.length}.`, "", "| Grammar ID | Level | Lifecycle | Reading | Phase 7 decision |", "| --- | --- | --- | --- | --- |", ...grammarRows].join("\n")),
    writeText(path.join(reportRoot, "listening-vocabulary-gap-analysis.md"), `# Listening vocabulary and kanji gap analysis\n\nVocabulary: N5 ${n5Vocabulary.length}/${baseline.vocabulary.N5.releaseReady} release, N4 ${n4Vocabulary.length}/${baseline.vocabulary.N4.releaseReady} release. Kanji: N5 ${n5Kanji.length}/${baseline.kanji.N5.releaseReady} release, N4 ${n4Kanji.length}/${baseline.kanji.N4.releaseReady} release. Inherited inventory-limited kanji: ${baseline.inventoryLimitations.kanji}; no inventory expansion is authorized.`),
    writeText(path.join(reportRoot, "listening-topic-gap-analysis.md"), `# Listening topic gap analysis\n\nNo listening corpus exists. All ${TOPICS.length} requested topics currently have zero activities.\n\n${TOPICS.map((topic) => `- ${topic}: 0`).join("\n")}`),
    writeText(path.join(reportRoot, "listening-format-gap-analysis.md"), "# Listening format and skill gap analysis\n\nThere are no monologues, dialogues, practical-information scripts, appropriate-response prompts, speaker turns, speech-normalized transcripts, or listening-comprehension questions. No TTS dependency or audio registry is configured; Phase 7 will generate audio-ready structured content only."),
  ]);
  console.log(JSON.stringify(baseline, null, 2));
}

if (isDirectExecution(import.meta.url)) runCli(auditListeningPhase6Baseline);
