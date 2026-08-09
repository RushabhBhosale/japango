# JapanGo story episode curriculum

## Scope

The V3 story course now contains Episode 1 plus 50 new episodes:

- Episodes 2–26: 25 N5 episodes
- Episodes 27–51: 25 N4 episodes
- Every resolved canonical grammar record is assigned to an episode: 124 N5 and 111 N4 records.
- The two unresolved N4 records (`～おきに` and `は～が…は`) remain excluded instead of being taught as settled facts.

The story examples and translations are original JapanGo writing. Textbook OCR and JLPT paper OCR are used to check progression, coverage, and question shape; source exercises are not copied into the episodes.

## Depth model

Episode 1 remains the introductory experience. Every later episode is deliberately more demanding:

1. Story setup and natural dialogue
2. Listening-enabled comprehension check
3. Focused guide for the first grammar family: function, formation, contrast, and common trap
4. Eight interactive retrievals for that family
5. Story beat using the model naturally
6. Focused guide and eight retrievals for the second family
7. Eight corpus-backed questions for **each canonical grammar record** assigned to the episode
8. Guided sentence production
9. Story continuation
10. JLPT-style contextual check
11. Completion and next-episode handoff

The generated compact practice bank contains 1,880 grammar questions (eight for each of 235 resolved N5/N4 grammar records) and 816 reviewed original JapanGo sentences. The two story-family ladders add another 800 interactions across the 50 episodes.

## Progression

### N5 arc — Episodes 2–26

The N5 story moves from locating Yuki in Shinjuku through cafés, introductions, schedules, a museum, dinner, shopping, and an integrated N5 rehearsal. The progression covers:

- demonstratives and question words;
- core particles, existence, and movement;
- invitations and verb conjugation;
- i- and na-adjectives;
- preferences, skill, comparison, and superlatives;
- te-form sequencing, requests, permission, prohibition, and ongoing states;
- before/after, desire, intentions, experience, reasons, and explanations;
- giving/receiving, obligation, advice, already/not-yet, limits, nominalization, relative clauses, and quotation;
- N5 vocabulary, kanji reading, grammar cloze, sentence ordering, short reading, information retrieval, listening-style comprehension, and appropriate-response tasks.

### N4 arc — Episodes 27–51

The N4 story follows apartment hunting, moving, workplace situations, a dinner party, and an integrated N4 rehearsal. The progression covers:

- nominalization, focused clauses, reporting, and embedded questions;
- time spans, deadlines, benefactive actions, and polite requests;
- aspect, preparation, result states, and action phases;
- conditionals, concession, advice, obligations, decisions, and schedules;
- expectation, uncertainty, hearsay, appearance, and inference;
- potential, passive, causative, causative-passive, and transitivity;
- purpose, gradual change, limits, examples, senses, outward feelings, ease/difficulty, and nuanced contrast;
- respectful, humble, and formal language;
- N4 word use, grammar contrast, star/sentence ordering, practical notices, short/medium reading, information retrieval, listening-style tasks, and quick responses.

## Furigana policy

Authored episode strings use explicit markup such as `新宿[しんじゅく]`. The parser throws during catalogue construction if any kanji remains in an unannotated plain segment. Corpus-backed practice sentences are aligned with their reviewed phonetic readings and stored as word-level reading-bearing tokens. Automated tests scan all episode scenes and fail if any kanji has no attached reading or a sentence-wide reading token is introduced.

## Sources used for alignment

- OCR of Genki I and II
- OCR of Minna no Nihongo I and II grammar/textbook material
- OCR audits of official N5/N4 workbooks and past-paper collections
- JapanGo canonical N5 and reviewed N4 grammar datasets
- JapanGo original grammar sentence and question corpora
- The JLPT question-paper corpus audit in `docs/jlpt-question-corpus-audit.md`

The reproducible compact bank is generated with:

```sh
npm run content:episodes
```
