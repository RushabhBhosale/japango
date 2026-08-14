const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const generated = path.join(root, 'assets/generated-content');
const levels = ['n5', 'n4'];
const allOptions = JSON.parse(fs.readFileSync(path.join(generated, 'questions/options.json'), 'utf8'));
const relationships = JSON.parse(fs.readFileSync(path.join(generated, 'questions/grammar-target-relationships.json'), 'utf8'));
const allSentences = JSON.parse(fs.readFileSync(path.join(generated, 'sentences/all.json'), 'utf8'));
const sentenceById = new Map(allSentences.map((sentence) => [sentence.id, sentence]));
const optionsByQuestionId = new Map();
const kanjiPattern = /[\u3400-\u9fff々ヶ]/u;
const readingTargetPattern = /[\u3400-\u9fff々ヶ〇0-9０-９]/u;
const punctuationPattern = /[、。！？]/u;
const wordReadings = new Map();
const kanjiReadings = new Map();

function toHiragana(value) {
  return value
    .replace(/[ァ-ヶ]/gu, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .replace(/[.\-]/gu, '');
}

function addReading(map, surface, reading) {
  if (!surface || !reading) return;
  const values = map.get(surface) ?? new Set();
  values.add(toHiragana(reading));
  map.set(surface, values);
}

for (const level of levels) {
  const vocabulary = JSON.parse(fs.readFileSync(path.join(generated, `vocabulary/${level}.json`), 'utf8'));
  const kanji = JSON.parse(fs.readFileSync(path.join(generated, `kanji/${level}.json`), 'utf8'));

  for (const entry of vocabulary) {
    for (const form of entry.writtenForms) {
      for (const reading of entry.readings) addReading(wordReadings, form.text, reading.kana);
    }
  }

  for (const entry of kanji) {
    for (const reading of [...entry.readings.on, ...entry.readings.kun, ...entry.readings.nanori]) {
      addReading(kanjiReadings, entry.character, reading);
    }
  }
}

function kanaCandidates(surface) {
  const normalized = toHiragana(surface);
  let candidates = new Set(['']);
  // Reviewed corpus readings use phonetic spellings for particles. Generate
  // both spellings at every possible position; the full-sentence alignment
  // decides which one is correct for this occurrence.
  for (const character of Array.from(normalized)) {
    const pronunciations = character === 'は'
      ? ['は', 'わ']
      : character === 'へ'
        ? ['へ', 'え']
        : character === 'を'
          ? ['を', 'お']
          : [character];
    candidates = new Set([...candidates].flatMap((prefix) => pronunciations.map((pronunciation) => `${prefix}${pronunciation}`)));
  }
  return [...candidates];
}

function wordCandidates(surface, reading, cursor) {
  if (!kanjiPattern.test(surface)) {
    return kanaCandidates(surface)
      .filter((candidate) => reading.startsWith(candidate, cursor))
      .map((value) => ({ value, score: 1 }));
  }

  const candidates = new Map();
  const addCandidate = (value, score) => {
    if (value && reading.startsWith(value, cursor)) {
      candidates.set(value, Math.max(candidates.get(value) ?? Number.NEGATIVE_INFINITY, score));
    }
  };

  for (const candidate of wordReadings.get(surface) ?? []) addCandidate(candidate, 100);

  // Segmenter separates inflected tails such as 持ち into one token. Let the
  // kanji's known reading take the kana tail, while still preferring full-word
  // dictionary readings whenever one is available.
  const inflected = /^([\u3400-\u9fff々ヶ])([ぁ-んァ-ヶー]+)$/u.exec(surface);
  if (inflected) {
    for (const kanjiReading of kanjiReadings.get(inflected[1]) ?? []) {
      addCandidate(`${kanjiReading}${toHiragana(inflected[2])}`, 60);
    }
  }

  for (const candidate of kanjiReadings.get(surface) ?? []) addCandidate(candidate, 40);

  // The corpus supplies a sentence-level reading. This bounded fallback keeps
  // every unfamiliar kanji word readable, while the alignment below makes sure
  // the remaining words still match the reviewed sentence reading exactly.
  // Prefer a plausible two-mora-per-character split when a repeated kana makes
  // more than one boundary structurally possible (本人に must not become
  // 本人[ほん] + に + 聞[んにき]).
  const targetCharacterCount = Array.from(surface).filter((character) => readingTargetPattern.test(character)).length;
  const expectedLength = Math.max(1, targetCharacterCount * 2);
  for (let length = 1; length <= 14; length += 1) {
    addCandidate(reading.slice(cursor, cursor + length), 10 - Math.abs(length - expectedLength));
  }

  return [...candidates].map(([value, score]) => ({ value, score }));
}

function tokenizeSourceSentence(japanese, reading) {
  // Sentence-level readings cannot always be divided safely at dictionary
  // word boundaries. Keep adjacent kanji/numerals together so a reading such
  // as 二回行った → にかいいった cannot be misassigned as 二回 → に and
  // 行 → かいい. Kana and punctuation remain exact alignment anchors.
  const segments = [];
  for (const character of Array.from(japanese)) {
    const requiresReading = readingTargetPattern.test(character);
    const previous = segments.at(-1);
    if (previous?.requiresReading === requiresReading) previous.surface += character;
    else segments.push({ surface: character, requiresReading });
  }
  const normalizedReading = toHiragana(reading);
  const memo = new Map();

  const align = (segmentIndex, readingIndex) => {
    const memoKey = `${segmentIndex}:${readingIndex}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    if (segmentIndex === segments.length) {
      const result = readingIndex === normalizedReading.length ? { score: 0, values: [] } : null;
      memo.set(memoKey, result);
      return result;
    }

    let best = null;
    for (const candidate of wordCandidates(segments[segmentIndex].surface, normalizedReading, readingIndex)) {
      const next = align(segmentIndex + 1, readingIndex + candidate.value.length);
      if (!next) continue;
      const score = candidate.score + next.score;
      if (!best || score > best.score) best = { score, values: [candidate.value, ...next.values] };
    }
    memo.set(memoKey, best);
    return best;
  };

  const aligned = align(0, 0);
  if (!aligned) throw new Error(`Could not align source sentence: ${japanese} (${reading})`);

  const tokens = segments.map(({ surface, requiresReading }, index) => {
    const token = { surface };
    if (requiresReading) token.reading = aligned.values[index];
    return token;
  });
  if (tokens.some((token) => readingTargetPattern.test(token.surface) && !token.reading)) {
    throw new Error(`Missing token reading in source sentence: ${japanese}`);
  }
  if (tokens.some((token) => kanjiPattern.test(token.surface) && punctuationPattern.test(token.surface))) {
    throw new Error(`Sentence-wide source token found: ${japanese}`);
  }
  return tokens;
}

for (const option of allOptions) {
  const values = optionsByQuestionId.get(option.questionId) ?? [];
  values.push(option);
  optionsByQuestionId.set(option.questionId, values);
}

const primaryGrammarByQuestionId = new Map(
  relationships
    .filter((relationship) => relationship.targetType === 'grammar' && relationship.role === 'primary')
    .map((relationship) => [relationship.questionId, relationship.targetId]),
);

const bank = { schemaVersion: 2, questionsByGrammarId: {}, sentences: {} };

function addSentence(sentence) {
  if (bank.sentences[sentence.id]) return;
  bank.sentences[sentence.id] = {
    japanese: sentence.japanese,
    reading: sentence.reading,
    english: sentence.english,
    tokens: tokenizeSourceSentence(sentence.japanese, sentence.reading),
  };
}

for (const level of levels) {
  const grammar = JSON.parse(fs.readFileSync(path.join(generated, `grammar/${level}.json`), 'utf8'));
  const grammarIds = new Set(grammar.map(({ id }) => id).filter((id) => !id.endsWith('-unresolved')));
  const questions = JSON.parse(fs.readFileSync(path.join(generated, `questions/grammar-${level}.json`), 'utf8'));

  for (const question of questions) {
    const grammarId = primaryGrammarByQuestionId.get(question.id);
    if (!grammarId || !grammarIds.has(grammarId)) continue;
    const records = bank.questionsByGrammarId[grammarId] ?? [];
    if (records.length >= 8) continue;
    const contextSentenceId = question.stimulusReferences.find(({ type }) => type === 'sentence')?.id;
    if (contextSentenceId && sentenceById.has(contextSentenceId)) {
      addSentence(sentenceById.get(contextSentenceId));
    }
    const options = (optionsByQuestionId.get(question.id) ?? [])
      .sort((left, right) => left.position - right.position)
      .map((option) => {
        if (option.content.type === 'sentence-reference') {
          const sentence = sentenceById.get(option.content.sentenceId);
          if (sentence) {
            addSentence(sentence);
          }
          return {
            id: option.id,
            sentenceId: option.content.sentenceId,
            correct: question.correctOptionIds.includes(option.id),
            feedback: option.feedback,
          };
        }
        return {
          id: option.id,
          text: option.content.text,
          correct: question.correctOptionIds.includes(option.id),
          feedback: option.feedback,
        };
      });
    records.push({
      id: question.id,
      prompt: question.prompt.text,
      explanation: question.explanation,
      contextSentenceId,
      options,
    });
    bank.questionsByGrammarId[grammarId] = records;
  }
}

for (const [grammarId, questions] of Object.entries(bank.questionsByGrammarId)) {
  if (questions.length !== 8) throw new Error(`${grammarId} has ${questions.length} practice questions; expected 8.`);
}

const output = path.join(root, 'src/features/lesson-v3/data/episode-grammar-practice.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(bank)}\n`);
console.log(`Wrote ${Object.keys(bank.questionsByGrammarId).length} grammar targets and ${Object.keys(bank.sentences).length} sentences.`);
