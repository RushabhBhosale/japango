# Listening content pipeline

Phase 7 adds JapanGo's original JLPT N5/N4-aligned listening script and listening-comprehension corpus to the shared, versioned learning-content model.

Each script is stored once as a listening activity. Questions reference its stable activity ID, while derived quiz, review, study, and question views control when transcripts, translations, glossary help, and correct answers become visible. Ordered turns store display Japanese, kana pronunciation, English support, pauses, and fictional speaker metadata. Playback records reserve deterministic future audio keys, but Phase 7 creates no audio files because the repository has no deterministic TTS generation service.

Run the stages in this order:

```sh
npm run content:listening:audit
npm run content:listening:author
npm run content:build
npm run content:listening:validate
npm run content:sentences:sqlite
```

The canonical source is under `assets/docs-reference/japango-listening/`. Generated activities, transcripts, questions, options, speakers, views, review queues, and reports are under `assets/generated-content/`.

All 80 curriculum units remain non-release, so the 156 activities and 456 questions are approved-quality development content and are excluded from the release compact bundle. SQLite migration v5 adds normalized speakers, activities, turns, transcripts, relationships, question targets, and the four listening views. Verification imports parents before children and checks foreign keys, transactions, checksum identity, lifecycle separation, and checksum-identical rerun skipping.
