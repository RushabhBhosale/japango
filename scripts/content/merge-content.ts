import { isDirectExecution, runCli } from "./lib/cli";
import { mergeGrammar } from "./merge-grammar";
import { mergeKanji } from "./merge-kanji";
import { mergeVocabulary } from "./merge-vocabulary";
import { parseContentSources } from "./parse-content";

export async function mergeContent() {
  const parsed = await parseContentSources();
  const kanji = await mergeKanji(
    parsed.kanjiMappings,
    parsed.kanjidic,
    parsed.kanjiVg,
  );
  const generatedKanji = new Set(
    [...kanji.n5, ...kanji.n4].map((record) => record.character),
  );
  const [vocabulary, grammar] = await Promise.all([
    mergeVocabulary(parsed.vocabularyMatches, generatedKanji),
    mergeGrammar(parsed.grammarCandidates, parsed.reviewedN4Grammar),
  ]);
  const vocabularyByKanji = new Map<string, string[]>();
  for (const record of [...vocabulary.n5, ...vocabulary.n4, ...vocabulary.supplemental]) {
    for (const id of record.kanjiIds) {
      vocabularyByKanji.set(id, [...(vocabularyByKanji.get(id) ?? []), record.id]);
    }
  }
  for (const record of [...kanji.n5, ...kanji.n4]) {
    record.vocabularyIds = [...new Set(vocabularyByKanji.get(record.id) ?? [])].sort();
  }
  return { parsed, vocabulary, kanji, grammar };
}

if (isDirectExecution(import.meta.url)) {
  runCli(async () => {
    const merged = await mergeContent();
    console.log(
      `Merged ${merged.vocabulary.n5.length + merged.vocabulary.n4.length} N5/N4 vocabulary, ${merged.kanji.n5.length + merged.kanji.n4.length} kanji, and ${merged.grammar.n5.length + merged.grammar.n4.length} grammar records.`,
    );
  });
}
