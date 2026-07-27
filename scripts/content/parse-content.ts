import { isDirectExecution, runCli } from "./lib/cli";
import { matchJmdictVocabulary } from "./parse-jmdict";
import {
  parseGrammarSource,
  parseReviewedN4GrammarSource,
} from "./parse-grammar-source";
import { parseJlptKanji } from "./parse-jlpt-kanji";
import { parseJlptVocabulary } from "./parse-jlpt-vocabulary";
import { parseKanjidic } from "./parse-kanjidic";
import { parseKanjiVg } from "./parse-kanjivg";

export async function parseContentSources() {
  const [
    vocabularyCandidates,
    kanjiMappings,
    grammarCandidates,
    reviewedN4Grammar,
  ] =
    await Promise.all([
      parseJlptVocabulary(),
      parseJlptKanji(),
      parseGrammarSource(),
      parseReviewedN4GrammarSource(),
    ]);
  const targetKanji = new Set(kanjiMappings.map(({ character }) => character));
  const [vocabularyMatches, kanjidic, kanjiVg] = await Promise.all([
    matchJmdictVocabulary(vocabularyCandidates),
    parseKanjidic(targetKanji),
    parseKanjiVg(targetKanji),
  ]);
  return {
    vocabularyCandidates,
    vocabularyMatches,
    kanjiMappings,
    kanjidic,
    kanjiVg,
    grammarCandidates,
    reviewedN4Grammar,
  };
}

if (isDirectExecution(import.meta.url)) {
  runCli(async () => {
    const parsed = await parseContentSources();
    console.log(
      `Parsed ${parsed.vocabularyCandidates.length} N5/N4 vocabulary mappings, ${parsed.kanjiMappings.length} kanji mappings, ${parsed.grammarCandidates.length} N5 grammar mappings, and ${parsed.reviewedN4Grammar.length} reviewed N4 grammar records.`,
    );
  });
}
