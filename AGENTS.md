Below is an AGENTS.md tailored for the JapanGo Expo app.

AGENTS.md

Project Overview

JapanGo is an Android-first Japanese learning application built with Expo and React Native.

The app is designed to help learners:

- Review JLPT N5 concepts
- Progress through the JLPT N4 syllabus
- Improve reading, listening, grammar, vocabulary, and kanji
- Learn through adaptive lessons and continuing stories
- Practise while working, walking, or travelling
- Use Bluetooth media or keyboard remotes during listening sessions

The application should behave like a structured personal Japanese tutor rather than a simple flashcard app.

⸻

Primary Goals

1. Help the learner recover forgotten JLPT N5 knowledge.
2. Teach the important JLPT N4 curriculum progressively.
3. Track individual weaknesses across grammar, vocabulary, kanji, reading, and listening.
4. Generate lessons based on weak and overdue learning items.
5. Provide engaging story-based listening sessions.
6. Work offline for downloaded lessons.
7. Keep AI usage inexpensive and optional.
8. Avoid depending on AI for curriculum accuracy or progress calculation.

⸻

Technology Stack

Use the following stack unless the existing project already uses an equivalent library.

Mobile application

- Expo
- React Native
- TypeScript
- Expo Router
- Zustand
- Zod
- expo-sqlite
- expo-speech
- expo-audio
- Expo Notifications

Backend

- Next.js App Router
- Next.js route handlers
- Supabase PostgreSQL
- Supabase Authentication
- Vercel
- Zod validation

AI

Use a configurable AI provider through the backend.

Possible providers include:

- OpenRouter
- Groq
- Google Gemini
- Other free-tier or low-cost APIs

Never call an AI provider directly from the mobile application.

All provider API keys must remain on the backend.

⸻

Architecture Principles

The app owns the learning logic

The application must calculate:

- Mastery
- Weakness
- Review dates
- Spaced-repetition intervals
- Reading performance
- Listening performance
- Response accuracy
- Response time
- Frequently confused items

AI must not decide whether a learning item is mastered.

AI may only help generate:

- Stories
- Dialogues
- Example sentences
- Explanations
- Question wording
- Alternative exercises

Curriculum data is authoritative

Grammar, vocabulary, kanji, readings, and meanings must come from the application’s curated curriculum database.

AI-generated content must be validated against this database before being shown to the user.

Generate complete lessons

Do not call AI after every sentence, button press, or listening interaction.

The expected flow is:

Select weak learning items
↓
Generate complete lesson
↓
Validate structured output
↓
Save lesson
↓
Download to device
↓
Play offline

⸻

Project Structure

Prefer the following structure:

app/
├── (tabs)/
│ ├── index.tsx
│ ├── learn.tsx
│ ├── listen.tsx
│ ├── review.tsx
│ └── progress.tsx
├── lesson/
│ └── [lessonId].tsx
├── listening/
│ └── [episodeId].tsx
├── assessment/
│ └── index.tsx
├── settings/
│ └── index.tsx
└── \_layout.tsx
src/
├── components/
│ ├── common/
│ ├── lesson/
│ ├── listening/
│ ├── quiz/
│ └── progress/
├── features/
│ ├── assessment/
│ ├── curriculum/
│ ├── lessons/
│ ├── listening/
│ ├── progress/
│ ├── review/
│ └── settings/
├── hooks/
├── services/
│ ├── api/
│ ├── audio/
│ ├── database/
│ ├── remote/
│ └── speech/
├── store/
├── types/
├── utils/
└── constants/

Keep business logic outside screen components.

Screens should coordinate features but should not contain large data-processing functions.

⸻

Coding Standards

TypeScript

- Use TypeScript for all application code.
- Do not use any unless there is no reasonable alternative.
- Prefer unknown followed by validation.
- Define domain types in src/types.
- Validate API responses using Zod.
- Use discriminated unions for question types and lesson blocks.

Example:

type LessonBlock =
| {
type: "story";
id: string;
japanese: string;
translation?: string;
}
| {
type: "vocabulary";
id: string;
termId: string;
word: string;
reading: string;
meaning: string;
}
| {
type: "grammar";
id: string;
grammarId: string;
explanation: string;
}
| {
type: "question";
id: string;
question: LessonQuestion;
};

Components

- Prefer small, focused components.
- Avoid components larger than approximately 250 lines.
- Extract repeated layouts and logic.
- Use descriptive component names.
- Keep state close to where it is used.
- Avoid unnecessary global state.

Functions

- Prefer pure functions for scoring and learning calculations.
- Use early returns.
- Avoid deeply nested conditions.
- Name functions according to intent.
- Keep side effects inside services or hooks.

Styling

- Follow the styling system already present in the project.
- Maintain consistent spacing, typography, radius, and colours.
- Do not add a second styling framework without a strong reason.
- Support small Android screens.
- Respect system font scaling.
- Ensure touch targets are at least 44 by 44 points where practical.

⸻

Data Model

The local and remote data models should support the following entities.

Curriculum item

type CurriculumItemType =
| "vocabulary"
| "grammar"
| "kanji"
| "reading"
| "listening";
type CurriculumLevel = "N5" | "N4";
interface CurriculumItem {
id: string;
type: CurriculumItemType;
level: CurriculumLevel;
title: string;
meaning?: string;
reading?: string;
explanation?: string;
tags: string[];
}

User mastery

interface UserMastery {
userId: string;
itemId: string;
masteryScore: number;
confidenceScore: number;
correctCount: number;
incorrectCount: number;
averageResponseTimeMs: number;
lastReviewedAt?: string;
nextReviewAt?: string;
reviewIntervalDays: number;
status: "new" | "learning" | "weak" | "review" | "mastered";
}

Attempt

interface LearningAttempt {
id: string;
userId: string;
itemId: string;
lessonId: string;
mode: "reading" | "listening" | "quiz" | "assessment";
correct: boolean;
responseTimeMs: number;
selectedAnswer?: string;
expectedAnswer?: string;
createdAt: string;
}

Lesson

interface GeneratedLesson {
id: string;
level: CurriculumLevel;
title: string;
mode: "reading" | "listening" | "mixed";
targetItemIds: string[];
blocks: LessonBlock[];
estimatedMinutes: number;
generatedAt: string;
validationStatus: "pending" | "valid" | "invalid";
}

⸻

Learning Engine

The learning engine must be deterministic and testable.

Do not place mastery logic inside React components.

Item categories

Every learning item should be classified as:

- New
- Weak
- Due for review
- Strong
- Mastered

Suggested lesson balance

During N5 recovery:

- 50% weak N5 material
- 30% due N5 reviews
- 20% new or introductory N4 material

During regular N4 learning:

- 45% weak material
- 25% due reviews
- 20% new N4 material
- 10% previously mastered material

These percentages are guidelines and may be adjusted based on performance.

Weakness calculation

A weakness score may consider:

- Incorrect answer count
- Consecutive mistakes
- Slow response time
- Overdue review time
- Listening failures
- Reading failures
- Confusion with similar items

Keep the calculation documented and covered by unit tests.

Example conceptual formula:

weakness =
incorrectWeight

- responseTimeWeight
- overdueWeight
- confusionWeight

* masteryWeight

Do not allow AI to produce this value.

⸻

Grammar Learning Flow

Every grammar pattern should progress through:

1. Short explanation
2. Recognition
3. Fill-in-the-blank
4. Sentence meaning
5. Sentence ordering
6. Comparison with similar grammar
7. Reading-context usage
8. Listening-context usage
9. Timed JLPT-style question
10. Spaced review

A grammar point should not be marked mastered after only one correct answer.

Mastery requires repeated success across multiple exercise types.

⸻

Vocabulary and Kanji Flow

Vocabulary exercises may include:

- Japanese to meaning
- Meaning to Japanese
- Kanji reading
- Choose the correct kanji
- Listening recognition
- Correct sentence usage
- Confusing-word comparison

Kanji exercises may include:

- Meaning recognition
- Reading recognition
- Vocabulary containing the kanji
- Visual component or radical hints
- Reading in context

Avoid testing isolated kanji readings without context too frequently.

⸻

Reading Mode

Reading difficulty should progress through:

1. One short sentence
2. Two connected sentences
3. Short messages
4. Notices and signs
5. Small stories
6. Schedules and advertisements
7. Longer passages
8. Timed JLPT-style reading

Track:

- Accuracy
- Time spent
- Unknown words opened
- Translation usage
- Reading completion
- Question performance

Do not display translations by default during normal reading practice.

Translations may be revealed when requested.

⸻

Listening Mode

Listening mode is a major feature.

It should support hands-free or low-interaction use while:

- Working
- Travelling
- Walking
- Exercising

Listening lesson structure

Story segment
↓
Optional vocabulary explanation
↓
Story continuation
↓
Optional grammar explanation
↓
Question
↓
Answer and continuation

Content principles

- Use continuing storylines.
- Keep explanations short.
- Repeat target vocabulary naturally.
- Avoid explaining every word.
- Prioritise weak and new items.
- Make questions understandable without reading the screen.

Remote controls

The remote input service should support configurable actions such as:

Previous
Next
Confirm
Repeat
Skip explanation
Mark difficult
Pause or resume

Do not hard-code one Bluetooth remote model.

Many remotes appear as keyboard or media-key devices.

Create a mapping layer that converts platform key events into application actions.

Example:

type RemoteAction =
| "previous"
| "next"
| "confirm"
| "repeat"
| "skip"
| "mark-difficult"
| "toggle-playback";

The listening player must also remain fully usable through touch controls.

⸻

Text-to-Speech and Audio

- Prefer Japanese system voices where available.
- Allow the learner to change speech speed.
- Support replaying individual sentences.
- Cache generated audio when practical.
- Do not start multiple speech instances simultaneously.
- Stop speech when leaving the listening screen.
- Handle audio interruptions from calls and other media.
- Restore lesson position after interruptions.

Store listening progress after every meaningful segment.

⸻

AI Integration

Backend-only requests

All AI requests must go through the backend.

Never expose:

- AI API keys
- Supabase service-role keys
- Private prompts
- Administrative tokens

Required structured output

AI responses should be JSON and validated using Zod.

Example:

const generatedLessonSchema = z.object({
title: z.string().min(1),
level: z.enum(["N5", "N4"]),
mode: z.enum(["reading", "listening", "mixed"]),
targetItemIds: z.array(z.string()),
blocks: z.array(lessonBlockSchema),
estimatedMinutes: z.number().positive(),
});

Reject malformed or unsafe output.

Do not silently accept partially valid data.

AI prompt inputs

Send only the necessary context:

- Learner level
- Selected weak items
- Selected due items
- Allowed grammar
- Allowed vocabulary
- Story context
- Required output schema
- Difficulty constraints

Do not send the learner’s full history when a smaller summary is sufficient.

Validation

Before saving generated content:

- Verify target item IDs exist.
- Verify Japanese readings against the curriculum.
- Verify answer options contain one valid answer.
- Verify the correct answer matches the question.
- Ensure explanations do not introduce unsupported grammar.
- Ensure the lesson difficulty matches the requested level.
- Reject duplicate question IDs.
- Reject empty story segments.
- Reject hallucinated curriculum references.

If validation fails, return a controlled error or regenerate once with correction context.

Avoid unlimited retries.

⸻

Offline Support

The app should remain useful without an internet connection.

Store locally:

- Curriculum required for active lessons
- Downloaded lessons
- Lesson progress
- Attempts waiting to sync
- Review schedule
- User settings
- Story progress

Use an offline-first approach:

Write locally
↓
Update UI immediately
↓
Queue remote sync
↓
Retry when online

Do not block lesson completion because the server is unavailable.

Use stable client-generated IDs for offline attempts.

⸻

Sync Rules

- Sync attempts in batches.
- Make sync operations idempotent.
- Avoid creating duplicate attempts.
- Use timestamps in ISO 8601 format.
- Record the last successful sync.
- Preserve unsynced data after app restarts.
- Resolve conflicts using explicit rules rather than silent overwrites.

Progress calculations should produce the same result when the same attempt is processed more than once.

⸻

Authentication

Authentication should not block early local learning unless account sync is required.

Recommended flow:

- Allow local onboarding and assessment.
- Ask users to create an account when enabling backup or cross-device sync.
- Support guest-to-account migration.
- Never discard guest progress during registration.

⸻

Privacy

This application may store learning progress and usage analytics.

It should not collect unnecessary personal information.

Requirements:

- Explain what data is collected.
- Explain whether AI providers receive lesson-generation context.
- Avoid sending personally identifying information to AI providers.
- Provide account deletion where accounts are supported.
- Provide progress-data deletion.
- Link to a public privacy policy.
- Keep Play Store Data Safety declarations consistent with actual behaviour.

Do not add analytics or advertising SDKs without documenting their data collection.

⸻

Error Handling

Never show raw technical errors directly to users.

Use clear user-facing messages.

Examples:

The lesson could not be downloaded. Your saved lessons are still available.
Audio playback was interrupted. Tap resume to continue.
Your progress was saved on this device and will sync later.

Log enough technical context for debugging without logging:

- Authentication tokens
- Full AI prompts containing user data
- Private API keys
- Sensitive account information

⸻

Performance

- Avoid rerendering an entire lesson when one answer changes.
- Use list virtualization for long lists.
- Load audio lazily.
- Cache curriculum lookups.
- Avoid expensive calculations during render.
- Memoise only when measurements show value.
- Keep initial app startup lightweight.
- Do not load the entire curriculum into memory unless necessary.

⸻

Accessibility

- Add accessibility labels to buttons and interactive controls.
- Support font scaling.
- Maintain readable contrast.
- Do not rely only on colour to indicate correct or incorrect answers.
- Provide visible playback state.
- Ensure listening controls work with screen readers.
- Provide transcripts for listening lessons.

⸻

Testing Requirements

Unit tests

Prioritise tests for:

- Weakness scoring
- Mastery updates
- Review scheduling
- Lesson item selection
- Attempt processing
- Sync deduplication
- AI-response validation
- Remote action mapping

Integration tests

Test:

- Lesson completion
- Offline lesson completion
- Reconnection and sync
- Assessment-to-learning-plan flow
- Listening playback interruption
- Invalid AI output
- Guest-to-account migration

Manual testing

Verify on a physical Android device:

- Bluetooth remote input
- Background and interrupted audio
- Japanese TTS availability
- Offline startup
- Low-memory behaviour
- Small-screen layout
- App restart during a lesson

⸻

Agent Behaviour

When modifying this repository:

1. Inspect the existing architecture before adding dependencies.
2. Preserve working functionality.
3. Prefer small, reviewable changes.
4. Do not rewrite unrelated files.
5. Do not introduce mock data into production flows.
6. Do not hard-code API URLs, secrets, user IDs, or curriculum IDs.
7. Add or update types before implementing dependent UI.
8. Add validation at external boundaries.
9. Add tests for learning-engine changes.
10. Document environment variables.
11. Run available lint, type-check, and test commands.
12. Report any checks that could not be run.

⸻

Dependency Rules

Before adding a dependency:

- Check whether Expo supports it.
- Check whether the project already has equivalent functionality.
- Prefer maintained libraries.
- Avoid libraries requiring native changes unless necessary.
- For native libraries, confirm compatibility with the current Expo SDK.
- Use an Expo development build when native modules are required.

Do not assume Expo Go supports custom native modules.

⸻

Environment Variables

Public Expo variables must use:

EXPO*PUBLIC*

Only non-secret values may use this prefix.

Example:

EXPO_PUBLIC_API_BASE_URL=

Secrets must remain in the Next.js backend.

Example backend variables:

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AI_PROVIDER_API_KEY=
AI_PROVIDER_MODEL=

Never commit .env files containing secrets.

Maintain an .env.example file with empty values and descriptions.

⸻

API Conventions

Use predictable endpoints.

Suggested endpoints:

POST /api/assessment/start
POST /api/assessment/submit
GET /api/curriculum
GET /api/progress
POST /api/progress/sync
POST /api/lessons/generate
GET /api/lessons/:id
POST /api/lessons/:id/complete
GET /api/reviews/due
POST /api/attempts/batch

API responses should follow a consistent shape.

Success:

{
"success": true,
"data": {}
}

Failure:

{
"success": false,
"error": {
"code": "LESSON_GENERATION_FAILED",
"message": "The lesson could not be generated."
}
}

Do not expose stack traces in production responses.

⸻

UI Principles

The app should feel calm, focused, and encouraging.

Avoid:

- Excessive gamification
- Distracting animations
- Too many badges
- Large blocks of explanation
- Overloaded dashboards
- Interrupting listening sessions unnecessarily

Prioritise:

- Clear daily action
- Visible progress
- Simple lesson flow
- Large listening controls
- Quick review access
- Easy replay
- Clear weak-item indicators

The home screen should answer:

What should I study now?
How long will it take?
What am I improving?

⸻

Initial Development Priorities

Build features in this order:

1. Project navigation and design foundation
2. Local SQLite database
3. Curriculum data model
4. Initial N5 assessment
5. Basic lesson engine
6. Vocabulary and grammar questions
7. Progress and mastery tracking
8. Reading lessons
9. Listening player
10. Japanese text-to-speech
11. Offline lesson storage
12. Backend sync
13. AI lesson generation
14. AI validation pipeline
15. Bluetooth remote support
16. N4 curriculum expansion
17. Mock exam mode

Do not begin with advanced AI generation before the deterministic learning engine works.

⸻

Definition of Done

A feature is complete when:

- It works on a physical Android device.
- TypeScript passes without unexplained errors.
- External data is validated.
- Loading, empty, offline, and error states are handled.
- Relevant progress is persisted.
- No secrets are exposed.
- Existing functionality continues to work.
- Important business logic has tests.
- The change is documented where necessary.

Place this file at the Expo project root:

JapanGo/
├── AGENTS.md
├── app.json
├── package.json
└── app/

The first development milestone should be the local curriculum, assessment, and progress engine, before connecting the AI model.
