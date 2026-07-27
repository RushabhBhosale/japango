# Interactive Course Quality Review

This is a compact manual-review dataset for the deterministic course manifest. It is reviewed alongside `validateCourseManifest`; it does not replace the validator. “Prerequisite” means the declared prerequisite chain and verb-form dependency check passed. Vocabulary is selected by lesson keywords, then reused in recognition, recall, context, mixed practice, checkpoint, reading, and listening work.

| Review target | Minutes / interactions | Grammar or form focus | Prerequisite | Transformations | Reading / listening / checkpoint |
| --- | --- | --- | --- | --- | --- |
| Foundations 1 — Japanese sounds and greetings | 45 / 76 | `Noun は Noun です`, `か` | Start of course | 6 | 117 chars / 3 listening checks / 20 checkpoint items |
| Foundations 2 — Hiragana starts | 45 / 76 | `の`, `も` | Foundations 1 | 6 | 113 chars / 3 / 20 |
| Foundations 3 — Katakana starts | 45 / 76 | Question words, polite answers | Foundations 2 | 6 | 117 chars / 3 / 20 |
| N5 1 — Introducing yourself | 52 / 85 | `は`, `です`, `か` | Start of N5 | 6 | 123 chars / 3 / 20 |
| N5 2 — Countries and occupations | 52 / 85 | `の`, `も` | N5 1 | 6 | 113 chars / 3 / 20 |
| N5 3 — Asking simple questions workshop | 65 / 85 | Question words and polite answers | N5 2 | 6 | 113 chars / 3 / 20 |
| N5 4 — This, that, and which | 52 / 85 | `これ・それ・あれ`, `この・その・あの` | N5 3 | 6 | 112 chars / 3 / 20 |
| N5 5 — Whose is it? | 52 / 85 | Location and possession patterns | N5 4 | 6 | 113 chars / 3 / 20 |
| N5 Unit 1 review | 24 canonical questions | Unit 1 vocabulary and grammar | All three Unit 1 lessons attempted | Existing canonical question engine | Existing FSRS and mistake-notebook recording |
| N5 24 — Rules and permissions workshop | 65 / 118 | `てもいい`, `てはいけない`, て-form | N5 23 | 6 plus 32 direct conversions and 18 applications | 157 chars / 3 / 20 |
| N4 1 — Before and after | 52 / 86 | Sequence patterns, dictionary form | Start of N4 (N5 core assumed) | 6 | 301 chars / 3 / 20 |
| N4 2 — While something happens | 52 / 86 | Parallel-time patterns | N4 1 | 6 | 313 chars / 3 / 20 |
| N4 3 — Deadlines and timing workshop | 65 / 86 | Deadline and conditional support | N4 2 | 6 | 315 chars / 3 / 20 |
| N4 4 — If and when | 52 / 86 | `たら` conditional | N4 3 | 6 | 301 chars / 3 / 20 |
| N4 5 — Possibility and uncertainty | 52 / 86 | `なら` conditional and possibility | N4 4 | 6 | 316 chars / 3 / 20 |
| N4 10 — Things you can do | 52 / 86 | Potential form | N4 9 | 6 | 349 chars / 3 / 20 |
| N4 28 — Workplace passive forms | 52 / 86 | Passive form | N4 27 | 6 | 731 chars / 3 / 20 |
| N4 29 — Letting and making things happen | 52 / 86 | Causative form | N4 28 | 6 | 724 chars / 3 / 20 |
| N4 30 — Being made to do things workshop | 65 / 86 | Causative-passive form | N4 29 | 6 | late-N4 linked passage / 3 / 20 |

All reviewed lessons use the same required structure: vocabulary batches, controlled substitution, typed transformations, context reading, transcript-hidden listening with replay and slow playback, dictation, optional shadowing, production, error correction, reflection, and a mixed checkpoint. The exact authored activity order and counts are validated from the manifest in `src/features/course/course-definition.test.ts`.
